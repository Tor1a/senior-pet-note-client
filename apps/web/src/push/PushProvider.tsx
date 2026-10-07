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
import { useLocation, useNavigate } from 'react-router-dom';
import { formatTime } from '../lib/format';
import { parseMedReminderData, type MedReminderData } from '../lib/reminderApi';
import { RegistrationSupersededError } from '../lib/pushDevice';
import { registerWebDevice } from './device';
import { isMobileDevice, readBrowserEnv, webPush } from './webPush';

// 이 기기(브라우저)의 알림 상태와 포그라운드 배너 (기획서 C2~C9, 화면 설계 13장·S8)
// - 로그인한 화면(RequireAuth 안)에서만 동작한다.
// - 권한이 이미 허용돼 있으면 시작할 때 조용히 토큰을 얻어 PUT /api/devices (lastSeenAt 갱신 겸 토큰 갱신)
// - 권한이 "아직 안 물어봄"이면 아무것도 묻지 않는다. 화면의 버튼(requestPermission)에서만 묻는다.

/**
 * 이 기기 상태
 *   checking     : 확인 중
 *   unavailable  : Firebase 설정 없음(개발 환경)·서비스워커 없음
 *   ios-browser  : iPhone·iPad 브라우저 탭 → 홈 화면에 추가 안내
 *   ios-outdated : iOS 16.4 미만으로 보임
 *   unsupported  : 알림을 지원하지 않는 브라우저
 *   default      : 아직 안 물어봄
 *   denied       : 막힘
 *   registering  : 허용됨, 기기 등록 중
 *   registered   : 허용됨 + 등록 완료(이 기기에서 받을 수 있음)
 *   error        : 허용됐지만 등록 실패(다시 시도 가능)
 */
export type PushDeviceState =
  | 'checking'
  | 'unavailable'
  | 'ios-browser'
  | 'ios-outdated'
  | 'unsupported'
  | 'default'
  | 'denied'
  | 'registering'
  | 'registered'
  | 'error';

/** 포그라운드에서 받은 투약 알림 */
export interface PushBannerMessage extends MedReminderData {
  key: string;
  title: string;
  body: string;
}

export interface PushContextValue {
  state: PushDeviceState;
  /** 휴대폰·태블릿이면 true (문구 "이 휴대폰"/"이 기기", 데스크톱 안내 구분) */
  isMobile: boolean;
  /** 권한 요청 → 허용되면 기기 등록. 반드시 버튼 클릭 처리 안에서 부른다 */
  requestPermission: () => Promise<PushDeviceState>;
  /** 등록 실패(error) 후 다시 시도, 또는 권한 상태 다시 확인 */
  recheck: () => Promise<PushDeviceState>;
  /** 포그라운드 투약 알림 구독(오늘 화면 새로 고침용). 해제 함수를 돌려준다 */
  subscribe: (listener: (msg: PushBannerMessage) => void) => () => void;
}

/** Provider 가 없을 때(화면 단독 테스트 등) 쓰는 값: 알림 사용 불가 */
const FALLBACK: PushContextValue = {
  state: 'unavailable',
  isMobile: false,
  requestPermission: async () => 'unavailable',
  recheck: async () => 'unavailable',
  subscribe: () => () => {},
};

export const PushContext = createContext<PushContextValue | null>(null);

export function usePush(): PushContextValue {
  return useContext(PushContext) ?? FALLBACK;
}

/** 포그라운드 투약 알림을 받을 때마다 부른다(최신 콜백 유지) */
export function usePushMessages(listener: (msg: PushBannerMessage) => void): void {
  const { subscribe } = usePush();
  const ref = useRef(listener);
  ref.current = listener;
  useEffect(() => subscribe((m) => ref.current(m)), [subscribe]);
}

/** 이 기기에서 알림을 받을 수 없는 상태인지(약 목록 상태 줄 2줄째, 저장 문구) */
export function cannotReceive(state: PushDeviceState): boolean {
  return state !== 'registered' && state !== 'registering' && state !== 'checking';
}

export const TODAY_PUSH_PATH = '/today?source=push';

/** 알림 탭·배너 버튼으로 갈 곳. 해당 약 카드를 강조하도록 medicationId 를 싣는다 */
export const todayPushPath = (medicationId: string) => `${TODAY_PUSH_PATH}&med=${encodeURIComponent(medicationId)}`;

export function PushProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PushDeviceState>('checking');
  const [messages, setMessages] = useState<PushBannerMessage[]>([]);
  const listeners = useRef(new Set<(m: PushBannerMessage) => void>());
  const stateRef = useRef<PushDeviceState>('checking');
  const navigate = useNavigate();
  const location = useLocation();
  const isMobile = useMemo(() => isMobileDevice(readBrowserEnv()), []);

  const update = useCallback((next: PushDeviceState) => {
    stateRef.current = next;
    setState(next);
    return next;
  }, []);

  // 등록·권한 확인이 겹쳐 불려도(시작·visibilitychange·버튼) 한 번만 돈다
  const registerInflight = useRef<Promise<PushDeviceState> | null>(null);
  const syncInflight = useRef<Promise<PushDeviceState> | null>(null);

  const register = useCallback((): Promise<PushDeviceState> => {
    if (registerInflight.current) return registerInflight.current;
    update('registering');
    const p = (async (): Promise<PushDeviceState> => {
      try {
        await registerWebDevice();
        return update('registered');
      } catch (err) {
        // 등록 도중 로그아웃됨: 결과를 버리고 상태를 건드리지 않는다
        if (err instanceof RegistrationSupersededError) return stateRef.current;
        // 화면을 막지 않는다. 상태만 error → [다시 시도], 다음 시작 때 다시 등록한다
        return update('error');
      } finally {
        registerInflight.current = null;
      }
    })();
    registerInflight.current = p;
    return p;
  }, [update]);

  /** 권한 상태를 읽어 상태를 맞춘다. granted 면 등록(토큰 갱신 겸) */
  const syncPermission = useCallback((): Promise<PushDeviceState> => {
    if (syncInflight.current) return syncInflight.current;
    const p = (async (): Promise<PushDeviceState> => {
      try {
        const support = await webPush.support();
        if (support !== 'ok') return update(support);
        const permission = webPush.permission();
        if (permission === 'granted') return await register();
        return update(permission === 'denied' ? 'denied' : 'default');
      } finally {
        syncInflight.current = null;
      }
    })();
    syncInflight.current = p;
    return p;
  }, [register, update]);

  // 시작(로그인·세션 확인 성공 직후)
  useEffect(() => {
    void syncPermission();
  }, [syncPermission]);

  // 브라우저 설정에서 알림을 허용하고 돌아오면 다시 확인 → 허용이면 등록
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      const s = stateRef.current;
      if ((s === 'denied' || s === 'default') && webPush.permission() === 'granted') void register();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [register]);

  // 포그라운드 메시지: 시스템 알림 대신 화면 배너
  useEffect(() => {
    if (state !== 'registered') return;
    let unsubscribe: (() => void) | null = null;
    let cancelled = false;
    void webPush
      .onForeground((msg) => {
        const data = parseMedReminderData(msg.data);
        if (!data) return; // 알 수 없는 알림은 무시
        const item: PushBannerMessage = {
          ...data,
          key: `${data.medicationId}:${data.recordDate}:${data.scheduledTime}`,
          title: msg.notification?.title ?? '투약 시간이에요',
          body: msg.notification?.body ?? '',
        };
        setMessages((list) => [...list.filter((m) => m.key !== item.key), item]);
        listeners.current.forEach((l) => l(item));
      })
      .then((off) => {
        if (cancelled) off();
        else unsubscribe = off;
      });
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [state]);

  const requestPermission = useCallback(async (): Promise<PushDeviceState> => {
    // 클릭 처리 안에서 바로 권한 창을 띄운다(다른 await 보다 먼저)
    const result = await webPush.requestPermission();
    if (result === 'granted') return register();
    return update(result === 'denied' ? 'denied' : 'default');
  }, [register, update]);

  const subscribe = useCallback((listener: (m: PushBannerMessage) => void) => {
    listeners.current.add(listener);
    return () => {
      listeners.current.delete(listener);
    };
  }, []);

  const value = useMemo<PushContextValue>(
    () => ({ state, isMobile, requestPermission, recheck: syncPermission, subscribe }),
    [state, isMobile, requestPermission, syncPermission, subscribe],
  );

  const onToday = location.pathname === '/today';

  return (
    <PushContext.Provider value={value}>
      {messages.length > 0 && (
        <PushBanner
          messages={messages}
          onToday={onToday}
          onClose={() => setMessages([])}
          onOpenToday={() => {
            const last = messages[messages.length - 1];
            setMessages([]);
            navigate(last ? todayPushPath(last.medicationId) : TODAY_PUSH_PATH);
          }}
        />
      )}
      {children}
    </PushContext.Provider>
  );
}

const BANNER_MAX_LINES = 3;

/** S8 인앱 배너. 자동으로 사라지지 않는다(읽을 시간 보장). Esc·[닫기]·버튼으로 닫힘 */
export function PushBanner({
  messages,
  onToday,
  onClose,
  onOpenToday,
}: {
  messages: PushBannerMessage[];
  onToday: boolean;
  onClose: () => void;
  onOpenToday: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const shown = messages.slice(0, BANNER_MAX_LINES);
  const rest = messages.length - shown.length;
  const single = messages.length === 1;

  return (
    <div className="push-banner" role="status">
      <div className="row-between push-banner-head">
        <p className="strong">
          <span aria-hidden="true">🔔 </span>
          {messages[messages.length - 1].title}
        </p>
        <button type="button" className="btn-link push-banner-close" aria-label="알림 닫기" onClick={onClose}>
          닫기
        </button>
      </div>
      <ul className="push-banner-list">
        {shown.map((m) => (
          <li key={m.key}>
            {m.body}
            {single && m.scheduledTime ? ` · ${formatTime(m.scheduledTime)}` : ''}
          </li>
        ))}
      </ul>
      {rest > 0 && <p className="muted">외 {rest}개</p>}
      {onToday ? (
        <p>아래 목록에서 [먹였어요]를 눌러 주세요.</p>
      ) : (
        <button type="button" className="btn-primary" onClick={onOpenToday}>
          오늘 화면에서 체크하기
        </button>
      )}
    </div>
  );
}
