// 할 일 화면 테스트 공용 도구: 가짜 서버(fetch), 가짜 알림 상태, 렌더 도우미. 응답은 계약 예시(lib/todoFixtures)를 쓴다.
import { render } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { PetContext } from '../pet/PetProvider';
import { PushContext, type PushContextValue, type PushDeviceState } from '../push/pushContext';
import { json, PET } from '../testing/fixtures';

export { json, PET };

export type Handler = (body: unknown, url: URL) => Response | Promise<Response>;
export interface Call {
  method: string;
  path: string;
  search: string;
  body: unknown;
}

/** routes 키: "GET /api/pets/pet-1/todos" (쿼리 제외). 없는 경로는 404 */
export function mockServer(routes: Record<string, Handler>) {
  const calls: Call[] = [];
  global.fetch = jest.fn(async (input: string, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? 'GET';
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
    calls.push({ method, path: url.pathname, search: url.search, body });
    const handler = routes[`${method} ${url.pathname}`];
    if (!handler) return json(404, { code: 'NOT_FOUND', message: 'not found' });
    return handler(body, url);
  }) as never;
  return calls;
}

export function pushValue(state: PushDeviceState, overrides: Partial<PushContextValue> = {}): PushContextValue {
  return {
    state,
    requestPermission: jest.fn(async () => 'registered' as PushDeviceState),
    recheck: jest.fn(async () => state),
    bannerVisible: false,
    subscribe: () => () => {},
    ...overrides,
  };
}

export const reloadPet = jest.fn(async () => true);

export async function renderWith(ui: ReactElement, push: PushContextValue = pushValue('registered')) {
  await render(
    <PushContext.Provider value={push}>
      <PetContext.Provider value={{ status: 'ready', pet: PET, reload: reloadPet, setPet: jest.fn() }}>
        {ui}
      </PetContext.Provider>
    </PushContext.Provider>,
  );
}
