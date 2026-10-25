import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { io, type Socket } from 'socket.io-client';
import { useQueryClient } from '@tanstack/react-query';
import { getAccessToken } from '@/lib/api';
import { useAuth } from './AuthProvider';

// Same reasoning as API_URL: same-origin by default so the proxy can carry the
// websocket upgrade. Override with VITE_SOCKET_URL when the API is elsewhere.
const SOCKET_URL =
  (import.meta.env.VITE_SOCKET_URL as string | undefined) ?? window.location.origin;

type RealtimeState = {
  socket: Socket | null;
  connected: boolean;
  /** Set when the socket could not connect, so the UI can explain itself. */
  unavailable: boolean;
};

const RealtimeContext = createContext<RealtimeState>({
  socket: null,
  connected: false,
  unavailable: false,
});

/**
 * Realtime layer.
 *
 * The socket is authenticated with the same access token as the REST API and the
 * server only ever joins the client to its own rooms. If the connection cannot
 * be established the rest of the app continues to work — chat simply refreshes
 * on demand instead of pushing.
 */
export function RealtimeProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, user } = useAuth();
  const queryClient = useQueryClient();
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [socket, setSocket] = useState<Socket | null>(null);

  useEffect(() => {
    if (!isAuthenticated || !user) {
      socketRef.current?.disconnect();
      socketRef.current = null;
      setSocket(null);
      setConnected(false);
      return;
    }

    const token = getAccessToken();
    if (!token) return;

    const instance = io(SOCKET_URL, {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      auth: { token },
      withCredentials: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1500,
    });

    socketRef.current = instance;
    setSocket(instance);

    instance.on('connect', () => {
      setConnected(true);
      setUnavailable(false);
    });

    instance.on('disconnect', () => setConnected(false));

    instance.on('connect_error', () => {
      setConnected(false);
      // After the retry budget is spent, surface it once rather than spamming.
      if (!instance.active) setUnavailable(true);
    });

    // A new notification or message invalidates the relevant cached queries so
    // the badges and lists update without a manual refresh.
    instance.on('notification:new', () => {
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      void queryClient.invalidateQueries({ queryKey: ['messages', 'unread'] });
    });

    instance.on('message:new', (payload: { conversationId?: string }) => {
      void queryClient.invalidateQueries({ queryKey: ['messages', 'conversations'] });
      void queryClient.invalidateQueries({ queryKey: ['messages', 'unread'] });
      if (payload?.conversationId) {
        void queryClient.invalidateQueries({ queryKey: ['messages', 'thread', payload.conversationId] });
      }
    });

    return () => {
      instance.removeAllListeners();
      instance.disconnect();
      socketRef.current = null;
      setSocket(null);
      setConnected(false);
    };
  }, [isAuthenticated, user, queryClient]);

  const value = useMemo<RealtimeState>(() => ({ socket, connected, unavailable }), [socket, connected, unavailable]);

  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}

export function useRealtime(): RealtimeState {
  return useContext(RealtimeContext);
}
