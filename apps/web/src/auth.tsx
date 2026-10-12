import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ApiError, type User } from './lib/api';
import { api, UNAUTHORIZED_EVENT } from './lib/client';
import { clearToken, getToken, setToken, swTokenCopySettled, syncSwTokenCopy } from './lib/tokenStorage';
import { clearLocalAppData } from './lib/localData';
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
  /** 비밀번호 변경 성공: 응답의 새 토큰으로 즉시 교체한다(이전 토큰은 모두 401 이 된다). 로그인은 유지 */
  replaceToken: (accessToken: string) => void;
  /** 탈퇴 204 후: 서버 기기 해제 없이 기기·토큰·로컬 정리 → 로그인 화면(탈퇴 안내 포함) */
  finishWithdrawal: () => Promise<void>;
  /** 로그인 화면에 탈퇴 완료 안내를 보일지 */
  farewell: boolean;
  clearFarewell: () => void;
  /** 서버 연결 실패 후 다시 세션 확인 */
  retry: () => void;
}

/** 로그인 없이 보는 공개 경로. 여기서는 401 을 받아도 토큰만 정리하고 /login 으로 보내지 않는다 */
export const PUBLIC_PATHS: readonly string[] = ['/delete-account'];

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * 서비스워커 토큰 사본 삭제를 기다리고, 끝내 지우지 못했으면(재시도·덮어쓰기·deleteDatabase 모두 실패) 개발자 콘솔에만 알린다.
 * 로그아웃·탈퇴는 이 결과와 상관없이 계속 진행한다(보안상 로그아웃을 막으면 오히려 토큰이 남는다). 토큰 값은 남기지 않는다.
 */
async function settleSwCopy(): Promise<void> {
  const ok = await swTokenCopySettled();
  if (!ok) console.warn('서비스워커 토큰 사본을 지웠는지 확인하지 못했어요.');
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;
  const [status, setStatus] = useState<AuthStatus>(() => (getToken() ? 'loading' : 'signedOut'));
  const [user, setUser] = useState<User | null>(null);
  const [farewell, setFarewell] = useState(false);

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

  // 앱 시작 시 알림 버튼용 서비스워커 토큰 사본을 현재 로그인 상태에 맞춘다(없으면 지우고, 있으면 같은 값으로 저장)
  useEffect(() => {
    syncSwTokenCopy();
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
      // 공개 경로(/delete-account)에서는 페이지를 그대로 둔다
      if (!PUBLIC_PATHS.includes(pathnameRef.current)) navigate('/login', { replace: true });
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
        setFarewell(false);
        setToken(res.accessToken);
        setUser(res.user);
        setStatus('signedIn');
      },
      signup: async (email, password) => {
        const res = await api.signup(email, password);
        setFarewell(false);
        setToken(res.accessToken);
        setUser(res.user);
        setStatus('signedIn');
      },
      logout: async () => {
        // 서버에 로그아웃 API 는 없다(refresh 토큰 없음). 다만 이 기기 알림은 로그인 토큰을 지우기 "전에"
        // 해제해야 한다(DELETE /api/devices/{id}, 최대 3초, 실패해도 로그아웃은 진행).
        await releaseWebDevice(true);
        clearToken();
        await settleSwCopy(); // 서비스워커 토큰 사본 삭제를 마친 뒤 화면을 넘긴다(최대 1초)
        setUser(null);
        setStatus('signedOut');
        navigate('/login', { replace: true });
      },
      replaceToken: (accessToken) => setToken(accessToken),
      finishWithdrawal: async () => {
        // 계정이 이미 없어 서버 DELETE 는 못 한다 → Firebase 토큰과 로컬 기기 id 만 정리(최대 3초)
        await releaseWebDevice(false);
        clearToken();
        clearLocalAppData();
        await settleSwCopy();
        setUser(null);
        setFarewell(true);
        setStatus('signedOut');
        navigate('/login', { replace: true });
      },
      farewell,
      clearFarewell: () => setFarewell(false),
      retry: () => void checkSession(),
    }),
    [status, user, farewell, navigate, checkSession],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth 는 AuthProvider 안에서만 쓸 수 있어요.');
  return ctx;
}
