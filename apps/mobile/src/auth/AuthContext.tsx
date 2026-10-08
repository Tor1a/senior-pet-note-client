// 로그인 상태 관리
// 상태 흐름:
//   'loading'   앱 시작 직후 저장된 토큰을 읽고 /api/me 로 확인하는 중
//   'signedOut' 토큰 없음 또는 만료(401) → 로그인 화면
//   'signedIn'  토큰 있음 → 오늘 화면
// 서버에 연결하지 못해 /api/me 를 확인할 수 없으면 토큰을 지우지 않고 signedIn 으로 둔다(user 는 null).
// 오프라인일 때마다 로그아웃되면 보호자가 불편하기 때문이다. 토큰이 실제로 만료됐다면 다음 요청의 401 에서 로그아웃된다.

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { AuthMode } from '../lib/loginForm';
import type { User } from '../lib/api';
import { ApiError } from '../lib/api';
import { api, onUnauthorized } from '../services/client';
import { clearPreferences } from '../services/preferences';
import { releaseMobileDevice } from '../services/pushDevice';
import { clearToken, loadToken, saveToken } from '../services/tokenStorage';

export type AuthStatus = 'loading' | 'signedOut' | 'signedIn';

interface AuthContextValue {
  status: AuthStatus;
  /** 로그인한 사용자. 오프라인으로 시작해 확인하지 못했으면 null */
  user: User | null;
  /** 로그인 또는 회원가입. 실패하면 ApiError 를 던진다(화면에서 toUserMessage 로 문구 변환). */
  authenticate: (mode: AuthMode, email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  /** 비밀번호 변경 성공: 응답의 새 토큰으로 즉시 교체한다(이전 토큰은 모두 401 이 된다). 로그인은 유지 */
  replaceToken: (accessToken: string) => Promise<boolean>;
  /** 탈퇴 204 후: 서버 기기 해제 없이 기기·토큰·로컬 정리 → 로그인 화면(탈퇴 안내 포함) */
  finishWithdrawal: () => Promise<void>;
  /** 로그인 화면에 탈퇴 완료 안내를 보일지 */
  farewell: boolean;
  clearFarewell: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<User | null>(null);
  const [farewell, setFarewell] = useState(false);

  // 앱 시작: 저장된 토큰 확인
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const token = await loadToken();
      if (!token) {
        if (!cancelled) setStatus('signedOut');
        return;
      }
      try {
        const me = await api.me();
        if (!cancelled) {
          setUser(me);
          setStatus('signedIn');
        }
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.kind === 'network') {
          setStatus('signedIn'); // 오프라인: 토큰 유지
        } else {
          await clearToken();
          setStatus('signedOut');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // 어떤 요청이든 토큰 만료(401)를 받으면 로그아웃 상태로
  useEffect(
    () =>
      onUnauthorized(() => {
        // 토큰이 이미 무효라 서버 해제는 못 한다 → Firebase 토큰과 로컬 기기 id 만 정리
        void releaseMobileDevice(false);
        setUser(null);
        setStatus('signedOut');
      }),
    [],
  );

  const authenticate = useCallback(async (mode: AuthMode, email: string, password: string) => {
    const trimmed = email.trim();
    const res = mode === 'signup' ? await api.signup(trimmed, password) : await api.login(trimmed, password);
    await saveToken(res.accessToken);
    setFarewell(false);
    setUser(res.user);
    setStatus('signedIn');
  }, []);

  const signOut = useCallback(async () => {
    // 서버에 로그아웃 API 는 없다(JWT, refresh 없음). 다만 이 기기 알림은 로그인 토큰을 지우기 전에
    // 해제한다(DELETE /api/devices/{id}, 최대 3초, 실패해도 진행).
    await releaseMobileDevice(true);
    await clearToken();
    setUser(null);
    setStatus('signedOut');
  }, []);

  const replaceToken = useCallback(async (accessToken: string) => {
    // 서버는 이미 새 비밀번호·새 토큰으로 바뀌었다. 메모리 토큰은 새 것으로 바뀌고(이번 실행은 계속 쓸 수 있다),
    // 기기 저장만 실패하면 false 를 돌려 화면이 "다시 로그인" 안내를 덧붙이게 한다(던지지 않는다).
    try {
      await saveToken(accessToken);
      return true;
    } catch {
      return false;
    }
  }, []);

  const finishWithdrawal = useCallback(async () => {
    // 계정이 이미 없어 서버 DELETE 는 못 한다 → Firebase 토큰과 로컬 기기 id 만 정리(최대 3초)
    await releaseMobileDevice(false);
    await clearToken();
    await clearPreferences();
    setUser(null);
    setFarewell(true);
    setStatus('signedOut'); // _layout 의 Stack.Protected 가 로그인 화면으로 보낸다(스택도 정리된다)
  }, []);

  const clearFarewell = useCallback(() => setFarewell(false), []);

  const value = useMemo(
    () => ({ status, user, authenticate, signOut, replaceToken, finishWithdrawal, farewell, clearFarewell }),
    [status, user, authenticate, signOut, replaceToken, finishWithdrawal, farewell, clearFarewell],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth 는 AuthProvider 안에서만 쓸 수 있어요.');
  return ctx;
}
