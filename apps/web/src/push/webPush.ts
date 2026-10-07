// 웹 푸시(FCM) 연결부 — 기획서 6-1, 6-3, 6-6
// - firebase 는 dynamic import 로 늦게 불러온다. 설정(VITE_FIREBASE_*)이 없으면 아예 불러오지 않는다.
// - Messaging 외 Firebase 제품은 import 하지 않는다.
// - 서비스워커는 PWA 와 같은 하나(src/sw.ts)를 쓰고, getToken 에 그 등록을 넘긴다(firebase-messaging-sw.js 없음).
// - 권한 요청은 반드시 버튼 클릭 처리 안에서만 부른다(requestPermission). 앱 시작 때 묻지 않는다.
import { pushConfig } from './pushSetup';
import type { PushConfigStatus } from '../lib/pushConfig';

/**
 * 이 브라우저의 알림 가능 여부
 *   unavailable  : Firebase 설정이 없음(개발 환경) 또는 서비스워커가 없음(npm run dev)
 *   ios-browser  : iPhone·iPad 의 브라우저 탭(홈 화면에 추가한 앱에서만 가능)
 *   ios-outdated : 홈 화면 앱인데 지원 안 함 → iOS 16.4 미만으로 본다
 *   unsupported  : Notification/Push 가 없는 브라우저(앱 내장 브라우저 등)
 *   ok           : 알림 가능(권한은 따로 확인)
 */
export type PushSupport = 'unavailable' | 'ios-browser' | 'ios-outdated' | 'unsupported' | 'ok';

export interface ForegroundMessage {
  notification?: { title?: string; body?: string };
  data?: Record<string, string>;
}

/** 브라우저 환경 정보(테스트에서 바꿔 넣는다) */
export interface BrowserEnv {
  userAgent: string;
  maxTouchPoints: number;
  standalone: boolean;
  hasNotification: boolean;
  hasServiceWorker: boolean;
  hasPushManager: boolean;
}

export function readBrowserEnv(): BrowserEnv {
  const nav = typeof navigator === 'undefined' ? undefined : navigator;
  const win = typeof window === 'undefined' ? undefined : window;
  const standalone =
    (!!win && typeof win.matchMedia === 'function' && win.matchMedia('(display-mode: standalone)').matches) ||
    (nav as (Navigator & { standalone?: boolean }) | undefined)?.standalone === true;
  return {
    userAgent: nav?.userAgent ?? '',
    maxTouchPoints: nav?.maxTouchPoints ?? 0,
    standalone,
    hasNotification: !!win && 'Notification' in win,
    hasServiceWorker: !!nav && 'serviceWorker' in nav,
    hasPushManager: !!win && 'PushManager' in win,
  };
}

/** iPhone·iPad (iPadOS 13+ 는 Mac 처럼 보이므로 터치 지점 수로 구분) */
export function isIosDevice(env: Pick<BrowserEnv, 'userAgent' | 'maxTouchPoints'>): boolean {
  return /iPhone|iPad|iPod/.test(env.userAgent) || (/Macintosh/.test(env.userAgent) && env.maxTouchPoints > 1);
}

/** 휴대폰·태블릿인지(문구 "이 휴대폰"/"이 기기", 데스크톱 안내 구분용) */
export function isMobileDevice(env: Pick<BrowserEnv, 'userAgent' | 'maxTouchPoints'>): boolean {
  return isIosDevice(env) || /Android|Mobile/.test(env.userAgent);
}

/**
 * 설정·브라우저 기능만으로 판정한다(Firebase 를 불러오기 전 단계, 순수 함수).
 * 'ok' 여도 Firebase isSupported() 가 false 면 unsupported 로 바뀔 수 있다.
 */
export function precheckSupport(config: PushConfigStatus, env: BrowserEnv): PushSupport {
  if (!config.enabled) return 'unavailable';
  const ios = isIosDevice(env);
  if (ios && !env.standalone) return 'ios-browser';
  if (!env.hasNotification || !env.hasServiceWorker || !env.hasPushManager) return ios ? 'ios-outdated' : 'unsupported';
  return 'ok';
}

interface MessagingHandle {
  mod: typeof import('firebase/messaging');
  messaging: import('firebase/messaging').Messaging;
}

export interface FirebaseLoader {
  (config: Extract<PushConfigStatus, { enabled: true }>): Promise<MessagingHandle | null>;
}

/** 실제 Firebase 를 불러온다. 지원하지 않는 브라우저면 null */
const defaultLoader: FirebaseLoader = async (config) => {
  const [{ initializeApp, getApps }, mod] = await Promise.all([import('firebase/app'), import('firebase/messaging')]);
  if (!(await mod.isSupported())) return null;
  const app = getApps()[0] ?? initializeApp(config.firebase);
  return { mod, messaging: mod.getMessaging(app) };
};

export interface WebPushOptions {
  config: PushConfigStatus;
  loadFirebase?: FirebaseLoader;
  env?: () => BrowserEnv;
  /** PWA 서비스워커 등록을 돌려준다(없으면 null) */
  getRegistration?: () => Promise<ServiceWorkerRegistration | null>;
}

export function createWebPush(options: WebPushOptions) {
  const { config, loadFirebase = defaultLoader, env = readBrowserEnv } = options;
  let handle: Promise<MessagingHandle | null> | null = null;

  function messaging(): Promise<MessagingHandle | null> {
    if (!config.enabled) return Promise.resolve(null);
    handle ??= loadFirebase(config).catch(() => null);
    return handle;
  }

  async function registration(): Promise<ServiceWorkerRegistration | null> {
    if (options.getRegistration) return options.getRegistration();
    return null;
  }

  return {
    /** 설정·브라우저·Firebase·서비스워커까지 확인한 최종 판정 */
    async support(): Promise<PushSupport> {
      const pre = precheckSupport(config, env());
      if (pre !== 'ok') return pre;
      const m = await messaging();
      if (!m) return isIosDevice(env()) ? 'ios-outdated' : 'unsupported';
      if (!(await registration())) return 'unavailable';
      return 'ok';
    },

    /** 현재 권한 (Notification 이 없으면 'default') */
    permission(): NotificationPermission {
      return env().hasNotification ? Notification.permission : 'default';
    },

    /**
     * 권한 요청. 반드시 클릭 처리 안에서 다른 await 보다 먼저 부른다
     * (Safari 는 사용자 동작 없이 요청하면 거부한다).
     */
    requestPermission(): Promise<NotificationPermission> {
      if (!env().hasNotification) return Promise.resolve('denied');
      return Notification.requestPermission();
    },

    /** FCM 등록 토큰. 권한이 granted 일 때만 부른다 */
    async getToken(): Promise<string> {
      const m = await messaging();
      const reg = await registration();
      if (!m || !reg || !config.enabled) throw new Error('push unavailable');
      return m.mod.getToken(m.messaging, { vapidKey: config.vapidKey, serviceWorkerRegistration: reg });
    },

    /** Firebase 쪽 토큰 삭제. 설정이 없거나 권한이 없으면 Firebase 를 불러오지 않는다 */
    async deleteToken(): Promise<void> {
      if (!config.enabled || !env().hasNotification || Notification.permission !== 'granted') return;
      const m = await messaging();
      if (!m) return;
      await m.mod.deleteToken(m.messaging);
    },

    /** 화면이 앞에 있을 때 받은 메시지. 해제 함수를 돌려준다 */
    async onForeground(listener: (msg: ForegroundMessage) => void): Promise<() => void> {
      const m = await messaging();
      if (!m) return () => {};
      return m.mod.onMessage(m.messaging, (payload) => listener(payload as ForegroundMessage));
    },
  };
}

export type WebPush = ReturnType<typeof createWebPush>;

// ---------- 앱 전체가 쓰는 인스턴스 ----------

let swRegistration: ServiceWorkerRegistration | null = null;

/** main.tsx 가 registerSW 의 onRegisteredSW 로 받은 등록을 넘긴다 */
export function setServiceWorkerRegistration(reg: ServiceWorkerRegistration | undefined | null): void {
  swRegistration = reg ?? null;
}

export const webPush = createWebPush({
  config: pushConfig,
  getRegistration: async () => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return swRegistration;
    try {
      const reg = swRegistration ?? (await navigator.serviceWorker.getRegistration()) ?? null;
      if (!reg) return null;
      // 설치 중(active 없음)인 서비스워커로 getToken 하면 실패할 수 있어 활성화를 기다린다(최대 10초)
      if (!reg.active) {
        const ready = await Promise.race([
          navigator.serviceWorker.ready,
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 10_000)),
        ]);
        return ready ?? reg;
      }
      return reg;
    } catch {
      return null;
    }
  },
});
