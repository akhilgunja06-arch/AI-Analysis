import { useCallback, useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import type { CallType, IceServer } from '@/lib/types';

/**
 * A real WebRTC peer connection.
 *
 * Everything here talks to the browser's own RTCPeerConnection: no fake media,
 * no simulated streams. If getUserMedia is denied the call fails with a message
 * the user can act on, rather than showing a placeholder video.
 *
 * Signalling goes through the existing authenticated socket. The server decides
 * who receives each message from the call id, so the client never picks a
 * recipient.
 */

export type CallPhase =
  | 'idle'
  | 'requesting-media'
  | 'ringing'
  | 'connecting'
  | 'connected'
  | 'ended'
  | 'failed';

export type CallError = { code: string; message: string } | null;

type Options = {
  socket: Socket | null;
  callId: string | null;
  type: CallType;
  iceServers: IceServer[];
  /** Who creates the offer: the caller. The callee waits for it. */
  isCaller: boolean;
  /** Only start once both sides have agreed (i.e. after accept). */
  active: boolean;
};

export function usePeerConnection({ socket, callId, type, iceServers, isCaller, active }: Options) {
  const [phase, setPhase] = useState<CallPhase>('idle');
  const [error, setError] = useState<CallError>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [micEnabled, setMicEnabled] = useState(true);
  const [cameraEnabled, setCameraEnabled] = useState(type === 'VIDEO');
  const [connectionState, setConnectionState] = useState<RTCPeerConnectionState>('new');

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const pendingCandidates = useRef<RTCIceCandidateInit[]>([]);
  const remoteDescriptionSet = useRef(false);

  const stopTracks = useCallback(() => {
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    setLocalStream(null);
    setRemoteStream(null);
  }, []);

  const teardown = useCallback(() => {
    pcRef.current?.close();
    pcRef.current = null;
    pendingCandidates.current = [];
    remoteDescriptionSet.current = false;
    stopTracks();
  }, [stopTracks]);

  // Acquire media once the call becomes active.
  useEffect(() => {
    if (!active || !callId) return;
    let cancelled = false;

    const start = async () => {
      setPhase('requesting-media');
      setError(null);

      if (!navigator.mediaDevices?.getUserMedia) {
        setPhase('failed');
        setError({
          code: 'UNSUPPORTED',
          message:
            'This browser cannot access your camera or microphone. Use a modern browser over HTTPS to make calls.',
        });
        return;
      }

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
          video: type === 'VIDEO' ? { width: { ideal: 1280 }, height: { ideal: 720 } } : false,
        });
      } catch (err) {
        if (cancelled) return;
        const name = err instanceof Error ? err.name : 'Error';
        setPhase('failed');
        setError(
          name === 'NotAllowedError'
            ? {
                code: 'PERMISSION_DENIED',
                message:
                  type === 'VIDEO'
                    ? 'Camera or microphone access was blocked. Allow access in your browser settings and try again.'
                    : 'Microphone access was blocked. Allow access in your browser settings and try again.',
              }
            : name === 'NotFoundError'
              ? { code: 'NO_DEVICE', message: 'No microphone or camera was found on this device.' }
              : { code: 'MEDIA_FAILED', message: 'Could not start your camera or microphone.' },
        );
        return;
      }

      if (cancelled) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      localStreamRef.current = stream;
      setLocalStream(stream);
      setCameraEnabled(stream.getVideoTracks().length > 0);
      setMicEnabled(stream.getAudioTracks().some((t) => t.enabled));

      const pc = new RTCPeerConnection({
        iceServers: iceServers.map((s) => ({
          urls: s.urls,
          ...(s.username ? { username: s.username } : {}),
          ...(s.credential ? { credential: s.credential } : {}),
        })),
        iceCandidatePoolSize: 4,
      });
      pcRef.current = pc;

      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      pc.ontrack = (event) => {
        const [incoming] = event.streams;
        if (incoming) setRemoteStream(incoming);
      };

      pc.onconnectionstatechange = () => {
        setConnectionState(pc.connectionState);
        if (pc.connectionState === 'connected') setPhase('connected');
        if (pc.connectionState === 'failed') {
          setPhase('failed');
          setError({
            code: 'CONNECTION_FAILED',
            message:
              'The media connection could not be established. A TURN relay is usually needed on restrictive networks.',
          });
        }
        if (pc.connectionState === 'disconnected') {
          // Give ICE a moment to recover before declaring failure.
          setTimeout(() => {
            if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
              setPhase((current) => (current === 'connected' ? 'failed' : current));
              setError((current) =>
                current ?? { code: 'DISCONNECTED', message: 'The connection was lost.' },
              );
            }
          }, 8000);
        }
      };

      pc.onicecandidate = (event) => {
        if (event.candidate && callId && socket) {
          socket.emit('call:ice', { callId, candidate: event.candidate.toJSON() });
        }
      };

      setPhase('connecting');

      if (isCaller) {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket?.emit('call:offer', { callId, sdp: pc.localDescription });
      }
    };

    void start();
    return () => {
      cancelled = true;
    };
    // Deliberately keyed on the call identity and activation only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, callId, isCaller, type]);

  // Signalling handlers.
  useEffect(() => {
    if (!socket || !callId) return;

    const onOffer = async (payload: { callId: string; sdp: RTCSessionDescriptionInit }) => {
      if (payload.callId !== callId) return;
      const pc = pcRef.current;
      if (!pc) return;
      await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
      remoteDescriptionSet.current = true;
      for (const candidate of pendingCandidates.current) {
        await pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => undefined);
      }
      pendingCandidates.current = [];

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit('call:answer', { callId, sdp: pc.localDescription });
    };

    const onAnswer = async (payload: { callId: string; sdp: RTCSessionDescriptionInit }) => {
      if (payload.callId !== callId) return;
      const pc = pcRef.current;
      if (!pc || pc.signalingState === 'stable') return;
      await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
      remoteDescriptionSet.current = true;
      for (const candidate of pendingCandidates.current) {
        await pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => undefined);
      }
      pendingCandidates.current = [];
    };

    const onIce = async (payload: { callId: string; candidate: RTCIceCandidateInit }) => {
      if (payload.callId !== callId) return;
      const pc = pcRef.current;
      if (!pc || !payload.candidate) return;
      if (!remoteDescriptionSet.current) {
        pendingCandidates.current.push(payload.candidate);
        return;
      }
      await pc.addIceCandidate(new RTCIceCandidate(payload.candidate)).catch(() => undefined);
    };

    socket.on('call:offer', onOffer);
    socket.on('call:answer', onAnswer);
    socket.on('call:ice', onIce);

    return () => {
      socket.off('call:offer', onOffer);
      socket.off('call:answer', onAnswer);
      socket.off('call:ice', onIce);
    };
  }, [socket, callId]);

  const toggleMic = useCallback(() => {
    const tracks = localStreamRef.current?.getAudioTracks() ?? [];
    const next = !tracks.every((t) => t.enabled);
    tracks.forEach((t) => {
      t.enabled = next;
    });
    setMicEnabled(next);
    return next;
  }, []);

  const toggleCamera = useCallback(() => {
    const tracks = localStreamRef.current?.getVideoTracks() ?? [];
    if (tracks.length === 0) return false;
    const next = !tracks.every((t) => t.enabled);
    tracks.forEach((t) => {
      t.enabled = next;
    });
    setCameraEnabled(next);
    return next;
  }, []);

  /** Switches between front and rear cameras on mobile, when more than one exists. */
  const switchCamera = useCallback(async () => {
    const stream = localStreamRef.current;
    const pc = pcRef.current;
    if (!stream || !pc) return;
    const current = stream.getVideoTracks()[0];
    if (!current) return;

    const devices = await navigator.mediaDevices.enumerateDevices();
    const cameras = devices.filter((d) => d.kind === 'videoinput');
    if (cameras.length < 2) return;

    const settings = current.getSettings();
    const index = cameras.findIndex((c) => c.deviceId === settings.deviceId);
    const next = cameras[(index + 1) % cameras.length];

    const replacement = await navigator.mediaDevices.getUserMedia({
      video: { deviceId: { exact: next.deviceId } },
      audio: false,
    });
    const newTrack = replacement.getVideoTracks()[0];
    if (!newTrack) return;

    const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
    await sender?.replaceTrack(newTrack);
    current.stop();
    stream.removeTrack(current);
    stream.addTrack(newTrack);
    newTrack.enabled = cameraEnabled;
    setLocalStream(new MediaStream(stream.getTracks()));
  }, [cameraEnabled]);

  return {
    phase,
    setPhase,
    error,
    setError,
    localStream,
    remoteStream,
    micEnabled,
    cameraEnabled,
    connectionState,
    toggleMic,
    toggleCamera,
    switchCamera,
    teardown,
  };
}
