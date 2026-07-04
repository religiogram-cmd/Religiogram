'use client';

/**
 * Step — Video KYC (shared: priest, astrologer, both).
 *
 * The provider records a short introduction video (>=30s, <=120s), previews
 * it, then uploads directly to S3 via a pre-signed PUT URL. The
 * `/provider/kyc` endpoint is called AFTER the S3 upload succeeds, so we
 * never have half-uploaded rows in the DB.
 *
 * Gating: each flow supplies its own list of prerequisite paths to redirect
 * to if the store's data is missing them (priest checks religion/pricing/slots;
 * astrologer checks specialisations/channels/perMinute/slots).
 *
 * On success we advance to the NEXT step in the current flow, which the
 * `nextStepPath` prop encodes explicitly rather than guessing.
 */

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import WizardShell from '@/components/provider-onboarding/WizardShell';
import { useProviderOnboarding } from '@/lib/provider-onboarding-store';
import { providerOnboardingApi } from '@/lib/provider-onboarding-api';
import type { FlowConfig } from './FlowConfig';

const MIN_SECONDS = 30;
const MAX_SECONDS = 120;
const MAX_SIZE_BYTES = 80 * 1024 * 1024;

function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (ua.includes('Macintosh') && 'ontouchend' in document);
}
function pickMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  const candidates = isIOS()
    ? ['video/mp4;codecs=h264,aac', 'video/mp4', 'video/webm']
    : [
        'video/webm;codecs=vp8,opus',
        'video/webm;codecs=vp9,opus',
        'video/webm',
        'video/mp4;codecs=h264,aac',
        'video/mp4',
      ];
  for (const m of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(m)) return m;
    } catch {}
  }
  return '';
}

function waitForFirstFrame(video: HTMLVideoElement, timeoutMs = 2000): Promise<void> {
  return new Promise((resolve) => {
    if (video.readyState >= 2 && video.videoWidth > 0) {
      resolve();
      return;
    }
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve();
    };
    video.addEventListener('loadeddata', finish, { once: true });
    video.addEventListener('playing', finish, { once: true });
    setTimeout(finish, timeoutMs);
  });
}

type Phase = 'idle' | 'previewing' | 'recording' | 'review' | 'uploading' | 'done';

interface Props {
  flow: FlowConfig;
  /** Full path to the immediate next step (identity docs). */
  nextStepPath: string;
  /** Called to decide if the user meets prerequisites. Returning a string
   *  will redirect there; returning null means "OK, render". */
  gateCheck: (data: Record<string, any>) => string | null;
}

export default function Step_Kyc({ flow, nextStepPath, gateCheck }: Props) {
  const router = useRouter();
  const { data, update, flush, advance } = useProviderOnboarding();

  const [phase, setPhase] = useState<Phase>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);
  const [recordedDuration, setRecordedDuration] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [activeStream, setActiveStream] = useState<MediaStream | null>(null);

  const liveVideoRef = useRef<HTMLVideoElement | null>(null);
  const previewVideoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const startedAtRef = useRef<number>(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const target = gateCheck(data);
    if (target) router.replace(target);
  }, [data, router, gateCheck]);

  useEffect(() => {
    let cancelled = false;
    providerOnboardingApi.getDraft().then((d) => {
      if (cancelled) return;
      const st = d.providerStatus;
      if (st === 'pending_review' || st === 'approved' || st === 'rejected') {
        router.replace('/provider-status');
      }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [router]);

  useEffect(() => {
    return () => {
      stopTicker();
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t: any) => t.stop());
      }
      if (recordedUrl) URL.revokeObjectURL(recordedUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stopTicker = () => {
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
  };

  const startCamera = async () => {
    setErr(null);
    if (typeof MediaRecorder === 'undefined') {
      setErr('Your browser does not support video recording. Please open ReligioGram in Chrome or Safari and try again.');
      return;
    }

    const tryGetMedia = async (): Promise<MediaStream> => {
      try {
        return await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 720 }, height: { ideal: 1280 } },
          audio: true,
        });
      } catch {
        return await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });
      }
    };

    try {
      const stream = await tryGetMedia();
      const videoTrack = stream.getVideoTracks()[0];
      if (!videoTrack || videoTrack.readyState !== 'live') {
        stream.getTracks().forEach((t) => t.stop());
        throw new Error('Camera did not deliver video. Try closing other apps using the camera and reopen.');
      }
      streamRef.current = stream;
      setActiveStream(stream);
      setPhase('previewing');
    } catch (e: any) {
      setErr(
        e?.name === 'NotAllowedError'
          ? 'Camera permission was denied. Please allow camera access and try again.'
          : e?.message ?? 'Could not access camera.',
      );
    }
  };

  useEffect(() => {
    const v = liveVideoRef.current;
    if (!v || !activeStream) return;
    try {
      v.srcObject = activeStream;
      v.muted = true;
      v.playsInline = true;
      const p = v.play();
      if (p && typeof p.then === 'function') {
        p.catch(() => {});
      }
    } catch {}
  }, [activeStream, phase]);

  const startRecording = async () => {
    if (!streamRef.current) return;
    setErr(null);

    if (liveVideoRef.current) {
      await waitForFirstFrame(liveVideoRef.current);
    }

    if (liveVideoRef.current && liveVideoRef.current.videoWidth === 0) {
      setErr(
        'Camera preview is blank. If you are using browser device emulation, please test on a real phone. Otherwise close any other app using the camera and tap "Start camera" again.',
      );
      return;
    }

    const videoTrack = streamRef.current.getVideoTracks()[0];
    if (!videoTrack || videoTrack.readyState !== 'live') {
      setErr('Camera stream stopped. Tap "Start camera" again.');
      setPhase('idle');
      return;
    }
    const settings = videoTrack.getSettings?.();
    if (settings && (settings.width === 0 || settings.height === 0)) {
      setErr(
        'Camera is connected but producing no frames. Try a different browser or test on a physical phone.',
      );
      return;
    }

    chunksRef.current = [];
    const mime = pickMimeType();
    let recorder: MediaRecorder;
    try {
      recorder = mime
        ? new MediaRecorder(streamRef.current, { mimeType: mime })
        : new MediaRecorder(streamRef.current);
    } catch {
      try {
        recorder = new MediaRecorder(streamRef.current);
      } catch (err: any) {
        setErr(err?.message ?? 'Recording not supported on this device.');
        return;
      }
    }
    recorderRef.current = recorder;

    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType || mime || 'video/webm' });
      const durationSec = Math.round((Date.now() - startedAtRef.current) / 1000);

      if (blob.size < 1024) {
        setErr('Recording captured no video. Please ensure the camera lens is uncovered and try again.');
        setPhase('previewing');
        return;
      }

      const url = URL.createObjectURL(blob);
      setRecordedBlob(blob);
      setRecordedUrl(url);
      setRecordedDuration(durationSec);
      setPhase('review');
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t: any) => t.stop());
        streamRef.current = null;
      }
      setActiveStream(null);
    };

    recorder.start();
    startedAtRef.current = Date.now();
    setElapsed(0);
    setPhase('recording');

    tickRef.current = setInterval(() => {
      const sec = Math.floor((Date.now() - startedAtRef.current) / 1000);
      setElapsed(sec);
      if (sec >= MAX_SECONDS) stopRecording();
    }, 250);
  };

  const stopRecording = () => {
    stopTicker();
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop();
    }
  };

  const discardAndRetry = async () => {
    if (recordedUrl) URL.revokeObjectURL(recordedUrl);
    setRecordedBlob(null);
    setRecordedUrl(null);
    setRecordedDuration(0);
    setElapsed(0);
    setErr(null);
    setPhase('idle');
    await startCamera();
  };

  const uploadWithProgress = (
    url: string,
    blob: Blob,
    mimeType: string,
  ): Promise<void> =>
    new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', url, true);
      xhr.setRequestHeader('Content-Type', mimeType);
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          setUploadProgress(Math.round((e.loaded / e.total) * 100));
        }
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) resolve();
        else reject(new Error(`Upload failed (${xhr.status})`));
      };
      xhr.onerror = () => reject(new Error('Network error during upload'));
      xhr.ontimeout = () => reject(new Error('Upload timed out'));
      xhr.send(blob);
    });

  const onSubmit = async () => {
    if (!recordedBlob) return;
    if (recordedDuration < MIN_SECONDS) {
      setErr(`Video must be at least ${MIN_SECONDS} seconds.`);
      return;
    }
    if (recordedBlob.size > MAX_SIZE_BYTES) {
      setErr('Video is too large. Please re-record a shorter clip.');
      return;
    }

    setErr(null);
    setPhase('uploading');
    setUploadProgress(0);

    try {
      const rawMime = (recordedBlob.type || 'video/webm').toLowerCase();
      const contentType: 'video/mp4' | 'video/webm' | 'video/quicktime' =
        rawMime.startsWith('video/mp4')       ? 'video/mp4'       :
        rawMime.startsWith('video/quicktime') ? 'video/quicktime' :
                                                'video/webm';

      const presigned = await providerOnboardingApi.presignKyc({
        contentType,
        sizeBytes: recordedBlob.size,
      });

      await uploadWithProgress(presigned.uploadUrl, recordedBlob, contentType);

      update({ kycR2ObjectKey: presigned.r2ObjectKey, kycDurationSeconds: recordedDuration });
      await flush();

      await providerOnboardingApi.step7({
        r2ObjectKey: presigned.r2ObjectKey,
        durationSeconds: recordedDuration,
      });

      advance(flow.advanceTo);
      setPhase('done');
      router.push(nextStepPath);
    } catch (e: any) {
      setErr(e?.message ?? 'Upload failed. Please try again.');
      setPhase('review');
    }
  };

  const mmss = (sec: number) =>
    `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;

  const canContinue = phase === 'review' && recordedDuration >= MIN_SECONDS;
  const hideNext =
    phase === 'idle' ||
    phase === 'previewing' ||
    phase === 'recording' ||
    phase === 'uploading' ||
    phase === 'done';

  return (
    <WizardShell
      currentStep={flow.currentStep}
      totalSteps={flow.totalSteps}
      stepLabels={flow.stepLabels}
      routeBase={flow.routeBase}
      banner={flow.banner}
      canContinue={canContinue}
      onContinue={onSubmit}
      nextLabel={
        phase === 'uploading'
          ? `Uploading ${uploadProgress}%…`
          : 'Upload & continue'
      }
      hideNext={hideNext}
    >
      <div className="space-y-5">
        <div className="rounded-2xl bg-[#F6F7FA]/40 border border-[#0F2452]/15 p-4 text-sm text-gray-700/90 space-y-2">
          <p className="font-semibold text-gray-700">A 30-second introduction</p>
          <p>
            Record a short clip — in any language — introducing yourself, your
            tradition, and one service you&apos;re most known for. This helps
            devotees feel they know you before booking.
          </p>
          <ul className="list-disc pl-5 text-xs text-gray-700/80 space-y-0.5">
            <li>Minimum 30 seconds · maximum 2 minutes</li>
            <li>Good light, quiet room, face clearly visible</li>
            <li>Our team reviews every video before going live</li>
          </ul>
        </div>

        {phase === 'idle' && (
          <div className="text-center py-6">
            <button
              type="button"
              onClick={startCamera}
              className="px-6 py-4 rounded-xl font-semibold text-[#F7EFE1] bg-[#0F2452] hover:bg-[#0F2452] active:scale-[0.98] transition"
            >
              Start camera
            </button>
            <p className="text-xs text-gray-700/60 mt-3">
              Your browser will ask for camera and mic permission.
            </p>
          </div>
        )}

        {(phase === 'previewing' || phase === 'recording') && (
          <div className="space-y-3">
            <div className="relative aspect-[3/4] sm:aspect-video bg-black rounded-2xl overflow-hidden">
              <video
                ref={liveVideoRef}
                playsInline
                autoPlay
                muted
                className="w-full h-full object-cover"
              />
              {phase === 'recording' && (
                <div className="absolute top-3 left-3 flex items-center gap-2 bg-black/60 text-white px-3 py-1.5 rounded-full text-sm">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
                  REC {mmss(elapsed)}
                </div>
              )}
              {phase === 'recording' && (
                <div className="absolute bottom-3 left-3 right-3">
                  <div className="h-1.5 bg-white/20 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-red-500 transition-all"
                      style={{ width: `${Math.min(100, (elapsed / MIN_SECONDS) * 100)}%` }}
                    />
                  </div>
                  <p className="text-xs text-white/90 mt-1">
                    {elapsed < MIN_SECONDS
                      ? `${MIN_SECONDS - elapsed}s to minimum`
                      : `Keep going — ${MAX_SECONDS - elapsed}s left`}
                  </p>
                </div>
              )}
            </div>

            {phase === 'previewing' && (
              <button
                type="button"
                onClick={startRecording}
                className="w-full px-5 py-4 rounded-xl font-semibold text-white bg-red-600 hover:bg-red-700 active:scale-[0.98] transition"
              >
                ● Start recording
              </button>
            )}
            {phase === 'recording' && (
              <button
                type="button"
                onClick={stopRecording}
                disabled={elapsed < 5}
                className="w-full px-5 py-4 rounded-xl font-semibold text-white bg-[#0F2452] hover:bg-[#0F2452] active:scale-[0.98] transition disabled:opacity-50"
              >
                ■ Stop recording
              </button>
            )}
          </div>
        )}

        {phase === 'review' && recordedUrl && (
          <div className="space-y-3">
            <div className="aspect-[3/4] sm:aspect-video bg-black rounded-2xl overflow-hidden">
              <video
                ref={previewVideoRef}
                src={recordedUrl}
                controls
                playsInline
                className="w-full h-full object-contain"
              />
            </div>
            <div className="flex items-center justify-between text-sm text-gray-700/80">
              <span>Duration: {mmss(recordedDuration)}</span>
              <span>Size: {(recordedBlob!.size / 1024 / 1024).toFixed(1)} MB</span>
            </div>

            {recordedDuration < MIN_SECONDS && (
              <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800">
                Your video is {recordedDuration}s. Please record at least{' '}
                {MIN_SECONDS}s.
              </div>
            )}

            <button
              type="button"
              onClick={discardAndRetry}
              className="w-full px-4 py-3 rounded-xl bg-[#0F2452]/10 text-gray-700 font-medium hover:bg-[#0F2452]/15"
            >
              Record again
            </button>
          </div>
        )}

        {phase === 'uploading' && (
          <div className="space-y-3 py-4">
            <p className="text-sm text-gray-700/80 text-center">
              Uploading your video…
            </p>
            <div className="h-3 bg-[#0F2452]/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-[#0F2452] transition-all duration-200"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
            <p className="text-xs text-gray-700/60 text-center">
              {uploadProgress}% · Please don&apos;t close this page.
            </p>
          </div>
        )}

        {err && <p className="text-sm text-red-700">{err}</p>}
      </div>
    </WizardShell>
  );
}
