// [공유 로직 사본] 원본: web/src/lib/pushDevice.ts (2026-10-07 복사)
// web/src/lib 과 동기화 필요. 이 파일만 고치지 말고 웹 원본과 함께 수정하세요.
// 이 기기를 FCM 수신 기기로 등록·해제하는 순서 (기획서 6-7, 계약 docs/api-reminders.md 1·3장)
// - 플랫폼(웹 Firebase JS / 앱 RNFB)과 저장소(localStorage / secure-store)는 바깥에서 넣는다. 순수 TS(모바일 사본 대상).
// - 등록: FCM 토큰 → PUT /api/devices (같은 토큰 재등록 = lastSeenAt 갱신이라 매번 보내도 안전) → 응답 id 저장
// - 로그아웃: (진행 중 등록 대기 →) DELETE /api/devices/{id} → Firebase deleteToken 전체를 최대 3초 → 로컬 id·토큰 삭제
//   서버에 로그아웃 API 가 없어(JWT 무상태) 해제하지 않으면 로그아웃한 기기로 알림이 계속 간다.
// - 401 강제 로그아웃: 서버 DELETE 는 못 하므로 deleteToken + 로컬 삭제만 한다.
import type { Device, DeviceInput, DevicePlatform } from './reminderApi';

export const PUSH_DEVICE_ID_KEY = 'spn.pushDeviceId';
export const PUSH_TOKEN_KEY = 'spn.pushToken';

/** 로그아웃 때 서버 해제를 기다리는 최대 시간 */
export const RELEASE_TIMEOUT_MS = 3000;

/** 동기(localStorage)·비동기(secure-store) 저장소 모두 받는다 */
export interface PushKeyValueStore {
  getItem(key: string): string | null | Promise<string | null>;
  setItem(key: string, value: string): void | Promise<void>;
  removeItem(key: string): void | Promise<void>;
}

export interface PushDeviceDeps {
  platform: DevicePlatform;
  /** FCM 등록 토큰을 얻는다(권한이 허용된 상태에서만 부른다) */
  getFcmToken: () => Promise<string>;
  /** Firebase 쪽 토큰 삭제. 서버 해제가 실패해도 이 기기로 더 오지 않게 한다 */
  deleteFcmToken: () => Promise<void>;
  registerDevice: (input: DeviceInput) => Promise<Device>;
  deleteDevice: (id: string) => Promise<unknown>;
  store: PushKeyValueStore;
  /** 기본 3초 */
  releaseTimeoutMs?: number;
}

/** 등록 도중 로그아웃·해제가 일어나 결과를 버렸을 때 던진다(상태를 error 로 바꾸지 않는다) */
export class RegistrationSupersededError extends Error {
  constructor() {
    super('device registration superseded by release');
    this.name = 'RegistrationSupersededError';
  }
}

// 모듈 수준 직렬화: 진행 중 등록은 하나만 돈다(동시 호출은 같은 promise). release 는 세대를 올려 진행 중 등록을 무효화한다.
let generation = 0;
let inflight: Promise<Device> | null = null;

async function doRegister(deps: PushDeviceDeps, gen: number): Promise<Device> {
  const token = await deps.getFcmToken();
  if (!token) throw new Error('empty FCM token');
  if (gen !== generation) throw new RegistrationSupersededError();
  const device = await deps.registerDevice({ token, platform: deps.platform });
  if (gen !== generation) {
    // 등록하는 사이 로그아웃·해제됨: 방금 만든 기기를 바로 지운다(서버에 유령 기기를 남기지 않는다)
    try {
      await withTimeout(deps.deleteDevice(device.id), deps.releaseTimeoutMs ?? RELEASE_TIMEOUT_MS);
    } catch {
      // 무시
    }
    throw new RegistrationSupersededError();
  }
  await deps.store.setItem(PUSH_DEVICE_ID_KEY, device.id);
  await deps.store.setItem(PUSH_TOKEN_KEY, token);
  return device;
}

/**
 * 토큰을 얻어 서버에 등록하고 기기 id 를 저장한다. 실패하면 오류를 그대로 던진다.
 * 이미 진행 중이면 그 결과를 같이 받는다(한 번만 돈다).
 */
export function registerThisDevice(deps: PushDeviceDeps): Promise<Device> {
  if (inflight) return inflight;
  const p = doRegister(deps, generation).finally(() => {
    if (inflight === p) inflight = null;
  });
  inflight = p;
  return p;
}

/** 저장된 기기 id (없으면 null) */
export async function storedDeviceId(store: PushKeyValueStore): Promise<string | null> {
  try {
    return (await store.getItem(PUSH_DEVICE_ID_KEY)) ?? null;
  } catch {
    return null;
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve(undefined), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

/**
 * 이 기기 알림 해제. 어떤 단계가 실패해도 오류를 던지지 않는다(로그아웃은 항상 진행돼야 한다).
 * server=false 는 401 강제 로그아웃처럼 서버 호출이 불가능할 때.
 * 진행 중 등록 대기 + 서버 DELETE + Firebase deleteToken 전체를 하나의 상한(기본 3초)으로 묶는다.
 * 상한을 넘으면 지연된 작업은 백그라운드에 두고 로컬 id·토큰 삭제는 그대로 진행한다.
 */
export async function releaseThisDevice(deps: PushDeviceDeps, { server }: { server: boolean }): Promise<void> {
  generation += 1; // 진행 중 등록은 끝나는 즉시 자기 기기를 지우고 저장하지 않는다
  const pending = inflight;
  const work = (async () => {
    if (pending) await pending.catch(() => undefined);
    const id = await storedDeviceId(deps.store);
    // 서버 DELETE 가 멈춰도 Firebase 토큰 삭제가 막히지 않게 함께 시작한다(둘 다 실패·지연을 무시)
    await Promise.allSettled([
      server && id ? deps.deleteDevice(id) : undefined,
      deps.deleteFcmToken(),
    ]);
  })();
  work.catch(() => undefined);
  try {
    await withTimeout(work, deps.releaseTimeoutMs ?? RELEASE_TIMEOUT_MS);
  } catch {
    // 무시
  }
  try {
    await deps.store.removeItem(PUSH_DEVICE_ID_KEY);
    await deps.store.removeItem(PUSH_TOKEN_KEY);
  } catch {
    // 무시
  }
}
