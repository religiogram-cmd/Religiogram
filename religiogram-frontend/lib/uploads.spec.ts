/**
 * Tests for lib/uploads.ts
 *
 * uploadFile is the main function — three-step flow:
 *   1. POST /uploads/presign  (fetch mock)
 *   2. PUT  signedUrl         (XMLHttpRequest mock)
 *   3. POST /uploads/confirm  (fetch mock)
 *
 * UploadError is also tested for constructor correctness.
 * XHR is mocked as a class to intercept the PUT step.
 */

import { uploadFile, UploadError } from './uploads';

// ── UploadError ───────────────────────────────────────────────────────────────

describe('UploadError', () => {
  it('stores code and message', () => {
    const e = new UploadError('NETWORK_ERROR', 'Connection lost');
    expect(e.code).toBe('NETWORK_ERROR');
    expect(e.message).toBe('Connection lost');
    expect(e.name).toBe('UploadError');
    expect(e).toBeInstanceOf(Error);
  });
});

// ── XHR mock ──────────────────────────────────────────────────────────────────

function makeXhrMock(statusCode: number) {
  const xhrInstance: any = {
    open: jest.fn(),
    setRequestHeader: jest.fn(),
    send: jest.fn(),
    upload: { onprogress: null },
    onload: null as (() => void) | null,
    onerror: null as (() => void) | null,
    status: statusCode,
    abort: jest.fn(),
  };

  // Trigger onload asynchronously after send() is called
  xhrInstance.send.mockImplementation(() => {
    setTimeout(() => { if (xhrInstance.onload) xhrInstance.onload(); }, 0);
  });

  (globalThis as any).XMLHttpRequest = jest.fn(() => xhrInstance);
  return xhrInstance;
}

function makeXhrError() {
  const xhrInstance: any = {
    open: jest.fn(),
    setRequestHeader: jest.fn(),
    send: jest.fn(),
    upload: { onprogress: null },
    onload: null as (() => void) | null,
    onerror: null as (() => void) | null,
    status: 0,
    abort: jest.fn(),
  };

  xhrInstance.send.mockImplementation(() => {
    setTimeout(() => { if (xhrInstance.onerror) xhrInstance.onerror(); }, 0);
  });

  (globalThis as any).XMLHttpRequest = jest.fn(() => xhrInstance);
  return xhrInstance;
}

// ── fetch helpers ──────────────────────────────────────────────────────────────

function mockPresign() {
  (globalThis.fetch as jest.Mock).mockResolvedValueOnce({
    ok: true,
    status: 200,
    text: () => Promise.resolve(JSON.stringify({
      data: {
        fileId: 'file-123',
        uploadUrl: 'https://s3.example.com/bucket/key?sig=abc',
        key: 'uploads/file-123',
        expiresIn: 300,
        headers: { 'Content-Type': 'image/jpeg' },
        maxSizeBytes: 5_000_000,
      },
    })),
  });
}

function mockConfirm() {
  (globalThis.fetch as jest.Mock).mockResolvedValueOnce({
    ok: true,
    status: 200,
    text: () => Promise.resolve(JSON.stringify({
      data: {
        id: 'file-123',
        kind: 'profile',
        url: 'https://cdn.example.com/file-123.jpg',
        contentType: 'image/jpeg',
        sizeBytes: 12345,
        status: 'confirmed',
        createdAt: new Date().toISOString(),
      },
    })),
  });
}

function mockPresignError() {
  (globalThis.fetch as jest.Mock).mockResolvedValueOnce({
    ok: false,
    status: 413,
    text: () => Promise.resolve(JSON.stringify({
      error: { code: 'FILE_TOO_LARGE', message: 'File exceeds 5 MB limit' },
    })),
  });
}

// ── uploadFile ────────────────────────────────────────────────────────────────

describe('uploadFile', () => {
  let fakeFile: File;

  beforeEach(() => {
    globalThis.fetch = jest.fn();
    fakeFile = new File(['hello'], 'avatar.jpg', { type: 'image/jpeg' });
  });

  it('POSTs /uploads/presign with kind, contentType, sizeBytes, fileName', async () => {
    makeXhrMock(200);
    mockPresign();
    mockConfirm();

    await uploadFile('tok', fakeFile, 'profile');

    const firstCall = (globalThis.fetch as jest.Mock).mock.calls[0];
    const [url, opts] = firstCall;
    expect(url).toMatch(/\/uploads\/presign$/);
    expect(opts.method).toBe('POST');
    const body = JSON.parse(opts.body);
    expect(body.kind).toBe('profile');
    expect(body.contentType).toBe('image/jpeg');
    expect(body.fileName).toBe('avatar.jpg');
  });

  it('performs XHR PUT to the signed S3 URL', async () => {
    const xhr = makeXhrMock(200);
    mockPresign();
    mockConfirm();

    await uploadFile('tok', fakeFile, 'profile');

    expect(xhr.open).toHaveBeenCalledWith(
      'PUT',
      'https://s3.example.com/bucket/key?sig=abc',
      true,
    );
    expect(xhr.send).toHaveBeenCalledWith(fakeFile);
  });

  it('POSTs /uploads/confirm with fileId after PUT succeeds', async () => {
    makeXhrMock(200);
    mockPresign();
    mockConfirm();

    await uploadFile('tok', fakeFile, 'profile');

    const confirmCall = (globalThis.fetch as jest.Mock).mock.calls[1];
    const [url, opts] = confirmCall;
    expect(url).toMatch(/\/uploads\/confirm$/);
    expect(JSON.parse(opts.body).fileId).toBe('file-123');
  });

  it('returns the confirmed file metadata', async () => {
    makeXhrMock(200);
    mockPresign();
    mockConfirm();

    const result = await uploadFile('tok', fakeFile, 'profile');
    expect(result.id).toBe('file-123');
    expect(result.status).toBe('confirmed');
    expect(result.url).toContain('cdn.example.com');
  });

  it('throws ApiError when presign fails', async () => {
    makeXhrMock(200); // won't be reached
    mockPresignError();

    const { ApiError } = await import('./api');
    await expect(uploadFile('tok', fakeFile, 'document')).rejects.toBeInstanceOf(ApiError);
  });

  it('throws UploadError with code NETWORK_ERROR on XHR onerror', async () => {
    makeXhrError();
    mockPresign();

    try {
      await uploadFile('tok', fakeFile, 'profile');
      fail('should have thrown');
    } catch (e: any) {
      expect(e).toBeInstanceOf(UploadError);
      expect(e.code).toBe('NETWORK_ERROR');
    }
  });

  it('throws UploadError with code URL_EXPIRED on S3 403', async () => {
    makeXhrMock(403);
    mockPresign();

    try {
      await uploadFile('tok', fakeFile, 'profile');
      fail('should have thrown');
    } catch (e: any) {
      expect(e).toBeInstanceOf(UploadError);
      expect(e.code).toBe('URL_EXPIRED');
    }
  });
});
