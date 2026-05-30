/**
 * v9 (P0-3 fix): Browser WebRTC client for ReligioGram consultation calls.
 *
 * Uses the native WebRTC stack — no third-party SDK dependency. The backend
 * gateway relays SDP and ICE only; this module owns the RTCPeerConnection,
 * media capture, and remote stream attachment.
 *
 * Lifecycle:
 *   1. Caller obtains ICE servers from GET /v1/consultation/turn-credentials.
 *   2. Both peers join the Socket.IO room (already implemented in v8).
 *   3. Caller `start(true)`: getUserMedia → createOffer → emit 'call.offer'.
 *   4. Callee receives 'call.offer' → start(false) → setRemoteDescription →
 *      createAnswer → emit 'call.answer'.
 *   5. ICE candidates flow both ways via 'call.ice'.
 *   6. Either side `hangup()`: emits 'call.end' and tears down.
 *
 * The implementation deliberately keeps the public surface tiny so the
 * consultation UI can swap to Agora/Twilio/LiveKit later by replacing this
 * file alone — the Socket.IO contract is the same.
 */

import type { Socket } from 'socket.io-client';

export interface CallHandle {
  /** Local media track (after start() succeeds). */
  localStream: MediaStream | null;
  /** Hangup and tear down. Idempotent. */
  hangup(): void;
  /** Toggle local audio mute. */
  setMuted(muted: boolean): void;
  /** Toggle local video on/off. */
  setVideoEnabled(enabled: boolean): void;
}

export interface CallOptions {
  socket: Socket;
  sessionId: string;
  iceServers: RTCIceServer[];
  /** Caller=true, Callee=false. The caller emits the SDP offer. */
  isCaller: boolean;
  audio?: boolean;
  video?: boolean;
  onRemoteStream: (stream: MediaStream) => void;
  onConnectionStateChange?: (state: RTCPeerConnectionState) => void;
  onError?: (err: Error) => void;
}

export async function startCall(opts: CallOptions): Promise<CallHandle> {
  const { socket, sessionId, iceServers, isCaller } = opts;

  const pc = new RTCPeerConnection({ iceServers, bundlePolicy: 'max-bundle' });

  let localStream: MediaStream | null = null;
  let teardownInvoked = false;

  // ── Local media ──
  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      audio: opts.audio ?? true,
      video: opts.video ?? true,
    });
    for (const track of localStream.getTracks()) pc.addTrack(track, localStream);
  } catch (err) {
    opts.onError?.(err as Error);
    pc.close();
    throw err;
  }

  // ── Remote media ──
  const remoteStream = new MediaStream();
  pc.ontrack = (ev) => {
    for (const track of ev.streams[0]?.getTracks() ?? [ev.track]) {
      remoteStream.addTrack(track);
    }
    opts.onRemoteStream(remoteStream);
  };

  pc.onconnectionstatechange = () => {
    opts.onConnectionStateChange?.(pc.connectionState);
    if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
      teardown();
    }
  };

  pc.onicecandidate = (ev) => {
    if (ev.candidate) {
      socket.emit('call.ice', { sessionId, candidate: ev.candidate.toJSON() });
    }
  };

  // ── Signalling handlers ──
  const onOffer = async (msg: { sessionId: string; sdp: string; type: 'offer' }) => {
    if (msg.sessionId !== sessionId) return;
    try {
      await pc.setRemoteDescription({ type: 'offer', sdp: msg.sdp });
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit('call.answer', { sessionId, sdp: answer.sdp, type: 'answer' });
    } catch (err) {
      opts.onError?.(err as Error);
    }
  };
  const onAnswer = async (msg: { sessionId: string; sdp: string; type: 'answer' }) => {
    if (msg.sessionId !== sessionId) return;
    try {
      await pc.setRemoteDescription({ type: 'answer', sdp: msg.sdp });
    } catch (err) {
      opts.onError?.(err as Error);
    }
  };
  const onIce = async (msg: { sessionId: string; candidate: RTCIceCandidateInit }) => {
    if (msg.sessionId !== sessionId) return;
    try {
      await pc.addIceCandidate(msg.candidate);
    } catch (err) {
      // Late or duplicate ICE candidates are normal and harmless.
    }
  };
  const onEnded = (msg: { sessionId: string }) => {
    if (msg.sessionId !== sessionId) return;
    teardown();
  };

  socket.on('call.offer', onOffer);
  socket.on('call.answer', onAnswer);
  socket.on('call.ice', onIce);
  socket.on('call.ended', onEnded);

  // ── Caller side: send the initial offer ──
  if (isCaller) {
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit('call.offer', { sessionId, sdp: offer.sdp, type: 'offer' });
    } catch (err) {
      opts.onError?.(err as Error);
      teardown();
      throw err;
    }
  }

  function teardown() {
    if (teardownInvoked) return;
    teardownInvoked = true;
    socket.off('call.offer', onOffer);
    socket.off('call.answer', onAnswer);
    socket.off('call.ice', onIce);
    socket.off('call.ended', onEnded);
    for (const track of localStream?.getTracks() ?? []) track.stop();
    try {
      pc.close();
    } catch {
      /* ignore */
    }
  }

  return {
    get localStream() {
      return localStream;
    },
    hangup() {
      socket.emit('call.end', { sessionId, reason: 'user_hangup' });
      teardown();
    },
    setMuted(muted: boolean) {
      for (const track of localStream?.getAudioTracks() ?? []) track.enabled = !muted;
    },
    setVideoEnabled(enabled: boolean) {
      for (const track of localStream?.getVideoTracks() ?? []) track.enabled = enabled;
    },
  };
}
