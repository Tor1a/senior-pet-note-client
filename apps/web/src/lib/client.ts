import { createApiClient } from './api';
import { createPetApi } from './petApi';
import { apiConfig, DEFAULT_API_BASE_URL } from './config';
import { clearToken, getToken } from './tokenStorage';

// 앱 전체가 함께 쓰는 API 클라이언트 하나
// 토큰을 붙인 요청이 401 을 받으면 토큰을 지우고 'spn:unauthorized' 이벤트를 보낸다.
// AuthProvider 가 이 이벤트를 듣고 로그아웃 상태로 바꾼 뒤 /login 으로 보낸다.

export const UNAUTHORIZED_EVENT = 'spn:unauthorized';

export const api = createApiClient({
  // 주소가 잘못된 경우 App 이 안내 화면을 보여 주므로 여기서는 기본값으로 대체만 한다
  baseUrl: apiConfig.ok ? apiConfig.baseUrl : DEFAULT_API_BASE_URL,
  getToken,
  onUnauthorized: () => {
    clearToken();
    window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
  },
});

/** 반려동물·투약·오늘 화면 API (같은 클라이언트를 쓴다) */
export const petApi = createPetApi(api);
