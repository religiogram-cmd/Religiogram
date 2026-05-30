import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { BadRequestException, NotFoundException } from '@nestjs/common';

// Mock AWS SDK before importing service
jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation(() => ({
    send: jest.fn().mockResolvedValue({ ContentLength: 5000 }),
  })),
  PutObjectCommand: jest.fn(),
  HeadObjectCommand: jest.fn(),
  DeleteObjectsCommand: jest.fn(),
}));

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn().mockResolvedValue('https://s3.example.com/presigned-url'),
}));

import { UploadsService } from './uploads.service';
import { FileKind, UserFile } from './entities/user-file.entity';

// ── stubs ─────────────────────────────────────────────────────────────────────

const USER_ID = 'user-1';
const FILE_ID  = 'file-uuid-123';

function makeFile(overrides: any = {}): UserFile {
  return {
    id:          FILE_ID,
    userId:      USER_ID,
    kind:        FileKind.profile,
    key:         `users/${USER_ID}/profile/${FILE_ID}.jpg`,
    url:         'https://cdn.example.com/some-key.jpg',
    contentType: 'image/jpeg',
    sizeBytes:   5000,
    status:      'pending',
    originalName: null,
    createdAt:   new Date(),
    ...overrides,
  } as unknown as UserFile;
}

// ── mocks ─────────────────────────────────────────────────────────────────────

const mockFilesRepo = {
  findOne: jest.fn().mockResolvedValue(null),
  find:    jest.fn().mockResolvedValue([]),
  create:  jest.fn().mockImplementation((d: any) => ({ ...makeFile(), ...d })),
  save:    jest.fn().mockImplementation((d: any) => Promise.resolve({ ...makeFile(), ...d })),
  delete:  jest.fn().mockResolvedValue({ affected: 1 }),
};

const mockConfig = {
  getOrThrow: jest.fn((key: string) => {
    const map: Record<string, string> = {
      'storage.region': 'ap-south-1',
      'storage.bucket': 'test-bucket',
    };
    if (map[key]) return map[key];
    throw new Error(`Config key ${key} not found`);
  }),
  get: jest.fn((key: string, def?: any) => {
    const map: Record<string, any> = {
      'storage.region':    'ap-south-1',
      'storage.bucket':    'test-bucket',
      'storage.cdnBase':   null,
      'app.env':           'test',
    };
    return map[key] ?? def;
  }),
};

// ── suite ─────────────────────────────────────────────────────────────────────

describe('UploadsService', () => {
  let svc: UploadsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockFilesRepo.findOne.mockResolvedValue(null);
    mockFilesRepo.find.mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UploadsService,
        { provide: getRepositoryToken(UserFile), useValue: mockFilesRepo },
        { provide: ConfigService,               useValue: mockConfig },
      ],
    }).compile();

    svc = module.get<UploadsService>(UploadsService);

    // Mock the S3 client instance so send() is controllable per-test
    (svc as any).s3 = {
      send: jest.fn().mockResolvedValue({ ContentLength: 5000 }),
    };
    (svc as any).bucket       = 'test-bucket';
    (svc as any).region       = 'ap-south-1';
    (svc as any).publicBaseUrl = null;
  });

  // ── createPresign ──────────────────────────────────────────────────────────

  describe('createPresign()', () => {
    const validDto = {
      kind:        'profile' as FileKind,
      contentType: 'image/jpeg',
      sizeBytes:   1024,
    };

    it('creates a pending DB row and returns presigned URL data', async () => {
      const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
      getSignedUrl.mockResolvedValueOnce('https://s3.example.com/signed');

      const result = await svc.createPresign(USER_ID, validDto);

      expect(mockFilesRepo.save).toHaveBeenCalled();
      expect(result.uploadUrl).toBe('https://s3.example.com/signed');
      expect(result.expiresIn).toBe(300);
      expect(result.headers['Content-Type']).toBe('image/jpeg');
    });

    it('throws BadRequestException for file exceeding size limit', async () => {
      await expect(
        svc.createPresign(USER_ID, { ...validDto, sizeBytes: 10 * 1024 * 1024 + 1 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException for disallowed content type', async () => {
      await expect(
        svc.createPresign(USER_ID, { ...validDto, contentType: 'image/gif' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException for unsupported kind', async () => {
      await expect(
        svc.createPresign(USER_ID, { ...validDto, kind: 'video' as any }),
      ).rejects.toThrow(BadRequestException);
    });

    it('normalises contentType to lowercase', async () => {
      const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
      getSignedUrl.mockResolvedValueOnce('https://s3.example.com/signed');

      await svc.createPresign(USER_ID, { ...validDto, contentType: 'IMAGE/JPEG' });

      expect(mockFilesRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ contentType: 'image/jpeg' }),
      );
    });

    it('accepts PDF for document kind', async () => {
      const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
      getSignedUrl.mockResolvedValueOnce('https://s3.example.com/signed');

      await expect(
        svc.createPresign(USER_ID, {
          kind:        'document' as FileKind,
          contentType: 'application/pdf',
          sizeBytes:   1024,
        }),
      ).resolves.not.toThrow();
    });

    it('key includes userId and kind folder', async () => {
      const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
      getSignedUrl.mockResolvedValueOnce('https://s3.example.com/signed');

      const result = await svc.createPresign(USER_ID, validDto);
      expect(result.key).toContain(`users/${USER_ID}/profile/`);
      expect(result.key).toEndWith('.jpg');
    });
  });

  // ── confirm ────────────────────────────────────────────────────────────────

  describe('confirm()', () => {
    it('throws NotFoundException when file record not found', async () => {
      mockFilesRepo.findOne.mockResolvedValueOnce(null);
      await expect(svc.confirm(USER_ID, FILE_ID)).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException (not 403) when file belongs to another user', async () => {
      mockFilesRepo.findOne.mockResolvedValueOnce(makeFile({ userId: 'other-user' }));
      await expect(svc.confirm(USER_ID, FILE_ID)).rejects.toThrow(NotFoundException);
    });

    it('returns existing row without calling S3 when already confirmed', async () => {
      const confirmedFile = makeFile({ status: 'confirmed' });
      mockFilesRepo.findOne.mockResolvedValueOnce(confirmedFile);

      const result = await svc.confirm(USER_ID, FILE_ID);

      expect((svc as any).s3.send).not.toHaveBeenCalled();
      expect(result.status).toBe('confirmed');
    });

    it('flips status to confirmed when S3 HEAD succeeds', async () => {
      mockFilesRepo.findOne.mockResolvedValueOnce(makeFile({ status: 'pending' }));
      (svc as any).s3.send.mockResolvedValueOnce({ ContentLength: 5000 });

      const result = await svc.confirm(USER_ID, FILE_ID);
      expect(mockFilesRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'confirmed' }),
      );
    });

    it('throws BadRequestException when S3 HEAD fails (object missing)', async () => {
      mockFilesRepo.findOne.mockResolvedValueOnce(makeFile({ status: 'pending' }));
      (svc as any).s3.send.mockRejectedValueOnce(new Error('NoSuchKey'));

      await expect(svc.confirm(USER_ID, FILE_ID)).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when S3 size does not match declared size', async () => {
      mockFilesRepo.findOne.mockResolvedValueOnce(makeFile({ sizeBytes: 5000 }));
      (svc as any).s3.send.mockResolvedValueOnce({ ContentLength: 9999 });

      await expect(svc.confirm(USER_ID, FILE_ID)).rejects.toThrow(BadRequestException);
    });
  });

  // ── listByKind ─────────────────────────────────────────────────────────────

  describe('listByKind()', () => {
    it('returns confirmed files for the given kind', async () => {
      mockFilesRepo.find.mockResolvedValueOnce([makeFile({ status: 'confirmed' })]);
      const result = await svc.listByKind(USER_ID, FileKind.profile);
      expect(mockFilesRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: USER_ID, kind: FileKind.profile, status: 'confirmed' },
        }),
      );
      expect(result).toHaveLength(1);
    });
  });

  // ── getOwned ───────────────────────────────────────────────────────────────

  describe('getOwned()', () => {
    it('returns the file when found and owned', async () => {
      mockFilesRepo.findOne.mockResolvedValueOnce(makeFile());
      const result = await svc.getOwned(USER_ID, FILE_ID);
      expect(result.id).toBe(FILE_ID);
    });

    it('throws NotFoundException when file not found', async () => {
      mockFilesRepo.findOne.mockResolvedValueOnce(null);
      await expect(svc.getOwned(USER_ID, FILE_ID)).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when owned by another user', async () => {
      mockFilesRepo.findOne.mockResolvedValueOnce(makeFile({ userId: 'other-user' }));
      await expect(svc.getOwned(USER_ID, FILE_ID)).rejects.toThrow(NotFoundException);
    });
  });

  // ── sweepExpired ───────────────────────────────────────────────────────────

  describe('sweepExpired()', () => {
    it('returns zero counts when no expired rows exist', async () => {
      mockFilesRepo.find.mockResolvedValueOnce([]);
      const result = await svc.sweepExpired();
      expect(result).toEqual({ rowsFound: 0, s3Deleted: 0, dbDeleted: 0 });
    });

    it('deletes S3 objects and DB rows for expired pending uploads', async () => {
      const pendingFiles = [makeFile(), makeFile({ id: 'file-2', key: 'users/user-1/profile/file-2.jpg' })];
      mockFilesRepo.find.mockResolvedValueOnce(pendingFiles);
      (svc as any).s3.send.mockResolvedValueOnce({ Errors: [] }); // all deleted

      const result = await svc.sweepExpired();

      expect((svc as any).s3.send).toHaveBeenCalled();
      expect(mockFilesRepo.delete).toHaveBeenCalled();
      expect(result.rowsFound).toBe(2);
      expect(result.s3Deleted).toBe(2);
      expect(result.dbDeleted).toBe(2);
    });

    it('skips DB delete for S3 objects that failed to delete', async () => {
      const file1 = makeFile({ id: 'file-1', key: 'users/user-1/profile/file-1.jpg' });
      const file2 = makeFile({ id: 'file-2', key: 'users/user-1/profile/file-2.jpg' });
      mockFilesRepo.find.mockResolvedValueOnce([file1, file2]);
      // S3 reports file-2 as failed
      (svc as any).s3.send.mockResolvedValueOnce({
        Errors: [{ Key: 'users/user-1/profile/file-2.jpg' }],
      });

      const result = await svc.sweepExpired();
      expect(result.s3Deleted).toBe(1);
      expect(result.dbDeleted).toBe(1);
    });
  });

  // ── getThumbnailUrl ────────────────────────────────────────────────────────

  describe('getThumbnailUrl()', () => {
    it('builds thumbnail key for supported size', () => {
      const url = svc.getThumbnailUrl('users/abc/profile/def.jpg', 200);
      expect(url).toContain('thumbnails/200/users/abc/profile/def.webp');
    });

    it('falls back to original URL for unsupported size', () => {
      const url = svc.getThumbnailUrl('users/abc/profile/def.jpg', 999 as any);
      expect(url).toContain('users/abc/profile/def.jpg');
    });

    it('uses CDN base URL when set', () => {
      (svc as any).publicBaseUrl = 'https://cdn.example.com';
      const url = svc.getThumbnailUrl('users/abc/profile/def.jpg', 200);
      expect(url).toStartWith('https://cdn.example.com/');
    });
  });
});
