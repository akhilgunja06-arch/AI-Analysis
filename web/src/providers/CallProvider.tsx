import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from './AuthProvider';
import { useRealtime } from './RealtimeProvider';
import { usePeerConnection } from '@/hooks/usePeerConnection';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/components/ui/Toast';
import { CallOverlay } from '@/components/calls/CallOverlay';
import { IncomingCallSheet } from '@/components/calls/IncomingCallSheet';
import type { CallParticipant, CallSession, CallType, IceServer, IncomingCall } from '@/lib/types';

/**
 * Owns the lifecycle of one call at a time.
 *
 * Flow:
 *   1. startCall() asks the server to create a CallSession and ring the callee;
 *   2. the callee's socket receives call:incoming and the sheet appears;
 *   3. acceptCall() flips the row to ACCEPTED, which activates the peer
 *      connection on both sides — the caller is already waiting on that event;
 *   4. media flows peer-to-peer; the server only relays SDP and ICE;
 *   5. ending writes the final status and duration to the real call record.
 *
 * There is no mock path: if WebRTC or the microphone is unavailable, the call
 * fails visibly.
 */

type CallContextValue = {
  startCall: (username: string, type: CallType) => Promise<void>;
  inCall: boolean;
  starting: boolean;
};

const CallContext = createContext<CallContextValue>({
  startCall: async () => undefined,
  inCall: false,
  starting: false,
});

export function useCall() {
  return useContext(CallContext);
}

type ActiveCall = {
  id: string;
  type: CallType;
  role: 'CALLER' | 'CALLEE';
  other: CallParticipant;
  iceServers: IceServer[];
  /** Set once both sides have agreed to connect. */
  live: boolean;
};

export function CallProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  const { socket } = useRealtime();
  const queryClient = useQueryClient();
  const toast = useToast();

  const [incoming, setIncoming] = useState<IncomingCall | null>(null);
  const [active, setActive] = useState<ActiveCall | null>(null);
  const [starting, setStarting] = useState(false);
  const [answerBusy, setAnswerBusy] = useState(false);
  const ringTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const peer = usePeerConnection({
    socket,
    callId: active?.id ?? null,
    type: active?.type ?? 'AUDIO',
    iceServers: active?.iceServers ?? [],
    isCaller: active?.role === 'CALLER',
    active: Boolean(active?.live),
  });

  const clearRingTimer = useCallback(() => {
    if (ringTimer.current) clearTimeout(ringTimer.current);
    ringTimer.current = null;
  }, []);

  const finishLocally = useCallback(() => {
    clearRingTimer();
    peer.teardown();
    setActive(null);
    setIncoming(null);
    void queryClient.invalidateQueries({ queryKey: ['calls'] });
  }, [clearRingTimer, peer, queryClient]);

  // ---------------------------------------------------------------- outgoing

  const startCall = useCallback(
    async (username: string, type: CallType) => {
      if (active || incoming) {
        toast.warning('Already in a call', 'End the current call before starting another.');
        return;
      }
      setStarting(true);
      try {
        const res = await api.post<{ id: string; type: CallType; iceServers: IceServer[] }>('/calls', {
          username,
          type,
        });

        const session = await api.get<CallSession>(`/calls/${res.data.id}`);
        const detail = session.data;
        const other = detail.role === 'CALLER' ? detail.callee : detail.caller;

        setActive({
          id: detail.id,
          type: detail.type,
          role: 'CALLER',
          other,
          iceServers: res.data.iceServers,
          live: false,
        });
        peer.setPhase('ringing');
      } catch (err) {
        const message =
          err instanceof ApiError
            ? err.message
            : 'The call could not be started. Please try again.';
        toast.error('Could not start the call', message);
      } finally {
        setStarting(false);
      }
    },
    [active, incoming, peer, toast],
  );

  // ---------------------------------------------------------------- incoming

  const acceptCall = useCallback(async () => {
    if (!incoming) return;
    setAnswerBusy(true);
    try {
      const res = await api.post<{ status: string; iceServers: IceServer[] }>(
        `/calls/${incoming.callId}/accept`,
        {},
      );
      const session = await api.get<CallSession>(`/calls/${incoming.callId}`);
      const detail = session.data;
      const other = detail.role === 'CALLER' ? detail.callee : detail.caller;

      clearRingTimer();
      setActive({
        id: detail.id,
        type: detail.type,
        role: 'CALLEE',
        other,
        iceServers: res.data.iceServers,
        live: true,
      });
      setIncoming(null);
    } catch (err) {
      toast.error(
        'Could not answer',
        err instanceof ApiError ? err.message : 'That call is no longer available.',
      );
      setIncoming(null);
    } finally {
      setAnswerBusy(false);
    }
  }, [clearRingTimer, incoming, toast]);

  const declineCall = useCallback(async () => {
    if (!incoming) return;
    setAnswerBusy(true);
    try {
      await api.post(`/calls/${incoming.callId}/reject`, {});
    } catch {
      // The call may already be gone; either way it stops ringing here.
    } finally {
      clearRingTimer();
      setIncoming(null);
      setAnswerBusy(false);
    }
  }, [clearRingTimer, incoming]);

  const endCall = useCallback(async () => {
    const callId = active?.id;
    const wasLive = active?.live;
    finishLocally();
    if (callId) {
      try {
        await api.post(`/calls/${callId}/end`, {});
      } catch {
        // Best effort: the local teardown already released the devices.
      }
    }
    if (wasLive) toast.info('Call ended', 'The call has been closed.');
  }, [active, finishLocally, toast]);

  // ------------------------------------------------------------- signalling

  useEffect(() => {
    if (!socket) return;

    const onIncoming = (payload: IncomingCall) => {
      setIncoming(payload);
      clearRingTimer();
      // Mirrors the server-side ring timeout so a call that nobody answers is
      // not left ringing in this tab.
      ringTimer.current = setTimeout(() => {
        setIncoming((current) => (current?.callId === payload.callId ? null : current));
      }, Math.max(10, payload.ringTimeoutSeconds) * 1000);
    };

    const onAccepted = () => {
      setActive((current) => (current ? { ...current, live: true } : current));
      peer.setPhase('connecting');
    };

    const onRejected = (payload: { callId: string }) => {
      setActive((current) => {
        if (current?.id !== payload.callId) return current;
        toast.info('Call declined', 'The other person did not answer.');
        return null;
      });
      clearRingTimer();
    };

    const onEnded = () => {
      setActive((current) => {
        if (current) toast.info('Call ended', 'The other person hung up.');
        return null;
      });
      clearRingTimer();
    };

    socket.on('call:incoming', onIncoming);
    socket.on('call:accepted', onAccepted);
    socket.on('call:rejected', onRejected);
    socket.on('call:ended', onEnded);

    return () => {
      socket.off('call:incoming', onIncoming);
      socket.off('call:accepted', onAccepted);
      socket.off('call:rejected', onRejected);
      socket.off('call:ended', onEnded);
    };
  }, [socket, clearRingTimer, peer, toast]);

  // Release devices on sign-out.
  useEffect(() => {
    if (!isAuthenticated) finishLocally();
  }, [isAuthenticated, finishLocally]);

  // Tell the other participant when a live call is abandoned by closing the tab.
  // The socket is already authenticated, and the server writes the call record
  // from its REST endpoint, so this is only a courtesy hang-up signal.
  useEffect(() => {
    if (!active?.id || !socket) return;
    const callId = active.id;
    const onUnload = () => {
      socket.emit('call:hangup', { callId });
    };
    window.addEventListener('beforeunload', onUnload);
    return () => window.removeEventListener('beforeunload', onUnload);
  }, [active?.id, socket]);

  const value = useMemo<CallContextValue>(
    () => ({ startCall, inCall: Boolean(active), starting }),
    [startCall, active, starting],
  );

  return (
    <CallContext.Provider value={value}>
      {children}
      <IncomingCallSheet call={incoming} onAccept={acceptCall} onDecline={declineCall} busy={answerBusy} />
      <CallOverlay
        open={Boolean(active)}
        type={active?.type ?? 'AUDIO'}
        other={active?.other ?? null}
        phase={peer.phase}
        error={peer.error}
        connectionState={peer.connectionState}
        localStream={peer.localStream}
        remoteStream={peer.remoteStream}
        micEnabled={peer.micEnabled}
        cameraEnabled={peer.cameraEnabled}
        onToggleMic={peer.toggleMic}
        onToggleCamera={peer.toggleCamera}
        onSwitchCamera={() => void peer.switchCamera()}
        onEnd={() => void endCall()}
      />
    </CallContext.Provider>
  );
}
