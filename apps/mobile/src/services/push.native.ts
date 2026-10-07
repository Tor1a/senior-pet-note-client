// 푸시 RNFB(@react-native-firebase/messaging) 구현 — iOS·안드로이드 개발 빌드 전용
// - Expo Go 에서는 RNFB 를 불러오지 않는다(네이티브 모듈이 없어 import 시점에 앱이 죽음) → 비활성 구현.
// - 개발 빌드라도 Firebase 설정 파일 없이 빌드해 네이티브 모듈이 없으면 require 가 던지므로 비활성(app.config.ts 참고).
// - 포그라운드 알림은 시스템이 보여 주지 않으므로 PushProvider 의 앱 안 배너로 처리한다.
import Constants from 'expo-constants';
import { PermissionsAndroid, Platform } from 'react-native';
import { push as disabled } from './push';
import { pushUnavailableReason } from './pushAvailability';
import type { PermissionState, PushMessage, PushPlatform } from './pushTypes';

type Messaging = typeof import('@react-native-firebase/messaging');

interface Loaded {
  m: Messaging;
  instance: ReturnType<Messaging['getMessaging']>;
}

function load(): Loaded | null {
  const executionEnvironment = Constants.executionEnvironment as string | undefined;
  // 네이티브 모듈 유무는 미리 알 수 없어 true 로 두고, 실제 유무는 아래 require 의 try/catch 로 판정한다
  if (pushUnavailableReason({ os: Platform.OS, executionEnvironment, hasNativeModule: true }) !== null) return null;
  try {
    // 여기서 처음 불러온다(Expo Go 에서는 위에서 이미 걸러짐). 네이티브 모듈이 없으면 던져서 null(비활성)이 된다.
    const m = require('@react-native-firebase/messaging') as Messaging;
    return { m, instance: m.getMessaging() };
  } catch {
    return null;
  }
}

const loaded = load();

function toMessage(raw: { notification?: { title?: string; body?: string }; data?: Record<string, unknown> }): PushMessage {
  return { title: raw.notification?.title, body: raw.notification?.body, data: raw.data };
}

const ANDROID_13 = 33;

async function getPermission(): Promise<PermissionState> {
  if (!loaded) return 'default';
  if (Platform.OS === 'android') {
    if (Number(Platform.Version) < ANDROID_13) return 'granted'; // 12 이하는 요청 불필요
    return (await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS)) ? 'granted' : 'default';
  }
  const status = await loaded.m.hasPermission(loaded.instance);
  const { AuthorizationStatus: S } = loaded.m;
  if (status === S.AUTHORIZED || status === S.PROVISIONAL) return 'granted';
  return status === S.DENIED ? 'denied' : 'default';
}

async function requestPermission(): Promise<PermissionState> {
  if (!loaded) return 'default';
  if (Platform.OS === 'android') {
    if (Number(Platform.Version) < ANDROID_13) return 'granted';
    const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
    if (result === PermissionsAndroid.RESULTS.GRANTED) return 'granted';
    return result === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN ? 'denied' : 'default';
  }
  const status = await loaded.m.requestPermission(loaded.instance);
  const { AuthorizationStatus: S } = loaded.m;
  if (status === S.AUTHORIZED || status === S.PROVISIONAL) return 'granted';
  return status === S.DENIED ? 'denied' : 'default';
}

export const push: PushPlatform = loaded
  ? {
      available: true,
      getPermission,
      requestPermission,
      getToken: () => loaded.m.getToken(loaded.instance),
      deleteToken: () => loaded.m.deleteToken(loaded.instance),
      onTokenRefresh: (listener) => loaded.m.onTokenRefresh(loaded.instance, listener),
      onForeground: (listener) => loaded.m.onMessage(loaded.instance, (raw) => listener(toMessage(raw))),
      onOpened: (listener) => loaded.m.onNotificationOpenedApp(loaded.instance, (raw) => listener(toMessage(raw))),
      getInitial: async () => {
        const raw = await loaded.m.getInitialNotification(loaded.instance);
        return raw ? toMessage(raw) : null;
      },
    }
  : disabled;
