// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DISCLAIMER } from '../lib/constants';
import type { Pet, TodayResponse } from '../lib/petApi';
import { findTodoForbidden, TODO_TEXT } from '../lib/todoText';
import { setToken } from '../lib/tokenStorage';
import { PetContext } from '../pet';
import TodayPage from './TodayPage';

// 오늘 화면 맨 아래에 "내 할 일 일정" 카드가 하나 더해진다 (기획서 Q3). 다른 요소의 위치·동작은 바뀌지 않는다.

vi.mock('../auth', () => ({ useAuth: () => ({ logout: vi.fn(async () => {}) }) }));

const PET: Pet = {
  id: 'pet-1',
  name: '보리',
  species: 'dog',
  birthYear: 2012,
  conditions: null,
  hasPhoto: false,
  createdAt: '2026-10-01T00:00:00Z',
  updatedAt: '2026-10-01T00:00:00Z',
};
const TODAY: TodayResponse = {
  recordDate: '2026-10-06',
  cutoffNotice: '새벽 4시 전 투약은 전날 기록으로 저장돼요',
  doses: [],
  dailyLog: null,
  suggestions: { foodLevel: 2, waterLevel: 2, waterMl: null, weightKg: 4.35 },
  lastWeight: null,
};

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  setToken('test-token');
  fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    if (url.pathname === '/api/pets/pet-1/today') {
      return new Response(JSON.stringify(TODAY), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response(null, { status: 404 });
  });
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});

function renderToday() {
  render(
    <MemoryRouter initialEntries={['/today']}>
      <PetContext.Provider value={{ status: 'ready', pet: PET, reload: vi.fn(async () => {}), setPet: vi.fn() }}>
        <Routes>
          <Route path="/today" element={<TodayPage />} />
          <Route path="/todos" element={<p>할 일 목록 화면</p>} />
        </Routes>
      </PetContext.Provider>
    </MemoryRouter>,
  );
}

describe('오늘 화면 — 내 할 일 일정 진입 카드', () => {
  it('맨 아래(면책 바로 위)에 카드와 링크가 있고, 카드 문구에 금지 표현이 없다', async () => {
    renderToday();
    const link = await screen.findByRole('link', { name: TODO_TEXT.entryButton });
    expect(link.getAttribute('href')).toBe('/todos');
    const card = link.closest('section')!;
    expect(card.textContent).toContain(TODO_TEXT.entryTitle);
    expect(findTodoForbidden(card.textContent ?? '')).toBeNull();
    // 카드 다음이 면책 문구이고, 계정 링크는 그 앞에 그대로 있다
    const disclaimer = screen.getByText(DISCLAIMER);
    expect(card.nextElementSibling).toBe(disclaimer);
    expect(screen.getByRole('link', { name: /계정 · 로그아웃/ })).toBeTruthy();
  });

  it('카드는 새 API 를 부르지 않는다(오늘 화면의 요청이 늘지 않는다)', async () => {
    renderToday();
    await screen.findByRole('link', { name: TODO_TEXT.entryButton });
    const paths = fetchMock.mock.calls.map((c) => new URL(String(c[0])).pathname);
    expect(paths.some((p) => p.includes('/todos'))).toBe(false);
  });

  it('링크를 누르면 /todos 로 간다', async () => {
    const user = (await import('@testing-library/user-event')).default.setup();
    renderToday();
    await user.click(await screen.findByRole('link', { name: TODO_TEXT.entryButton }));
    expect(await screen.findByText('할 일 목록 화면')).toBeTruthy();
  });
});
