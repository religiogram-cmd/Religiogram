/**
 * Direct-to-S3 upload helper.
 *
 * Two-step flow:
 *   1. POST /uploads/presign         → backend signs a 5-min PUT URL
 *   2. PUT  signedUrl  (browser→S3)  → bytes never touch our API
 *   3. POST /uploads/confirm         → backend HEADs S3 and flips status
 *
 * The backend stays small + horizontally scalable because file bytes
 * never travel through it. Bandwidth + storage costs stay on S3 / CDN.
 *
 * Failure modes handled:
 *   - Pre-sign rejected (size/type policy): surfaces backend's friendly message
 *   - Network error during PUT: throws UploadError with code='NETWORK_ERROR'
 *   - S3 returns 403 (URL expired): throws with code='URL_EXPIRED'
 *   - Confirm fails (object missing): caller can retry the whole flow
 */
import { ApiError } from './api';

const DEFAULT_API_BASE = 'https://api.religiogram.com/api/v1';
const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ??
  (typeof window !== 'undefined' && window.location.hostname === 'localhost'
    ? '/api/v1'
    : DEFAULT_API_BASE);

export type UploadKind = 'profile' | 'document' | 'certificate';

export class UploadError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = 'UploadError';
  }
}

interface PresignResponse {
  fileId: string;
  uploadUrl: string;
  key: string;
  expiresIn: number;
  headers: Record<string, string>;
  maxSizeBytes: number;
}

interface ConfirmResponse {
  id: string;
  kind: UploadKind;
  url: string;
  contentType: string;
  sizeBytes: number;
  status: 'pending' | 'confirmed' | 'expired';
  createdAt: string;
}

interface UploadOpts {
  /**
   * Optional progress callback (0..1). Wired via XHR because fetch() doesn't
   * expose upload progress in browsers.
   */
  onProgress?: (fraction: number) => void;
  /** Aborts the in-flight PUT. */
  signal?: AbortSignal;
}

/**
 * Upload a file end-to-end. Returns the confirmed file metadata.
 *
 * @param accessToken JWT — passed because this helper is intentionally
 *   independent of the api.ts singleton (lets callers use it from places
 *   like a service worker or background sync without pulling in the
 *   full client).
 */
export async function uploadFile(
  accessToken: string,
  file: File,
  kind: UploadKind,
  opts: UploadOpts = {},
): Promise<ConfirmResponse> {
  // ── 1. Ask the backend to sign a URL ────────────────────────
  const presign = await postJson<PresignResponse>(
    '/uploads/presign',
    accessToken,
    {
      kind,
      contentType: file.type,
      sizeBytes: file.size,
      fileName: file.name,
    },
  );

  // ── 2. PUT directly to S3 ───────────────────────────────────
  await putWithProgress(presign.uploadUrl, file, presign.headers, opts);

  // ── 3. Tell the backend the upload landed ───────────────────
  return postJson<ConfirmResponse>('/uploads/confirm', accessToken, {
    fileId: presign.fileId,
  });
}

/* ─── Internals ─────────────────────────────────────────────── */

async function postJson<T>(
  path: string,
  token: string,
  body: unknown,
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json: any = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      throw new ApiError(
        'INVALID_RESPONSE',
        `Server returned non-JSON (${res.status})`,
        res.status,
      );
    }
  }
  if (!res.ok) {
    throw new ApiError(
      json?.error?.code ?? 'UNKNOWN',
      json?.error?.message ?? `Request failed (${res.status})`,
      res.status,
    );
  }
  return (json?.data ?? json) as T;
}

/**
 * Upload via XMLHttpRequest so we can report progress and honour
 * an AbortSignal. Browsers don't expose upload progress on fetch().
 */
function putWithProgress(
  url: string,
  file: File,
  headers: Record<string, string>,
  opts: UploadOpts,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url, true);

    // Apply the headers the backend signed for. Mismatch = S3 returns 403.
    for (const [k, v] of Object.entries(headers)) {
      // Browsers forbid setting Content-Length explicitly; they'll set it
      // from the body. S3's signature includes it from the signed policy.
      if (k.toLowerCase() === 'content-length') continue;
      xhr.setRequestHeader(k, v);
    }

    if (opts.onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) opts.onProgress!(e.loaded / e.total);
      };
    }

    if (opts.signal) {
      const onAbort = () => {
        xhr.abort();
        reject(new UploadError('ABORTED', 'Upload aborted by caller.'));
      };
      if (opts.signal.aborted) return onAbort();
      opts.signal.addEventListener('abort', onAbort, { once: true });
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else if (xhr.status === 403) {
        reject(
          new UploadError(
            'URL_EXPIRED',
            'Upload URL expired or signature invalid. Please retry.',
          ),
        );
      } else {
        reject(
          new UploadError(
            'S3_ERROR',
            `S3 rejected upload with status ${xhr.status}`,
          ),
        );
      }
    };

    xhr.onerror = () =>
      reject(
        new UploadError(
          'NETWORK_ERROR',
          'Upload failed — check your connection and try again.',
        ),
      );

    xhr.send(file);
  });
}
