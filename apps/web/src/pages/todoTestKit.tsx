// 할 일 화면 테스트 공용 도구: 가짜 서버(fetch), 가짜 알림 상태, 렌더 도우미. 응답은 기획서 5장 계약 예시를 쓴다.
import { render } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { vi } from 'vitest';
import type { Pet } from '../lib/petApi';
import { PetContext } from '../pet';
import { PushContext, type PushContextValue, type PushDeviceState } from '../push/PushProvider';
import TodoFormPage from './TodoFormPage';
import TodosPage from './TodosPage';

export const PET: Pet = {
  id: 'pet-1',
  name: '초코',
  species: 'dog',
  birthYear: 2012,
  conditions: null,
  hasPhoto: false,
  createdAt: '2026-10-01T00:00:00Z',
  updatedAt: '2026-10-01T00:00:00Z',
};

export const json = (status: number, body: unknown) =>
  new Response(body === null ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

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
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      const method = init?.method ?? 'GET';
      const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
      calls.push({ method, path: url.pathname, search: url.search, body });
      const handler = routes[`${method} ${url.pathname}`];
      if (!handler) return json(404, { code: 'NOT_FOUND', message: 'not found' });
      return handler(body, url);
    }),
  );
  return calls;
}

export function pushValue(state: PushDeviceState, overrides: Partial<PushContextValue> = {}): PushContextValue {
  return {
    state,
    isMobile: true,
    requestPermission: vi.fn(async () => 'registered' as PushDeviceState),
    recheck: vi.fn(async () => state),
    subscribe: () => () => {},
    ...overrides,
  };
}

function LocationProbe() {
  const loc = useLocation();
  return (
    <p data-testid="location">
      {loc.pathname}
      {loc.search}
    </p>
  );
}

export function renderTodos(path: string, push: PushContextValue = pushValue('registered')) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <PetContext.Provider value={{ status: 'ready', pet: PET, reload: vi.fn(async () => {}), setPet: vi.fn() }}>
        <PushContext.Provider value={push}>
          <Routes>
            <Route path="/todos" element={<TodosPage />} />
            <Route path="/todos/new" element={<TodoFormPage />} />
            <Route path="/todos/:id" element={<TodoFormPage />} />
            <Route path="/today" element={<p>오늘 화면</p>} />
          </Routes>
          <LocationProbe />
        </PushContext.Provider>
      </PetContext.Provider>
    </MemoryRouter>,
  );
}
