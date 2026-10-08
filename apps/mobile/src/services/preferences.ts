// 화면 설정을 기기에 기억한다 (모바일 전용. 웹은 localStorage).
// 물 입력 방식(3단/ml)만 저장한다. 저장소를 못 읽고 써도 화면 동작에는 영향이 없다.
// 건강 기록은 저장하지 않는다(민감정보).
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { PUSH_DEVICE_ID_KEY, PUSH_TOKEN_KEY } from '../lib/pushDevice';

const WATER_MODE_KEY = 'spn.waterMode';
const available = Platform.OS !== 'web';

/** 물을 ml 로 적는 방식을 마지막에 골랐는지 */
export async function readPreferMl(): Promise<boolean> {
  if (!available) return false;
  try {
    return (await SecureStore.getItemAsync(WATER_MODE_KEY)) === 'ml';
  } catch {
    return false;
  }
}

export async function writePreferMl(ml: boolean): Promise<void> {
  if (!available) return;
  try {
    await SecureStore.setItemAsync(WATER_MODE_KEY, ml ? 'ml' : 'level');
  } catch {
    // 저장 못 해도 화면 동작에는 영향 없음
  }
}

/** 모바일이 secure-store 에 두는 토큰 외 키 전부(물 입력 방식, 푸시 기기 id·FCM 토큰). 토큰은 clearToken 이 지운다 */
export const LOCAL_PREFERENCE_KEYS = [WATER_MODE_KEY, PUSH_DEVICE_ID_KEY, PUSH_TOKEN_KEY] as const;

/** 탈퇴 뒤 기기에 남은 설정·기기 정보를 모두 지운다(하나가 실패해도 나머지는 지운다) */
export async function clearPreferences(): Promise<void> {
  if (!available) return;
  await Promise.allSettled(LOCAL_PREFERENCE_KEYS.map((k) => SecureStore.deleteItemAsync(k)));
}
