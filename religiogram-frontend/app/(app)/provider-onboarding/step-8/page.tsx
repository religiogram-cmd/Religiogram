'use client';

/**
 * Step 8 — Identity Documents.
 *
 * Two photo uploads:
 *   - PAN card (rear-facing camera or file pick)
 *   - Selfie (front camera or file pick)
 *
 * Same presign → S3 PUT → confirm pattern as Step 7's video. Each card is
 * independent — one can succeed while the other is still pending — and the
 * Continue button only enables once both confirmations have come back.
 *
 * Files cap at 8 MB to keep mobile uploads sane; only image/jpeg, png, webp
 * are accepted (the backend whitelist mirrors this).
 */

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import WizardShell from '@/components/provider-onboarding/WizardShell';
import { useProviderOnboarding } from '@/lib/provider-onboarding-store';
import { providerOnboardingApi } from '@/lib/provider-onboarding-api';

const MAX_SIZE_BYTES = 8 * 1024 * 1024; // 8 MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
type AllowedType = (typeof ALLOWED_TYPES)[number];

type Status = 'idle' | 'uploading' | 'done' | 'error';

interface UploadState {
  status: Status;
  progress: number;
  previewUrl: string | null;
  fileName: string | null;
  sizeBytes: number;
  r2ObjectKey: string | null;
  error: string | null;
}

const initialUpload = (): UploadState => ({
  status: 'idle',
  progress: 0,
  previewUrl: null,
  fileName: null,
  sizeBytes: 0,
  r2ObjectKey: null,
  error: null,
});

export default function Step8Page() {
  const router = useRouter();
  const { data, update, flush, advance } = useProviderOnboarding();

  const [pan, setPan] = useState<UploadState>(initialUpload);
  const [selfie, setSelfie] = useState<UploadState>(initialUpload);

  // Restore previously-confirmed keys from the store so a back/forward doesn't
  // force a re-upload.
  const hydratedRef = useRef(false);
  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;
    if (data.panR2ObjectKey) {
      setPan((s) => ({ ...s, status: 'done', r2ObjectKey: data.panR2ObjectKey!, progress: 100 }));
    }
    if (data.selfieR2ObjectKey) {
      setSelfie((s) => ({ ...s, status: 'done', r2ObjectKey: data.selfieR2ObjectKey!, progress: 100 }));
    }
  }, [data.panR2ObjectKey, data.selfieR2ObjectKey]);

  // Gate — make sure earlier steps are complete.
  useEffect(() => {
    if (!data.religion) router.replace('/provider-onboarding/step-3');
    else if (!data.pricing?.length) router.replace('/provider-onboarding/step-5');
    else if (!data.slots?.length) router.replace('/provider-onboarding/step-6');
  }, [data.religion, data.pricing, data.slots, router]);

  // Revoke object URLs on unmount so we don't leak.
  useEffect(() => {
    return () => {
      if (pan.previewUrl) URL.revokeObjectURL(pan.previewUrl);
      if (selfie.previewUrl) URL.revokeObjectURL(selfie.previewUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const uploadWithProgress = (
    url: string,
    blob: Blob,
    mimeType: string,
    onProgress: (pct: number) => void,
  ): Promise<void> =>
    new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', url, true);
      xhr.setRequestHeader('Content-Type', mimeType);
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) resolve();
        else reject(new Error(`Upload failed (${xhr.status})`));
      };
      xhr.onerror = () => reject(new Error('Network error during upload'));
      xhr.ontimeout = () => reject(new Error('Upload timed out'));
      xhr.send(blob);
    });

  const handleFile = async (
    kind: 'pan' | 'selfie',
    file: File,
  ) => {
    const setState = kind === 'pan' ? setPan : setSelfie;
    const presignFn = kind === 'pan' ? providerOnboardingApi.presignPan : providerOnboardingApi.presignSelfie;
    const confirmFn = kind === 'pan' ? providerOnboardingApi.confirmPan : providerOnboardingApi.confirmSelfie;
    const storeKey = kind === 'pan' ? 'panR2ObjectKey' : 'selfieR2ObjectKey';

    // Validate
    if (!ALLOWED_TYPES.includes(file.type as AllowedType)) {
      setState({
        ...initialUpload(),
        status: 'error',
        error: 'Only JPG, PNG, or WebP images are supported.',
      });
      return;
    }
    if (file.size > MAX_SIZE_BYTES) {
      setState({
        ...initialUpload(),
        status: 'error',
        error: 'Image must be under 8 MB. Try a smaller photo.',
      });
      return;
    }

    const previewUrl = URL.createObjectURL(file);
    setState({
      status: 'uploading',
      progress: 0,
      previewUrl,
      fileName: file.name,
      sizeBytes: file.size,
      r2ObjectKey: null,
      error: null,
    });

    try {
      const presigned = await presignFn({
        contentType: file.type as AllowedType,
        sizeBytes: file.size,
      });
      await uploadWithProgress(presigned.uploadUrl, file, file.type, (pct) => {
        setState((s) => ({ ...s, progress: pct }));
      });
      await confirmFn(presigned.r2ObjectKey);

      setState((s) => ({
        ...s,
        status: 'done',
        progress: 100,
        r2ObjectKey: presigned.r2ObjectKey,
        error: null,
      }));
      update({ [storeKey]: presigned.r2ObjectKey });
      await flush();
    } catch (e: any) {
      setState((s) => ({
        ...s,
        status: 'error',
        error: e?.message ?? 'Upload failed. Please try again.',
      }));
    }
  };

  const canContinue = pan.status === 'done' && selfie.status === 'done';

  const onContinue = async () => {
    advance(9);
    router.push('/provider-onboarding/step-9');
  };

  return (
    <WizardShell
      currentStep={8}
      canContinue={canContinue}
      onContinue={onContinue}
      nextLabel="Continue"
    >
      <div className="space-y-5">
        <div className="rounded-2xl bg-[#F6F7FA]/40 border border-[#0F2452]/15 p-4 text-sm text-gray-700/90 space-y-2">
          <p className="font-semibold text-gray-700">Verify who you are</p>
          <p>
            Upload a clear photo of your PAN card and a recent selfie. These are
            used only for verification and are never shown to devotees.
          </p>
          <ul className="list-disc pl-5 text-xs text-gray-700/80 space-y-0.5">
            <li>JPG, PNG, or WebP · up to 8 MB each</li>
            <li>Make sure all four corners and text are readable</li>
          </ul>
        </div>

        <UploadCard
          title="PAN Card"
          subtitle="Front side · all details readable"
          accept="image/jpeg,image/png,image/webp"
          capture="environment"
          state={pan}
          onFile={(file) => handleFile('pan', file)}
          onReset={() => {
            if (pan.previewUrl) URL.revokeObjectURL(pan.previewUrl);
            setPan(initialUpload());
          }}
        />

        <UploadCard
          title="Selfie"
          subtitle="A clear photo of your face · good lighting"
          accept="image/jpeg,image/png,image/webp"
          capture="user"
          state={selfie}
          onFile={(file) => handleFile('selfie', file)}
          onReset={() => {
            if (selfie.previewUrl) URL.revokeObjectURL(selfie.previewUrl);
            setSelfie(initialUpload());
          }}
        />
      </div>
    </WizardShell>
  );
}

interface UploadCardProps {
  title: string;
  subtitle: string;
  accept: string;
  capture: 'environment' | 'user';
  state: UploadState;
  onFile: (file: File) => void;
  onReset: () => void;
}

function UploadCard({
  title,
  subtitle,
  accept,
  capture,
  state,
  onFile,
  onReset,
}: UploadCardProps) {
  const inputId = `upload-${title.toLowerCase().replace(/\s+/g, '-')}`;

  return (
    <div className="rounded-2xl border border-[#0F2452]/15 bg-white p-4 shadow-sm">
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <div>
          <h3 className="font-semibold text-[#0F2452]">{title}</h3>
          <p className="text-xs text-gray-700/70 mt-0.5">{subtitle}</p>
        </div>
        {state.status === 'done' && (
          <span className="text-xs font-semibold text-green-700 bg-green-50 border border-green-200 rounded-full px-2 py-0.5">
            Uploaded
          </span>
        )}
      </div>

      {state.previewUrl && (
        <div className="mb-3 aspect-[4/3] bg-black/5 rounded-xl overflow-hidden border border-[#0F2452]/10">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={state.previewUrl}
            alt={`${title} preview`}
            className="w-full h-full object-contain"
          />
        </div>
      )}

      {state.status === 'uploading' && (
        <div className="space-y-1 mb-3">
          <div className="h-2 bg-[#0F2452]/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-[#C8920A] transition-all duration-200"
              style={{ width: `${state.progress}%` }}
            />
          </div>
          <p className="text-xs text-gray-700/70">
            Uploading {state.progress}% · {(state.sizeBytes / 1024 / 1024).toFixed(2)} MB
          </p>
        </div>
      )}

      {state.status === 'done' && state.sizeBytes > 0 && (
        <p className="text-xs text-gray-700/60 mb-3">
          {state.fileName ?? 'Image'} · {(state.sizeBytes / 1024 / 1024).toFixed(2)} MB
        </p>
      )}

      {state.status === 'error' && state.error && (
        <p className="text-sm text-red-700 mb-3">{state.error}</p>
      )}

      <div className="flex items-center gap-2">
        <label
          htmlFor={inputId}
          className="flex-1 inline-flex items-center justify-center px-4 py-3 rounded-xl
                     font-semibold text-[#F7EFE1] bg-[#0F2452]
                     hover:bg-[#0F2452] active:scale-[0.98] transition cursor-pointer text-sm"
        >
          {state.status === 'idle' && 'Take photo or upload'}
          {state.status === 'uploading' && 'Uploading…'}
          {state.status === 'done' && 'Replace photo'}
          {state.status === 'error' && 'Try again'}
        </label>
        {(state.status === 'done' || state.status === 'error') && (
          <button
            type="button"
            onClick={onReset}
            className="px-4 py-3 rounded-xl border border-[#0F2452]/20 text-gray-700 text-sm font-medium
                       hover:bg-[#0F2452]/5"
          >
            Clear
          </button>
        )}
        <input
          id={inputId}
          type="file"
          accept={accept}
          capture={capture}
          className="hidden"
          disabled={state.status === 'uploading'}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onFile(file);
            // Reset the input so the same file can be re-selected.
            e.currentTarget.value = '';
          }}
        />
      </div>
    </div>
  );
}
