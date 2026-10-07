import { describe, expect, it, vi } from 'vitest';
import { resolvePushConfig } from '../lib/pushConfig';
import { createWebPush, isIosDevice, precheckSupport, type BrowserEnv, type FirebaseLoader } from './webPush';

// 실제 Firebase·네트워크는 부르지 않는다. Firebase 는 가짜 loader 로 바꾼다.

const ENABLED = resolvePushConfig({
  VITE_FIREBASE_API_KEY: 'k',
  VITE_FIREBASE_PROJECT_ID: 'p',
  VITE_FIREBASE_MESSAGING_SENDER_ID: 's',
  VITE_FIREBASE_APP_ID: 'a',
  VITE_FIREBASE_VAPID_KEY: 'vapid-public',
});
const DISABLED = resolvePushConfig({});

const DESKTOP_CHROME: BrowserEnv = {
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0',
  maxTouchPoints: 0,
  standalone: false,
  hasNotification: true,
  hasServiceWorker: true,
  hasPushManager: true,
};
const IPHONE_SAFARI: BrowserEnv = {
  ...DESKTOP_CHROME,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari/604.1',
  maxTouchPoints: 5,
  hasPushManager: false,
};

describe('알림 가능 여부 판정', () => {
  it('Firebase 설정이 없으면 unavailable', () => {
    expect(precheckSupport(DISABLED, DESKTOP_CHROME)).toBe('unavailable');
  });

  it('iPhone 브라우저 탭은 ios-browser, 홈 화면 앱인데 Push 가 없으면 ios-outdated', () => {
    expect(precheckSupport(ENABLED, IPHONE_SAFARI)).toBe('ios-browser');
    expect(precheckSupport(ENABLED, { ...IPHONE_SAFARI, standalone: true })).toBe('ios-outdated');
    expect(precheckSupport(ENABLED, { ...IPHONE_SAFARI, standalone: true, hasPushManager: true })).toBe('ok');
  });

  it('iPadOS(Mac 처럼 보임)도 iOS 로 본다', () => {
    expect(isIosDevice({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', maxTouchPoints: 5 })).toBe(true);
    expect(isIosDevice({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', maxTouchPoints: 0 })).toBe(false);
  });

  it('Notification 이 없는 브라우저는 unsupported', () => {
    expect(precheckSupport(ENABLED, { ...DESKTOP_CHROME, hasNotification: false })).toBe('unsupported');
  });
});

describe('Firebase 지연 로딩', () => {
  it('설정이 없으면 Firebase 를 한 번도 불러오지 않는다', async () => {
    const loader = vi.fn<FirebaseLoader>();
    const push = createWebPush({ config: DISABLED, loadFirebase: loader, env: () => DESKTOP_CHROME });
    expect(await push.support()).toBe('unavailable');
    await push.deleteToken();
    const off = await push.onForeground(() => {});
    off();
    await expect(push.getToken()).rejects.toThrow();
    expect(loader).not.toHaveBeenCalled();
  });

  it('설정이 있으면 VAPID 공개 키와 PWA 서비스워커 등록으로 토큰을 얻는다', async () => {
    const getToken = vi.fn(async () => 'fcm-token');
    const messaging = {} as never;
    const loader = vi.fn<FirebaseLoader>(async () => ({ mod: { getToken } as never, messaging }));
    const registration = {} as ServiceWorkerRegistration;
    const push = createWebPush({
      config: ENABLED,
      loadFirebase: loader,
      env: () => DESKTOP_CHROME,
      getRegistration: async () => registration,
    });
    expect(await push.support()).toBe('ok');
    await expect(push.getToken()).resolves.toBe('fcm-token');
    expect(getToken).toHaveBeenCalledWith(messaging, { vapidKey: 'vapid-public', serviceWorkerRegistration: registration });
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('Firebase 가 지원 안 함(null)이면 unsupported, 서비스워커가 없으면(npm run dev) unavailable', async () => {
    const unsupported = createWebPush({
      config: ENABLED,
      loadFirebase: async () => null,
      env: () => DESKTOP_CHROME,
      getRegistration: async () => ({}) as ServiceWorkerRegistration,
    });
    expect(await unsupported.support()).toBe('unsupported');

    const noSw = createWebPush({
      config: ENABLED,
      loadFirebase: async () => ({ mod: {} as never, messaging: {} as never }),
      env: () => DESKTOP_CHROME,
      getRegistration: async () => null,
    });
    expect(await noSw.support()).toBe('unavailable');
  });
});
