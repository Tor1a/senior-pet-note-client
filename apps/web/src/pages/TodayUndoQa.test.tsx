// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DailyLog, Pet, TodayResponse } from '../lib/petApi';
import { setToken } from '../lib/tokenStorage';
import { PetContext } from '../pet';
import TodayPage from './TodayPage';

// QA 보강 화면 테스트 (저장 중/되돌리는 중 가드, 04시 만료, 투약 연타). 원본 헬퍼는 TodayUndo.test.tsx 와 같다.
// 저장 되돌리기·실수 방지 화면 테스트 (기획 .company/plans/저장-되돌리기.md, 계약 docs/api-undo.md)
// 실제 서버 없이 fetch 를 가짜로 바꾼다.

function todayExample(overrides: Partial<TodayResponse> = {}): TodayResponse {
  return {
    recordDate: '2026-10-12',
    cutoffNotice: '새벽 4시 전 투약은 전날 기록으로 저장돼요',
    doses: [
      { medicationId: 'uuid', name: '아조딜', doseText: '1캡슐', scheduledTime: '20:00', taken: false, medLogId: null, takenAt: null },
    ],
    dailyLog: null,
    suggestions: { foodLevel: 2, waterLevel: 2, waterMl: null, weightKg: null },
    lastWeight: { weightKg: 4.3, recordDate: '2026-10-09' },
    ...overrides,
  };
}

function log(over: Partial<DailyLog> = {}): DailyLog {
  return {
    id: 'log-1', petId: 'pet-1', recordDate: '2026-10-12', foodLevel: 2, waterLevel: 2, waterMl: null, weightKg: null,
    symptoms: [], symptomsNone: true, symptomOther: null, memo: '', updatedAt: '2026-10-12T01:00:00Z', ...over,
  };
}

const PET: Pet = {
  id: 'pet-1', name: '보리', species: 'dog', birthYear: 2012, conditions: '신부전', hasPhoto: false,
  createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z',
};

const json = (status: number, body: unknown) =>
  new Response(body === null ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

type Handler = (body: unknown) => Response | Promise<Response>;
interface Call { method: string; path: string; body: unknown }

function mockServer(routes: Record<string, Handler>) {
  const calls: Call[] = [];
  const all: Record<string, Handler> = { 'POST /api/events': () => new Response(null, { status: 202 }), ...routes };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      const method = init?.method ?? 'GET';
      const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
      calls.push({ method, path: url.pathname, body });
      const handler = all[`${method} ${url.pathname}`];
      return handler ? handler(body) : json(404, { code: 'NOT_FOUND', message: 'not found' });
    }),
  );
  return calls;
}

function renderToday() {
  render(
    <MemoryRouter initialEntries={['/today']}>
      <PetContext.Provider value={{ status: 'ready', pet: PET, reload: vi.fn(async () => {}), setPet: vi.fn() }}>
        <Routes>
          <Route path="/today" element={<TodayPage />} />
          <Route path="/history" element={<p>지난 기록 화면</p>} />
        </Routes>
      </PetContext.Provider>
    </MemoryRouter>,
  );
}

const PUT = 'PUT /api/pets/pet-1/daily-logs/2026-10-12';
const DELETE = 'DELETE /api/pets/pet-1/daily-logs/2026-10-12';
const TODAY = 'GET /api/pets/pet-1/today';
const saveButton = () => screen.getByRole('button', { name: /^(첫 기록 저장|오늘 기록 저장|기록 수정하기)$/ });

beforeEach(() => setToken('test-token'));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});


describe('QA: 저장·되돌리기 동시 가드', () => {
  it('되돌리는 중에는 저장 버튼이 잠기고 PUT 이 나가지 않는다', async () => {
    const saved = log({ updatedAt: '2026-10-12T02:00:00Z' });
    let todayCalls = 0;
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => { release = r; });
    const calls = mockServer({
      [TODAY]: async () => {
        todayCalls += 1;
        if (todayCalls <= 2) return json(200, todayExample());
        await gate;
        return json(200, todayExample({ dailyLog: saved }));
      },
      [PUT]: () => json(200, saved),
      [DELETE]: () => new Response(null, { status: 204 }),
    });
    renderToday();
    const user = userEvent.setup();
    await user.click(await waitFor(() => saveButton()));
    await user.click(await screen.findByRole('button', { name: '저장 되돌리기' }));
    await screen.findByRole('button', { name: '되돌리는 중…' });
    const putsBefore = calls.filter((c) => c.method === 'PUT').length;
    expect((saveButton() as HTMLButtonElement).disabled).toBe(true);
    await user.click(saveButton());
    expect(calls.filter((c) => c.method === 'PUT').length).toBe(putsBefore);
    release();
    expect(await screen.findByText('저장하기 전 상태로 되돌렸어요.')).toBeTruthy();
  });

  // 기획 R3: "saving 이면 되돌리기 비활성". 두 번째 저장이 진행 중일 때 첫 저장의 [저장 되돌리기]가 눌리는지 본다.
  it('다시 저장하는 중에는 이전 저장의 [저장 되돌리기]가 동작하지 않아야 한다', async () => {
    const first = log({ updatedAt: '2026-10-12T02:00:00Z' });
    const second = log({ updatedAt: '2026-10-12T02:00:05Z' });
    let todayCalls = 0;
    let puts = 0;
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => { release = r; });
    const calls = mockServer({
      [TODAY]: () => { todayCalls += 1; return json(200, todayExample({ dailyLog: todayCalls <= 1 ? null : first })); },
      [PUT]: async () => {
        puts += 1;
        if (puts === 1) return json(200, first);
        await gate; // 두 번째 저장을 붙잡는다
        return json(200, second);
      },
      [DELETE]: () => new Response(null, { status: 204 }),
    });
    renderToday();
    const user = userEvent.setup();
    await user.click(await waitFor(() => saveButton()));
    const undoBtn = await screen.findByRole('button', { name: '저장 되돌리기' });
    await user.click(saveButton()); // 입력을 바꾸지 않고 한 번 더 저장 → 이전 안내가 남아 있다
    await waitFor(() => expect(puts).toBe(2));
    expect((undoBtn as HTMLButtonElement).disabled).toBe(true); // 저장 중에는 비활성 + 이유 문구
    expect(screen.getByText('저장하는 중에는 되돌릴 수 없어요.')).toBeTruthy();
    await user.click(undoBtn); // 저장 진행 중 되돌리기
    release();
    await waitFor(() => expect(screen.queryByText('저장하는 중…')).toBeNull());
    await new Promise((r) => setTimeout(r, 150)); // 되돌리기 요청 체인이 끝날 시간
    // 실제(재현됨): GET today -> 복원 PUT 이 저장 중에 나가 PUT 이 3번이 되고 "이전에 저장한 내용으로 되돌렸어요" 가 표시된다
    // 기대: 저장 중 되돌리기는 무시/비활성 -> 복원 PUT·DELETE 없이 두 번째 저장 결과만 남는다
    expect(calls.some((c) => c.method === 'DELETE')).toBe(false);
    expect(calls.filter((c) => c.method === 'PUT')).toHaveLength(2); // 되돌리기 복원 PUT 이 끼어들지 않는다
    expect(screen.queryByText('이전에 저장한 내용으로 되돌렸어요.')).toBeNull();
    // 저장이 끝나면 새 저장 기준의 안내로 바뀌고 버튼이 다시 활성
    expect((await screen.findByRole('button', { name: '저장 되돌리기' }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByText('저장하는 중에는 되돌릴 수 없어요.')).toBeNull();
  });
});

describe('QA: 04시 경계 분류', () => {
  it('되돌리기 직전 확인에서 기록 날짜가 이미 넘어갔으면 DELETE·PUT 없이 만료 안내', async () => {
    const saved = log({ updatedAt: '2026-10-12T02:00:00Z' });
    let todayCalls = 0;
    const calls = mockServer({
      [TODAY]: () => {
        todayCalls += 1;
        if (todayCalls <= 2) return json(200, todayExample());
        return json(200, todayExample({ recordDate: '2026-10-13', dailyLog: null })); // 04:00 지남
      },
      [PUT]: () => json(200, saved),
      [DELETE]: () => new Response(null, { status: 204 }),
    });
    renderToday();
    const user = userEvent.setup();
    await user.click(await waitFor(() => saveButton()));
    await user.click(await screen.findByRole('button', { name: '저장 되돌리기' }));
    expect(await screen.findByText('시간이 지나 되돌릴 수 없어요.')).toBeTruthy();
    expect(calls.some((c) => c.method === 'DELETE')).toBe(false);
    expect(calls.filter((c) => c.method === 'PUT')).toHaveLength(1);
  });

  it('복원 PUT 이 400 INVALID_RECORD_DATE 여도 만료 안내(서버 오류 문구가 아니다)', async () => {
    const before = log({ foodLevel: 1, updatedAt: '2026-10-12T01:00:00Z' });
    const saved = log({ foodLevel: 3, updatedAt: '2026-10-12T02:00:00Z' });
    let todayCalls = 0;
    let puts = 0;
    mockServer({
      [TODAY]: () => {
        todayCalls += 1;
        return json(200, todayExample({ dailyLog: todayCalls === 1 ? before : todayCalls === 2 ? before : saved }));
      },
      [PUT]: () => (puts++ === 0 ? json(200, saved) : json(400, { code: 'INVALID_RECORD_DATE', message: '현재 기록 날짜는 2026-10-13 입니다' })),
    });
    renderToday();
    const user = userEvent.setup();
    await user.click(await waitFor(() => saveButton()));
    await user.click(await screen.findByRole('button', { name: '저장 되돌리기' }));
    expect(await screen.findByText('시간이 지나 되돌릴 수 없어요.')).toBeTruthy();
    expect(screen.queryByText(/서버에 잠시 문제/)).toBeNull();
  });
});

describe('QA: 투약 연타', () => {
  const taken = { medicationId: 'uuid', name: '아조딜', doseText: '1캡슐', scheduledTime: '20:00', taken: true, medLogId: 'm1', takenAt: '2026-10-12T11:00:00Z' };

  it('체크 카드를 연타해도 POST 는 한 번이다', async () => {
    const calls = mockServer({
      [TODAY]: () => json(200, todayExample()),
      'POST /api/med-logs': () =>
        json(201, { id: 'm1', medicationId: 'uuid', recordDate: '2026-10-12', scheduledTime: '20:00', takenAt: '2026-10-12T11:00:00Z' }),
    });
    renderToday();
    const user = userEvent.setup();
    const card = await screen.findByRole('checkbox', { name: /아조딜/ });
    await user.click(card);
    await user.click(card);
    await user.click(card);
    await waitFor(() => expect(calls.filter((c) => c.method === 'POST' && c.path === '/api/med-logs').length).toBeGreaterThan(0));
    expect(calls.filter((c) => c.method === 'POST' && c.path === '/api/med-logs')).toHaveLength(1);
    expect(calls.filter((c) => c.method === 'DELETE')).toHaveLength(0);
  });

  it('[되돌리기]를 연타해도 DELETE 는 한 번이고, 되돌린 뒤 [다시 체크]를 연타해도 POST 는 한 번이다', async () => {
    const calls = mockServer({
      [TODAY]: () => json(200, todayExample({ doses: [taken] })),
      'DELETE /api/med-logs/m1': () => new Response(null, { status: 204 }),
      'POST /api/med-logs': () =>
        json(201, { id: 'm2', medicationId: 'uuid', recordDate: '2026-10-12', scheduledTime: '20:00', takenAt: '2026-10-12T11:30:00Z' }),
    });
    renderToday();
    const user = userEvent.setup();
    const undo = await screen.findByRole('button', { name: /체크 되돌리기/ });
    await user.click(undo);
    await user.click(undo);
    const recheck = await screen.findByRole('button', { name: '다시 체크' });
    await user.click(recheck);
    await user.click(recheck);
    await waitFor(() => expect(calls.some((c) => c.method === 'POST' && c.path === '/api/med-logs')).toBe(true));
    expect(calls.filter((c) => c.method === 'DELETE')).toHaveLength(1);
    expect(calls.filter((c) => c.method === 'POST' && c.path === '/api/med-logs')).toHaveLength(1);
  });
});
