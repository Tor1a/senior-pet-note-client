// 로그인 토큰(JWT) 보관 (모바일 전용)
// - iOS/안드로이드: expo-secure-store (iOS Keychain, 안드로이드 Keystore 로 암호화 저장)
// - 웹(개발 확인용): secure-store 가 웹을 지원하지 않으므로 메모리에만 둔다(새로고침하면 로그아웃).
// - API 클라이언트는 토큰을 동기 함수로 읽으므로, 앱 시작 때 loadToken() 으로 한 번 읽어 메모리에 둔다.

import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const TOKEN_KEY = 'spn.accessToken';
const useSecureStore = Platform.OS !== 'web';

let cached: string | null = null;

/** 메모리에 올라온 현재 토큰. 없으면 null */
export function getToken(): string | null {
  return cached;
}

/** 앱 시작 때 저장소에서 토큰을 읽어 메모리에 올린다. */
export async function loadToken(): Promise<string | null> {
  if (useSecureStore) {
    try {
      cached = await SecureStore.getItemAsync(TOKEN_KEY);
    } catch {
      // 저장소를 읽지 못하면(기기 잠금 해제 문제 등) 로그아웃 상태로 시작한다
      cached = null;
    }
  }
  return cached;
}

export async function saveToken(token: string): Promise<void> {
  cached = token;
  if (useSecureStore) await SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function clearToken(): Promise<void> {
  cached = null;
  if (useSecureStore) {
    try {
      await SecureStore.deleteItemAsync(TOKEN_KEY);
    } catch {
      // 지우기 실패는 무시한다. 메모리 토큰은 이미 비웠다.
    }
  }
}
