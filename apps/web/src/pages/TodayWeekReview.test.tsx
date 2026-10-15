// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { daysFixture, historyFixture, logFixture } from '../lib/historyFixtures';
import type { Pet, TodayResponse } from '../lib/petApi';
import { setToken } from '../lib/tokenStorage';
import { PetContext } from '../pet';
import TodayPage from './TodayPage';

// 오늘 화면의 "최근 7일 돌아보기" 카드 통합 테스트. 기획 .company/plans/이번-주-돌아보기-카드.md 4·10장

const RECORD_DATE = '2026-10-08';

function todayExample(overrides: Partial<TodayResponse> = {}): TodayResponse {
  return {
    recordDate: RECORD_DATE,
    cutoffNotice: '새벽 4시 전 투약은 전날 기록으로 저장돼요',
    doses: [],
    dailyLog: logFixture(RECORD_DATE, { symptomsNone: true }),
    suggestions: { foodLevel: null, waterLevel: null, waterMl: null, weightKg: null },
    lastWeight: null,
    ...overrides,
  };
}

const PET: Pet = {
  id: 'pet-1', name: '보리', species: 'dog', birthYear: 2012, conditions: null, hasPhoto: false,
  createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z',
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function mockServer(today: () => Response, history: () => Response = () => json(200, historyFixture(daysFixture(RECORD_DATE, 30, { '2026-10-08': { weightKg: 4.1 } })))) {
  const calls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      const method = init?.method ?? 'GET';
      calls.push(`${method} ${url.pathname}${url.search}`);
      if (url.pathname === '/api/events') return new Response(null, { status: 202 });
      if (/^\/api\/pets\/pet-\d\/today$/.test(url.pathname)) return today();
      if (/^\/api\/pets\/pet-\d\/daily-logs$/.test(url.pathname) && method === 'GET') return history();
      return json(404, { code: 'NOT_FOUND', message: 'not found' });
    }),
  );
  return calls;
}

function tree(pet: Pet, reload = vi.fn(async () => {})) {
  return (
    <MemoryRouter initialEntries={['/today']}>
      <PetContext.Provider value={{ status: 'ready', pet, reload, setPet: vi.fn() }}>
        <TodayPage />
      </PetContext.Provider>
    </MemoryRouter>
  );
}

function renderToday(pet: Pet = PET, reload = vi.fn(async () => {})) {
  return render(tree(pet, reload));
}

const cardButton = () => screen.queryByRole('button', { name: '최근 7일 돌아보기' });

beforeEach(() => setToken('test-token'));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('오늘 화면 — 최근 7일 돌아보기 카드', () => {
  it('접힌 채 보이고(진입만으로 history 요청 0), 지난 기록 링크 행 바로 위에 있다', async () => {
    const calls = mockServer(() => json(200, todayExample()));
    renderToday();
    await screen.findByText('새벽 4시 전 투약은 전날 기록으로 저장돼요');
    const button = cardButton()!;
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(calls.some((c) => c.includes('/daily-logs'))).toBe(false);
    const link = screen.getByRole('link', { name: '지난 기록 보기 ›' });
    expect(button.closest('.week-review')!.nextElementSibling).toBe(link);
  });

  it('펼치면 history 를 파라미터 없이 1회 읽고 숫자를 보인다', async () => {
    const calls = mockServer(() => json(200, todayExample()));
    renderToday();
    await screen.findByText('새벽 4시 전 투약은 전날 기록으로 저장돼요');
    await userEvent.click(cardButton()!);
    expect(await screen.findByText('기록한 날 1일 / 7일')).toBeTruthy();
    expect(calls.filter((c) => c.includes('/daily-logs'))).toEqual(['GET /api/pets/pet-1/daily-logs']);
  });

  it.each([
    ['senior', 'senior' as const],
    ['first_time(기록 있음)', 'first_time' as const],
    ['유형 없음', undefined],
  ])('%s 모두 보인다', async (_l, profileType) => {
    mockServer(() => json(200, todayExample()));
    renderToday({ ...PET, profileType });
    await screen.findByText('새벽 4시 전 투약은 전날 기록으로 저장돼요');
    expect(cardButton()).not.toBeNull();
  });

  it('첫 기록 환영 카드(isFirstUse)가 보이는 동안은 그리지 않는다', async () => {
    mockServer(() => json(200, todayExample({ dailyLog: null })));
    renderToday();
    await screen.findByText('새벽 4시 전 투약은 전날 기록으로 저장돼요');
    expect(cardButton()).toBeNull();
    expect(document.querySelector('.week-review')).toBeNull();
  });

  it('오늘 화면 불러오기 오류 중에는 그리지 않는다', async () => {
    mockServer(() => json(500, { code: 'X', message: 'x' }));
    renderToday();
    await screen.findAllByRole('alert');
    expect(cardButton()).toBeNull();
  });

  it('반려동물이 바뀌면 열린 상태와 결과가 초기화된다(key=pet.id)', async () => {
    const calls = mockServer(() => json(200, todayExample()));
    const view = renderToday();
    await screen.findByText('새벽 4시 전 투약은 전날 기록으로 저장돼요');
    await userEvent.click(cardButton()!);
    await screen.findByText('기록한 날 1일 / 7일');
    view.rerender(tree({ ...PET, id: 'pet-2', name: '콩이' }));
    await waitFor(() => expect(calls).toContain('GET /api/pets/pet-2/today'));
    expect(cardButton()!.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText('기록한 날 1일 / 7일')).toBeNull();
  });

  it('404 면 카드가 접히고 reloadPet 을 부른다', async () => {
    mockServer(
      () => json(200, todayExample()),
      () => json(404, { code: 'NOT_FOUND', message: 'x' }),
    );
    const reload = vi.fn(async () => {});
    renderToday(PET, reload);
    await screen.findByText('새벽 4시 전 투약은 전날 기록으로 저장돼요');
    await userEvent.click(cardButton()!);
    await waitFor(() => expect(reload).toHaveBeenCalled());
    expect(cardButton()!.getAttribute('aria-expanded')).toBe('false');
  });
});
