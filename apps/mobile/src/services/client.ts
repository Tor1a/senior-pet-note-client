// 앱 전체가 함께 쓰는 API 클라이언트 하나 (모바일 전용 연결부)
// - 클라이언트 본체(createApiClient)는 웹과 같은 src/lib/api.ts 를 쓴다.
// - 토큰을 붙인 요청이 401 을 받으면 토큰을 지우고 구독자(AuthProvider)에게 알린다.
//   웹은 window 이벤트를 쓰지만 RN 에는 window 이벤트가 없어 간단한 구독 함수로 대신한다.

import { Platform } from 'react-native';
import { createApiClient } from '../lib/api';
import { createPetApi } from '../lib/petApi';
import { createReminderApi } from '../lib/reminderApi';
import { resolveApiConfig } from './config';
import { clearToken, getToken } from './tokenStorage';

// 주의: EXPO_PUBLIC_ 변수는 빌드 때 글자 그대로 치환되므로 반드시 process.env.EXPO_PUBLIC_... 형태로 직접 써야 한다.
export const apiConfig = resolveApiConfig(process.env.EXPO_PUBLIC_API_BASE_URL, Platform.OS);

type Listener = () => void;
const unauthorizedListeners = new Set<Listener>();

/** 토큰 만료(401) 알림을 구독한다. 반환값을 호출하면 구독 해제. */
export function onUnauthorized(listener: Listener): () => void {
  unauthorizedListeners.add(listener);
  return () => {
    unauthorizedListeners.delete(listener);
  };
}

export const api = createApiClient({
  // 주소가 잘못되면 첫 화면에서 안내하므로 여기서는 빈 주소로 두어 요청이 바로 실패하게 한다
  baseUrl: apiConfig.ok ? apiConfig.baseUrl : '',
  getToken,
  onUnauthorized: () => {
    void clearToken();
    unauthorizedListeners.forEach((listener) => listener());
  },
});

export const reminderApi = createReminderApi(api);

export const petApi = createPetApi(api);
