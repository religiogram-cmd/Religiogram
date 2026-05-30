import { Test, TestingModule } from '@nestjs/testing';
import { UploadsController } from './uploads.controller';
import { UploadsService } from './uploads.service';

// ── helpers ───────────────────────────────────────────────────────────────────

function fakeFile(overrides: any = {}): any {
  return {
    id:          'file-1',
    kind:        'avatar',
    url:         'https://cdn.example.com/file-1.jpg',
    contentType: 'image/jpeg',
    sizeBytes:   BigInt(1024),
    status:      'confirmed',
    createdAt:   new Date('2024-01-01'),
    ...overrides,
  };
}

const mockUploadsService = {
  createPresign: jest.fn().mockResolvedValue({ uploadUrl: 'https://s3.presigned.url/', fileId: 'file-1' }),
  confirm:       jest.fn().mockResolvedValue(fakeFile()),
  listByKind:    jest.fn().mockResolvedValue([fakeFile()]),
  getOwned:      jest.fn().mockResolvedValue(fakeFile()),
};

function fakeUser(id = 'user-1'): any { return { id }; }

const FILE_UUID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

// ── suite ─────────────────────────────────────────────────────────────────────

describe('UploadsController', () => {
  let ctrl: UploadsController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UploadsController],
      providers: [{ provide: UploadsService, useValue: mockUploadsService }],
    }).compile();

    ctrl = module.get<UploadsController>(UploadsController);
  });

  // ── presign() ──────────────────────────────────────────────────────────────

  describe('presign()', () => {
    it('delegates to uploadsService.createPresign with userId and dto', async () => {
      const dto: any = { kind: 'avatar', contentType: 'image/jpeg', sizeBytes: 1024 };
      const result = await ctrl.presign(fakeUser(), dto);
      expect(mockUploadsService.createPresign).toHaveBeenCalledWith('user-1', dto);
      expect(result.uploadUrl).toBeDefined();
    });
  });

  // ── confirm() ──────────────────────────────────────────────────────────────

  describe('confirm()', () => {
    it('delegates to uploadsService.confirm with userId and fileId', async () => {
      const dto: any = { fileId: FILE_UUID };
      const result = await ctrl.confirm(fakeUser(), dto);
      expect(mockUploadsService.confirm).toHaveBeenCalledWith('user-1', FILE_UUID);
      expect(result.id).toBe('file-1');
    });

    it('returns serialised file with numeric sizeBytes', async () => {
      const result = await ctrl.confirm(fakeUser(), { fileId: FILE_UUID } as any);
      expect(typeof result.sizeBytes).toBe('number');
      expect(result.sizeBytes).toBe(1024);
    });

    it('response contains id, kind, url, contentType, sizeBytes, status, createdAt', async () => {
      const result = await ctrl.confirm(fakeUser(), { fileId: FILE_UUID } as any);
      expect(Object.keys(result).sort()).toEqual(
        ['contentType', 'createdAt', 'id', 'kind', 'sizeBytes', 'status', 'url'],
      );
    });
  });

  // ── list() ─────────────────────────────────────────────────────────────────

  describe('list()', () => {
    it('delegates to uploadsService.listByKind with userId and kind', async () => {
      const result = await ctrl.list(fakeUser(), 'avatar' as any);
      expect(mockUploadsService.listByKind).toHaveBeenCalledWith('user-1', 'avatar');
      expect(Array.isArray(result)).toBe(true);
    });

    it('maps BigInt sizeBytes to number for each file', async () => {
      const result = await ctrl.list(fakeUser(), 'avatar' as any);
      for (const r of result) {
        expect(typeof r.sizeBytes).toBe('number');
      }
    });
  });

  // ── getOne() ───────────────────────────────────────────────────────────────

  describe('getOne()', () => {
    it('delegates to uploadsService.getOwned with userId and fileId', async () => {
      const result = await ctrl.getOne(fakeUser(), FILE_UUID);
      expect(mockUploadsService.getOwned).toHaveBeenCalledWith('user-1', FILE_UUID);
      expect(result.id).toBe('file-1');
    });

    it('returns numeric sizeBytes', async () => {
      const result = await ctrl.getOne(fakeUser(), FILE_UUID);
      expect(typeof result.sizeBytes).toBe('number');
    });
  });
});
