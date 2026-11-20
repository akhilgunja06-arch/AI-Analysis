import { useEffect, useRef, useState } from 'react';
import {
  Camera,
  CameraOff,
  Mic,
  MicOff,
  PhoneOff,
  RefreshCw,
  ShieldAlert,
  Video,
} from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import type { CallParticipant, CallType } from '@/lib/types';
import type { CallError, CallPhase } from '@/hooks/usePeerConnection';

/**
 * The in-call surface.
 *
 * The <video> elements are bound directly to the MediaStream objects produced by
 * RTCPeerConnection. There is no poster image pretending to be video: when the
 * remote track has not arrived the element stays empty and the avatar is shown
 * instead, which is the honest state.
 */

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

function useElapsed(active: boolean) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (!active) {
      setSeconds(0);
      return;
    }
    const startedAt = Date.now();
    const timer = setInterval(() => setSeconds(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [active]);
  return seconds;
}

export type CallOverlayProps = {
  open: boolean;
  type: CallType;
  other: CallParticipant | null;
  phase: CallPhase;
  error: CallError;
  connectionState: RTCPeerConnectionState;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  micEnabled: boolean;
  cameraEnabled: boolean;
  onToggleMic: () => void;
  onToggleCamera: () => void;
  onSwitchCamera: () => void;
  onEnd: () => void;
};

export function CallOverlay({
  open,
  type,
  other,
  phase,
  error,
  connectionState,
  localStream,
  remoteStream,
  micEnabled,
  cameraEnabled,
  onToggleMic,
  onToggleCamera,
  onSwitchCamera,
  onEnd,
}: CallOverlayProps) {
  const localRef = useRef<HTMLVideoElement>(null);
  const remoteRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    if (localRef.current && localRef.current.srcObject !== localStream) {
      localRef.current.srcObject = localStream;
    }
  }, [localStream]);

  useEffect(() => {
    if (remoteRef.current && remoteRef.current.srcObject !== remoteStream) {
      remoteRef.current.srcObject = remoteStream;
    }
    if (remoteAudioRef.current && remoteAudioRef.current.srcObject !== remoteStream) {
      remoteAudioRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  const connected = phase === 'connected';
  const elapsed = useElapsed(connected);

  if (!open) return null;

  const statusLabel =
    phase === 'requesting-media'
      ? 'Starting your camera and microphone…'
      : phase === 'ringing'
        ? 'Calling…'
        : phase === 'connecting'
          ? 'Connecting…'
          : phase === 'failed'
            ? 'Call failed'
            : phase === 'ended'
              ? 'Call ended'
              : formatDuration(elapsed);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${type === 'VIDEO' ? 'Video' : 'Audio'} call`}
      className="fixed inset-0 z-[60] flex flex-col bg-[#070b18] text-white"
    >
      <div className="relative flex-1 overflow-hidden">
        {type === 'VIDEO' && remoteStream ? (
          <video
            ref={remoteRef}
            autoPlay
            playsInline
            className="h-full w-full bg-black object-cover"
            aria-label="Remote video"
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
            <Avatar
              name={other?.displayName ?? 'Member'}
              src={other?.avatarUrl ?? null}
              seed={other?.username}
              size="2xl"
            />
            <div>
              <p className="text-xl font-semibold">{other?.displayName ?? 'Member'}</p>
              {other?.username ? <p className="mt-1 text-sm text-slate-400">@{other.username}</p> : null}
            </div>
            <p className="text-sm text-slate-300" aria-live="polite">
              {statusLabel}
            </p>
            {type === 'VIDEO' && !remoteStream && phase !== 'failed' ? (
              <p className="max-w-sm text-xs text-slate-500">
                Waiting for the other person’s camera. Their video appears here as soon as it arrives.
              </p>
            ) : null}
          </div>
        )}

        {type === 'AUDIO' ? <audio ref={remoteAudioRef} autoPlay /> : null}

        <div className="absolute inset-x-0 top-0 flex items-center justify-between gap-3 bg-gradient-to-b from-black/60 to-transparent p-4">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{other?.displayName ?? 'Member'}</p>
            <p className="text-xs text-slate-300">
              {type === 'VIDEO' ? 'Video call' : 'Audio call'} · {statusLabel}
            </p>
          </div>
          {connected ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-1 text-[11px] font-medium text-emerald-300">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden="true" />
              Connected
            </span>
          ) : null}
        </div>

        {type === 'VIDEO' && localStream ? (
          <div className="absolute bottom-4 right-4 w-32 overflow-hidden rounded-xl border border-white/15 bg-black shadow-lg sm:w-44">
            <video
              ref={localRef}
              autoPlay
              playsInline
              muted
              className={cn('h-full w-full object-cover', !cameraEnabled && 'opacity-30')}
              aria-label="Your camera"
            />
            {!cameraEnabled ? (
              <span className="absolute inset-0 flex items-center justify-center text-[11px] text-slate-300">
                Camera off
              </span>
            ) : null}
          </div>
        ) : null}
      </div>

      {error ? (
        <div className="mx-4 mb-2 flex items-start gap-2 rounded-xl border border-rose-500/40 bg-rose-500/10 px-3 py-2.5 text-sm text-rose-200">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <div>
            <p>{error.message}</p>
            {error.code === 'CONNECTION_FAILED' || error.code === 'DISCONNECTED' ? (
              <p className="mt-1 text-xs text-rose-300/80">
                Connection state: {connectionState}. If this repeats, the deployment may need a TURN server
                configured in WEBRTC_TURN_URLS.
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-center gap-3 border-t border-white/10 bg-black/40 px-4 py-5">
        <button
          type="button"
          onClick={onToggleMic}
          aria-pressed={!micEnabled}
          aria-label={micEnabled ? 'Mute microphone' : 'Unmute microphone'}
          className={cn(
            'flex h-12 w-12 items-center justify-center rounded-full transition-colors',
            micEnabled ? 'bg-white/10 hover:bg-white/20' : 'bg-rose-600 hover:bg-rose-700',
          )}
        >
          {micEnabled ? <Mic className="h-5 w-5" aria-hidden="true" /> : <MicOff className="h-5 w-5" aria-hidden="true" />}
        </button>

        {type === 'VIDEO' ? (
          <>
            <button
              type="button"
              onClick={onToggleCamera}
              aria-pressed={!cameraEnabled}
              aria-label={cameraEnabled ? 'Turn camera off' : 'Turn camera on'}
              className={cn(
                'flex h-12 w-12 items-center justify-center rounded-full transition-colors',
                cameraEnabled ? 'bg-white/10 hover:bg-white/20' : 'bg-rose-600 hover:bg-rose-700',
              )}
            >
              {cameraEnabled ? (
                <Camera className="h-5 w-5" aria-hidden="true" />
              ) : (
                <CameraOff className="h-5 w-5" aria-hidden="true" />
              )}
            </button>
            <button
              type="button"
              onClick={onSwitchCamera}
              aria-label="Switch camera"
              className="flex h-12 w-12 items-center justify-center rounded-full bg-white/10 transition-colors hover:bg-white/20"
            >
              <RefreshCw className="h-5 w-5" aria-hidden="true" />
            </button>
          </>
        ) : (
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white/5 text-slate-500">
            <Video className="h-5 w-5" aria-hidden="true" />
          </span>
        )}

        <Button
          variant="danger"
          onClick={onEnd}
          leftIcon={<PhoneOff className="h-4 w-4" aria-hidden="true" />}
          className="h-12 rounded-full px-6"
        >
          End call
        </Button>
      </div>
    </div>
  );
}
