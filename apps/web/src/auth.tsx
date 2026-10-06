import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError, type User } from './lib/api';
import { api, UNAUTHORIZED_EVENT } from './lib/client';
import { clearToken, getToken, setToken } from './lib/tokenStorage';

// 로그인 상태를 앱 전체에 공유한다.
//   loading   : 앱 시작 시 /api/me 로 세션 확인 중
//   signedIn  : 로그인됨 (user 있음)
//   signedOut : 로그인 안 됨
//   offline   : 저장된 토큰은 있는데 서버에 연결하지 못해 확인할 수 없음
export type AuthStatus = 'loading' | 'signedIn' | 'signedOut' | 'offline';

interface AuthContextValue {
  status: AuthStatus;
  user: User | null;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string) => Promise<void>;
  logout: () => void;
  /** 서버 연결 실패 후 다시 세션 확인 */
  retry: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const [status, setStatus] = useState<AuthStatus>(() => (getToken() ? 'loading' : 'signedOut'));
  const [user, setUser] = useState<User | null>(null);

  const checkSession = useCallback(async () => {
    if (!getToken()) {
      setUser(null);
      setStatus('signedOut');
      return;
    }
    setStatus('loading');
    try {
      const me = await api.me();
      setUser(me);
      setStatus('signedIn');
    } catch (err) {
      if (err instanceof ApiError && err.kind === 'network') {
        // 서버가 꺼져 있거나 인터넷이 끊김 → 토큰은 지우지 않고 안내 화면
        setStatus('offline');
      } else {
        // 401 등 → 토큰이 무효. (401 은 client.ts 에서 이미 토큰을 지운다)
        clearToken();
        setUser(null);
        setStatus('signedOut');
      }
    }
  }, []);

  // 앱 시작 시 세션 확인
  useEffect(() => {
    void checkSession();
  }, [checkSession]);

  // 어떤 요청이든 401 을 받으면 로그아웃 후 /login 으로
  useEffect(() => {
    const onUnauthorized = () => {
      setUser(null);
      setStatus('signedOut');
      navigate('/login', { replace: true });
    };
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, [navigate]);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      login: async (email, password) => {
        const res = await api.login(email, password);
        setToken(res.accessToken);
        setUser(res.user);
        setStatus('signedIn');
      },
      signup: async (email, password) => {
        const res = await api.signup(email, password);
        setToken(res.accessToken);
        setUser(res.user);
        setStatus('signedIn');
      },
      logout: () => {
        // refresh 토큰이 없으므로 서버 호출 없이 토큰만 지운다
        clearToken();
        setUser(null);
        setStatus('signedOut');
        navigate('/login', { replace: true });
      },
      retry: () => void checkSession(),
    }),
    [status, user, navigate, checkSession],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth 는 AuthProvider 안에서만 쓸 수 있어요.');
  return ctx;
}
