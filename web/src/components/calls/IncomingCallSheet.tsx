import { Phone, PhoneOff, Video } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { cn } from '@/lib/utils';
import type { IncomingCall } from '@/lib/types';

/**
 * The incoming-call sheet.
 *
 * It only appears when the server pushes a real `call:incoming` event for a call
 * row that names this member as the callee, so it can never ring for a call that
 * does not exist.
 */
export function IncomingCallSheet({
  call,
  onAccept,
  onDecline,
  busy,
}: {
  call: IncomingCall | null;
  onAccept: () => void;
  onDecline: () => void;
  busy: boolean;
}) {
  if (!call) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Incoming ${call.type === 'VIDEO' ? 'video' : 'audio'} call`}
      className="fixed inset-0 z-[70] flex items-center justify-center bg-[#070b18]/90 px-4 backdrop-blur-sm"
    >
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#101736] p-6 text-center text-white shadow-2xl">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-medium text-slate-200">
          {call.type === 'VIDEO' ? (
            <Video className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <Phone className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          Incoming {call.type === 'VIDEO' ? 'video' : 'audio'} call
        </span>

        <div className="mt-6 flex flex-col items-center gap-3">
          <span className="relative flex">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400/30" />
            <Avatar
              name={call.from.displayName}
              src={call.from.avatarUrl}
              seed={call.from.username}
              size="xl"
              className="relative"
            />
          </span>
          <div>
            <p className="text-lg font-semibold">{call.from.displayName}</p>
            <p className="text-sm text-slate-400">@{call.from.username}</p>
          </div>
        </div>

        <div className="mt-8 flex items-center justify-center gap-4">
          <button
            type="button"
            onClick={onDecline}
            disabled={busy}
            className={cn(
              'flex h-14 w-14 items-center justify-center rounded-full bg-rose-600 text-white transition-colors hover:bg-rose-700',
              busy && 'opacity-60',
            )}
            aria-label="Decline call"
          >
            <PhoneOff className="h-5 w-5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={onAccept}
            disabled={busy}
            className={cn(
              'flex h-14 w-14 items-center justify-center rounded-full bg-emerald-600 text-white transition-colors hover:bg-emerald-700',
              busy && 'opacity-60',
            )}
            aria-label="Accept call"
          >
            <Phone className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <p className="mt-5 text-[11px] text-slate-500">
          Your browser will ask for microphone{call.type === 'VIDEO' ? ' and camera' : ''} access when you
          answer. Nothing is recorded.
        </p>
      </div>
    </div>
  );
}
