// 컴포넌트 테스트용 services/client 대체: 실제 API 클라이언트 코드에 가짜 fetch 를 연결한다(웹 테스트와 같은 방식).
import { createApiClient } from '../lib/api';
import { createPetApi } from '../lib/petApi';

export const api = createApiClient({ baseUrl: 'http://test', getToken: () => 'tok', onUnauthorized: () => {} });
export const petApi = createPetApi(api);
export const onUnauthorized = () => () => {};
