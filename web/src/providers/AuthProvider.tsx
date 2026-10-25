import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, bootstrapSession, setAccessToken, setUnauthenticatedHandler } from '@/lib/api';
import type { Completion, Preferences, Profile, SessionUser } from '@/lib/types';

type MeResponse = SessionUser & {
  createdAt: string;
  lastLoginAt: string | null;
  profile: Profile | null;
  preferences: Preferences | null;
};

type AuthState = {
  user: SessionUser | null;
  profile: Profile | null;
  preferences: Preferences | null;
  completion: Completion | null;
  /** True until the initial session bootstrap has finished. */
  loading: boolean;
  isAuthenticated: boolean;
  isStaff: boolean;
  isAdmin: boolean;
  isVerified: boolean;
  refresh: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<SessionUser>;
  register: (input: {
    email: string;
    username: string;
    password: string;
    displayName: string;
    acceptedTerms: boolean;
  }) => Promise<{ user: SessionUser; devVerificationToken?: string }>;
  signOut: () => Promise<void>;
  applyProfileUpdate: (profile: Profile, completion: Completion) => void;
  setPreferences: (preferences: Preferences) => void;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [preferences, setPreferences] = useState<Preferences | null>(null);
  const [completion, setCompletion] = useState<Completion | null>(null);
  const [loading, setLoading] = useState(true);

  const clear = useCallback(() => {
    setAccessToken(null);
    setUser(null);
    setProfile(null);
    setPreferences(null);
    setCompletion(null);
    queryClient.clear();
  }, [queryClient]);

  const loadMe = useCallback(async () => {
    const [me, onboarding] = await Promise.all([
      api.get<MeResponse>('/auth/me'),
      api.get<{ completion: Completion }>('/profile/onboarding'),
    ]);
    setUser({
      id: me.data.id,
      email: me.data.email,
      username: me.data.username,
      role: me.data.role,
      status: me.data.status,
      emailVerified: me.data.emailVerified,
    });
    setProfile(me.data.profile);
    setPreferences(me.data.preferences);
    setCompletion(onboarding.data.completion);
  }, []);

  const refresh = useCallback(async () => {
    try {
      await loadMe();
    } catch {
      clear();
    }
  }, [loadMe, clear]);

  // The API client calls this when a token refresh fails, so the UI can react.
  useEffect(() => {
    setUnauthenticatedHandler(() => {
      setAccessToken(null);
      setUser(null);
      setProfile(null);
      setPreferences(null);
      setCompletion(null);
    });
    return () => setUnauthenticatedHandler(null);
  }, []);

  // Restore the session from the httpOnly refresh cookie on first load.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const restored = await bootstrapSession();
      if (cancelled) return;
      if (restored) {
        try {
          await loadMe();
        } catch {
          /* fall through to the signed-out state */
        }
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [loadMe]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      const res = await api.post<{ user: SessionUser; accessToken: string }>('/auth/login', {
        email,
        password,
      });
      setAccessToken(res.data.accessToken);
      await loadMe();
      return res.data.user;
    },
    [loadMe],
  );

  const register = useCallback<AuthState['register']>(
    async (input) => {
      const res = await api.post<{
        user: SessionUser;
        accessToken: string;
        devVerificationToken?: string;
      }>('/auth/register', input);
      setAccessToken(res.data.accessToken);
      await loadMe();
      return { user: res.data.user, devVerificationToken: res.data.devVerificationToken };
    },
    [loadMe],
  );

  const signOut = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      /* clearing local state is what matters */
    }
    clear();
  }, [clear]);

  const applyProfileUpdate = useCallback((nextProfile: Profile, nextCompletion: Completion) => {
    setProfile(nextProfile);
    setCompletion(nextCompletion);
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      user,
      profile,
      preferences,
      completion,
      loading,
      isAuthenticated: Boolean(user),
      isStaff: user?.role === 'ADMIN' || user?.role === 'MODERATOR',
      isAdmin: user?.role === 'ADMIN',
      isVerified: Boolean(user?.emailVerified),
      refresh,
      signIn,
      register,
      signOut,
      applyProfileUpdate,
      setPreferences,
    }),
    [
      user,
      profile,
      preferences,
      completion,
      loading,
      refresh,
      signIn,
      register,
      signOut,
      applyProfileUpdate,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside an AuthProvider.');
  return context;
}
