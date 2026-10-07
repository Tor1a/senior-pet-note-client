// 이 기기의 알림 등록·해제 (lib/pushDevice.ts 의 순서를 RNFB·secure-store 로 연결)
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { registerThisDevice, releaseThisDevice, type PushDeviceDeps, type PushKeyValueStore } from '../lib/pushDevice';
import { reminderApi } from './client';
import { push } from './push';

// secure-store 키는 영숫자·. - _ 만 허용한다(spn.pushDeviceId 는 그대로 가능)
const store: PushKeyValueStore = {
  getItem: (k) => SecureStore.getItemAsync(k),
  setItem: (k, v) => SecureStore.setItemAsync(k, v),
  removeItem: (k) => SecureStore.deleteItemAsync(k),
};

const deps: PushDeviceDeps = {
  platform: Platform.OS === 'ios' ? 'ios' : 'android',
  getFcmToken: () => push.getToken(),
  deleteFcmToken: () => push.deleteToken(),
  registerDevice: (input) => reminderApi.registerDevice(input),
  deleteDevice: (id) => reminderApi.deleteDevice(id),
  store,
};

/** 권한이 허용된 상태에서 부른다. 실패하면 오류를 던진다 */
export function registerMobileDevice() {
  return registerThisDevice(deps);
}

/** 로그아웃(server=true, 최대 3초) / 401 강제 로그아웃(server=false). 오류를 던지지 않는다 */
export async function releaseMobileDevice(server: boolean): Promise<void> {
  if (!push.available) return;
  await releaseThisDevice(deps, { server });
}
