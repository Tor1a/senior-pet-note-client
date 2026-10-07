// 이 브라우저의 기기 등록·해제 (lib/pushDevice.ts 의 순서를 웹 Firebase·localStorage 로 연결)
// auth.tsx(로그아웃·401)와 PushProvider(등록)가 함께 쓴다.
import { reminderApi } from '../lib/client';
import { registerThisDevice, releaseThisDevice, type PushDeviceDeps, type PushKeyValueStore } from '../lib/pushDevice';
import { webPush } from './webPush';

/** localStorage 를 못 쓰면(시크릿 모드 등) 메모리에 둔다 */
const memory = new Map<string, string>();
const store: PushKeyValueStore = {
  getItem: (k) => {
    try {
      return localStorage.getItem(k) ?? memory.get(k) ?? null;
    } catch {
      return memory.get(k) ?? null;
    }
  },
  setItem: (k, v) => {
    memory.set(k, v);
    try {
      localStorage.setItem(k, v);
    } catch {
      // 메모리 값만 쓴다
    }
  },
  removeItem: (k) => {
    memory.delete(k);
    try {
      localStorage.removeItem(k);
    } catch {
      // 무시
    }
  },
};

const deps: PushDeviceDeps = {
  platform: 'web',
  getFcmToken: () => webPush.getToken(),
  deleteFcmToken: () => webPush.deleteToken(),
  registerDevice: (input) => reminderApi.registerDevice(input),
  deleteDevice: (id) => reminderApi.deleteDevice(id),
  store,
};

/** 권한이 허용된 상태에서 부른다. 실패하면 오류를 던진다 */
export function registerWebDevice() {
  return registerThisDevice(deps);
}

/** 로그아웃(server=true, 최대 3초) / 401 강제 로그아웃(server=false). 오류를 던지지 않는다 */
export function releaseWebDevice(server: boolean) {
  return releaseThisDevice(deps, { server });
}
