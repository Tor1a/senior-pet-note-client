import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError, type User } from './lib/api';
import { api, UNAUTHORIZED_EVENT } from './lib/client';
import { clearToken, getToken, setToken } from './lib/tokenStorage';
import { releaseWebDevice } from './push/device';

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
  /** 이 기기 알림 해제(최대 3초)를 기다린 뒤 로그아웃한다 */
  logout: () => Promise<void>;
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
      // 토큰이 이미 무효라 서버 기기 해제(DELETE)는 못 한다 → Firebase 토큰과 로컬 기기 id 만 정리
      // (서버의 "같은 토큰 재등록 시 현재 계정으로 이전" 규칙이 다음 로그인 때 정리한다)
      void releaseWebDevice(false);
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
      logout: async () => {
        // 서버에 로그아웃 API 는 없다(refresh 토큰 없음). 다만 이 기기 알림은 로그인 토큰을 지우기 "전에"
        // 해제해야 한다(DELETE /api/devices/{id}, 최대 3초, 실패해도 로그아웃은 진행).
        await releaseWebDevice(true);
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
