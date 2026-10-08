// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DISCLAIMER } from '../lib/constants';
import { daysFixture, historyFixture } from '../lib/historyFixtures';
import { findForbidden } from '../lib/historyText';
import type { HistoryResponse, Pet } from '../lib/petApi';
import { setToken } from '../lib/tokenStorage';
import { PetContext } from '../pet';
import HistoryDayPage from './HistoryDayPage';
import HistoryPage from './HistoryPage';

// 지난 기록 화면(H1/H2). 서버 없이 fetch 를 가짜로 바꾸고, 응답은 계약서(api-history.md) 모양을 쓴다.

const PET: Pet = {
  id: 'pet-1',
  name: '초코',
  species: 'dog',
  birthYear: 2012,
  conditions: null,
  hasPhoto: false,
  createdAt: '2026-10-01T00:00:00Z',
  updatedAt: '2026-10-01T00:00:00Z',
};

const END = '2026-10-08';

/** 30일: 체중 일부만(4일 간격 포함), 증상 2일, 약 있음 */
function fullHistory(): HistoryResponse {
  return historyFixture(
    daysFixture(
      END,
      30,
      {
        '2026-10-02': { weightKg: 4.4, foodLevel: 2, waterMl: 300, symptoms: ['vomit'] },
        '2026-10-03': { weightKg: 4.4, symptoms: ['cough', 'other'], symptomOther: '절뚝', memo: '비밀 메모' },
        '2026-10-04': { symptomsNone: true },
        '2026-10-08': { weightKg: 4.1, foodLevel: 3 },
        '2026-09-10': { weightKg: 4.6, waterLevel: 1 },
      },
      {},
      { scheduledCount: 3, takenCount: 2 },
    ),
  );
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function mockFetch(handler: (url: URL) => Response | Promise<Response>) {
  const urls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      urls.push(url.pathname + url.search);
      return handler(url);
    }),
  );
  return urls;
}

function renderAt(path: string, reload = vi.fn(async () => {})) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <PetContext.Provider value={{ status: 'ready', pet: PET, reload, setPet: vi.fn() }}>
        <Routes>
          <Route path="/history" element={<HistoryPage />} />
          <Route path="/history/:recordDate" element={<HistoryDayPage />} />
          <Route path="/today" element={<p>오늘 화면</p>} />
        </Routes>
      </PetContext.Provider>
    </MemoryRouter>,
  );
  return reload;
}

/** 화면에 보이는 글에서 금지 표현이 없는지 (메모는 사용자 입력이라 제외) */
function expectNoForbidden() {
  const text = (document.body.textContent ?? '').replace('비밀 메모', '');
  expect({ text, hit: findForbidden(text) }).toEqual({ text, hit: null });
}

beforeEach(() => setToken('test-token'));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('H1 경계·오류 (QA 추가)', () => {
  it('7일↔30일을 오가도 표 보기 선택이 유지되고 재요청이 없다', async () => {
    const urls = mockFetch(() => json(200, fullHistory()));
    renderAt('/history');
    await screen.findByText(/기록한 날/);
    await userEvent.click(screen.getByRole('button', { name: '표로 보기' }));
    await userEvent.click(screen.getByRole('radio', { name: '7일' }));
    expect(screen.getByRole('table')).toBeTruthy();
    expect(screen.getAllByRole('row').length).toBeLessThanOrEqual(8 + 1);
    await userEvent.click(screen.getByRole('radio', { name: '30일' }));
    expect(screen.getByText(/기록한 날 5일 \/ 30일/)).toBeTruthy();
    expect(screen.getByRole('table')).toBeTruthy();
    expect(urls).toHaveLength(1);
    expectNoForbidden();
  });

  it('401 이면 토큰을 지우고 unauthorized 이벤트를 보낸다', async () => {
    const fired = vi.fn();
    window.addEventListener('spn:unauthorized', fired);
    mockFetch(() => json(401, { code: 'UNAUTHORIZED', message: 'x' }));
    renderAt('/history');
    await waitFor(() => expect(fired).toHaveBeenCalled());
    expect(localStorage.length).toBe(0);
    expect(screen.getByText(DISCLAIMER)).toBeTruthy();
    window.removeEventListener('spn:unauthorized', fired);
  });

  it('400 INVALID_DATE_RANGE 가 목록에서 나도 한국어 안내와 면책, 다시 불러오기', async () => {
    mockFetch(() => json(400, { code: 'INVALID_DATE_RANGE', message: 'x' }));
    renderAt('/history');
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByRole('button', { name: '다시 불러오기' })).toBeTruthy();
    expect(screen.getByText(DISCLAIMER)).toBeTruthy();
    expectNoForbidden();
  });
});

describe('H2 경계·오류 (QA 추가)', () => {
  it('목록 첫날(30일 전)·어제에서도 전날/다음 날 링크가 맞다', async () => {
    mockFetch(() => json(200, historyFixture(daysFixture('2026-09-09', 1), { recordDate: END })));
    renderAt('/history/2026-09-09');
    expect(await screen.findByText('이 날은 기록이 없어요.')).toBeTruthy();
    expect(screen.getByRole('link', { name: '← 전날' }).getAttribute('href')).toBe('/history/2026-09-08');
    expect(screen.getByRole('link', { name: '다음 날 →' }).getAttribute('href')).toBe('/history/2026-09-10');
    cleanup();
    mockFetch(() => json(200, historyFixture(daysFixture('2026-10-07', 1), { recordDate: END })));
    renderAt('/history/2026-10-07');
    expect((await screen.findByRole('link', { name: '다음 날 →' })).getAttribute('href')).toBe('/history/2026-10-08');
  });

  it('월 경계(10-01)에서 전날은 09-30', async () => {
    mockFetch(() => json(200, historyFixture(daysFixture('2026-10-01', 1), { recordDate: END })));
    renderAt('/history/2026-10-01');
    expect((await screen.findByRole('link', { name: '← 전날' })).getAttribute('href')).toBe('/history/2026-09-30');
  });

  it('401 / 네트워크 오류 / 500', async () => {
    const fired = vi.fn();
    window.addEventListener('spn:unauthorized', fired);
    mockFetch(() => json(401, { code: 'UNAUTHORIZED', message: 'x' }));
    renderAt('/history/2026-10-03');
    await waitFor(() => expect(fired).toHaveBeenCalled());
    window.removeEventListener('spn:unauthorized', fired);
    cleanup();

    mockFetch(() => { throw new TypeError('Failed to fetch'); });
    renderAt('/history/2026-10-03');
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByText(DISCLAIMER)).toBeTruthy();
    cleanup();

    mockFetch(() => json(500, { code: 'INTERNAL', message: 'x' }));
    renderAt('/history/2026-10-03');
    expect(await screen.findByText('지난 기록을 불러오지 못했어요. 잠시 뒤에 다시 해 주세요.')).toBeTruthy();
  });

  it('404 면 반려동물을 다시 확인한다', async () => {
    mockFetch(() => json(404, { code: 'NOT_FOUND', message: 'x' }));
    const reload = renderAt('/history/2026-10-03');
    await waitFor(() => expect(reload).toHaveBeenCalled());
  });
});
