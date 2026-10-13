// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { logFixture } from '../lib/historyFixtures';
import type { DailyLog, Pet, TodayResponse } from '../lib/petApi';
import { findRoutineForbidden } from '../lib/routineText';
import { setToken } from '../lib/tokenStorage';
import { PetContext } from '../pet';
import TodayPage from './TodayPage';

// 루틴 기록(산책·배변 횟수) 오늘 화면 테스트. 기획 .company/plans/루틴-기록-칩.md, 설계 .company/design/루틴-기록-칩.md
// 실제 서버 없이 fetch 를 가짜로 바꾼다. 응답은 기획서 6장 계약(필드 2개 추가)을 따른다.

function todayExample(overrides: Partial<TodayResponse> = {}): TodayResponse {
  return {
    recordDate: '2026-10-12',
    cutoffNotice: '새벽 4시 전 투약은 전날 기록으로 저장돼요',
    doses: [],
    dailyLog: null,
    suggestions: { foodLevel: null, waterLevel: null, waterMl: null, weightKg: null },
    lastWeight: null,
    ...overrides,
  };
}

const log = (over: Partial<DailyLog> = {}): DailyLog =>
  logFixture('2026-10-12', { symptomsNone: true, updatedAt: '2026-10-12T01:00:00Z', ...over });

const PET: Pet = {
  id: 'pet-1', name: '보리', species: 'dog', birthYear: 2012, conditions: null, hasPhoto: false,
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
const toggle = () => screen.getByRole('button', { name: /산책·배변 기록 \(선택\)/ });
const btn = (name: string) => screen.getByRole('button', { name });
const valueOf = (id: 'walk' | 'poop') => document.getElementById(`routine-${id}-value`)?.textContent;

beforeEach(() => setToken('test-token'));
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('루틴 기록 섹션: 접힘·펼침', () => {
  it('기본 접힘이고, 열지 않고 저장하면 요청은 기존 8필드 그대로이고 루틴 두 키는 생략된다', async () => {
    const calls = mockServer({
      [TODAY]: () => json(200, todayExample({ suggestions: { foodLevel: 2, waterLevel: 2, waterMl: null, weightKg: null } })),
      [PUT]: () => json(200, log({ foodLevel: 2, waterLevel: 2 })),
    });
    renderToday();
    const user = userEvent.setup();
    await waitFor(() => toggle());
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
    expect(document.getElementById('routine-body')?.hasAttribute('hidden')).toBe(true);
    expect(screen.queryByText('저장 전')).toBeNull();

    await user.click(saveButton());
    await screen.findByText(/오늘 기록을 남겼어요|첫 기록/);
    const put = calls.find((c) => c.method === 'PUT');
    expect(put?.body).toEqual({
      foodLevel: 2, waterLevel: 2, waterMl: null, weightKg: null, symptoms: [], symptomsNone: true, symptomOther: null, memo: '',
    });
  });

  it('열었다 접어도 변경(저장 전)이 아니고, 이탈 경고 대상도 아니다', async () => {
    mockServer({ [TODAY]: () => json(200, todayExample()) });
    renderToday();
    const user = userEvent.setup();
    await waitFor(() => toggle());
    await user.click(toggle());
    expect(toggle().getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText('적은 값만 저장돼요. 배변은 대변을 본 횟수예요.')).toBeTruthy();
    expect(valueOf('walk')).toBe('안 적음');
    await user.click(toggle());
    expect(screen.queryByText('저장 전')).toBeNull();
    // 로그인 후 폼 변경이 없으므로 앱 안 링크 이동에 확인 창이 뜨지 않는다
    await user.click(document.querySelector('a[href="/history"]') as HTMLElement);
    expect(await screen.findByText('지난 기록 화면')).toBeTruthy();
  });

  it('저장된 값이 있으면 자동으로 펼쳐 값을 보여 준다(0 은 0회)', async () => {
    mockServer({ [TODAY]: () => json(200, todayExample({ dailyLog: log({ walkCount: 0, poopCount: 3 }) })) });
    renderToday();
    await waitFor(() => toggle());
    expect(toggle().getAttribute('aria-expanded')).toBe('true');
    expect(valueOf('walk')).toBe('0회');
    expect(valueOf('poop')).toBe('3회');
  });

  it('접으면 접힌 행에 요약이 보이고 값은 유지된다', async () => {
    mockServer({ [TODAY]: () => json(200, todayExample({ dailyLog: log({ walkCount: 2, poopCount: 3 }) })) });
    renderToday();
    const user = userEvent.setup();
    await waitFor(() => toggle());
    await user.click(toggle());
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
    expect(within(toggle()).getByText('산책 2회 · 배변 3회')).toBeTruthy();
    await user.click(toggle());
    expect(valueOf('walk')).toBe('2회');
  });
});

describe('루틴 기록 섹션: 입력과 저장', () => {
  it('[+]/[−]/[지우기] 규칙: 첫 + 는 1회, 1→0, 0 유지, 안 적음에서 − 는 그대로, 20 에서 + 는 그대로', async () => {
    mockServer({ [TODAY]: () => json(200, todayExample()) });
    renderToday();
    const user = userEvent.setup();
    await waitFor(() => toggle());
    await user.click(toggle());

    await user.click(btn('산책 횟수 줄이기'));
    expect(valueOf('walk')).toBe('안 적음');
    await user.click(btn('산책 횟수 늘리기'));
    expect(valueOf('walk')).toBe('1회');
    await user.click(btn('산책 횟수 줄이기'));
    expect(valueOf('walk')).toBe('0회');
    await user.click(btn('산책 횟수 줄이기'));
    expect(valueOf('walk')).toBe('0회');
    await user.click(btn('산책 횟수 지우기'));
    expect(valueOf('walk')).toBe('안 적음');

    for (let i = 0; i < 22; i += 1) await user.click(btn('배변 횟수 늘리기'));
    expect(valueOf('poop')).toBe('20회');
    expect(screen.getByText('20회까지 적을 수 있어요.')).toBeTruthy();
    expect(btn('배변 횟수 늘리기').getAttribute('aria-disabled')).toBe('true');
    expect(btn('산책 횟수 줄이기').getAttribute('aria-disabled')).toBe('true'); // 안 적음이라 눌러도 변화 없음
  });

  it('[지우기] 뒤 포커스는 같은 항목의 [+] 로 옮겨진다', async () => {
    mockServer({ [TODAY]: () => json(200, todayExample({ dailyLog: log({ walkCount: 2 }) })) });
    renderToday();
    const user = userEvent.setup();
    await waitFor(() => toggle());
    await user.click(btn('산책 횟수 지우기'));
    expect(document.activeElement).toBe(btn('산책 횟수 늘리기'));
  });

  it('루틴만 바꾸고 저장하면(다른 칸 비어 있음) 그 값이 PUT 되고, 저장 전 표시가 사라진다', async () => {
    const calls = mockServer({
      [TODAY]: () => json(200, todayExample()),
      [PUT]: () => json(200, log({ symptomsNone: false, walkCount: 2, poopCount: 0 })),
    });
    renderToday();
    const user = userEvent.setup();
    await waitFor(() => toggle());
    await user.click(toggle());
    await user.click(btn('산책 횟수 늘리기'));
    await user.click(btn('산책 횟수 늘리기'));
    await user.click(btn('배변 횟수 늘리기'));
    await user.click(btn('배변 횟수 줄이기'));
    expect(screen.getByText('바꾼 내용은 화면 아래 저장 버튼을 눌러야 저장돼요.')).toBeTruthy();
    expect(screen.getAllByText('저장 전').length).toBeGreaterThan(0);

    await user.click(saveButton());
    await screen.findByRole('button', { name: '저장 되돌리기' });
    const put = calls.find((c) => c.method === 'PUT');
    expect(put?.body).toMatchObject({ foodLevel: null, waterLevel: null, weightKg: null, memo: '', walkCount: 2, poopCount: 0 });
    expect(screen.queryByText('저장 전')).toBeNull();
    expect(valueOf('poop')).toBe('0회');
  });

  it('제안값(최근 평균)이 있어도 루틴에는 제안값이 새어 들어가지 않는다', async () => {
    const calls = mockServer({
      [TODAY]: () => json(200, todayExample({ suggestions: { foodLevel: 3, waterLevel: 1, waterMl: null, weightKg: null } })),
      [PUT]: () => json(200, log()),
    });
    renderToday();
    const user = userEvent.setup();
    await waitFor(() => toggle());
    await user.click(toggle());
    expect(valueOf('walk')).toBe('안 적음');
    expect(valueOf('poop')).toBe('안 적음');
    await user.click(saveButton());
    await waitFor(() => expect(calls.some((c) => c.method === 'PUT')).toBe(true));
    const body = calls.find((c) => c.method === 'PUT')?.body as Record<string, unknown>;
    expect(body).not.toHaveProperty('walkCount');
    expect(body).not.toHaveProperty('poopCount');
  });

  it('저장된 값을 지우면 null 을 명시해 보낸다', async () => {
    const calls = mockServer({
      [TODAY]: () => json(200, todayExample({ dailyLog: log({ walkCount: 2, poopCount: 3 }) })),
      [PUT]: () => json(200, log({ walkCount: null, poopCount: 3 })),
    });
    renderToday();
    const user = userEvent.setup();
    await waitFor(() => toggle());
    await user.click(btn('산책 횟수 지우기'));
    await user.click(saveButton());
    await waitFor(() => expect(calls.some((c) => c.method === 'PUT')).toBe(true));
    expect(calls.find((c) => c.method === 'PUT')?.body).toMatchObject({ walkCount: null, poopCount: 3 });
  });

  it('저장 중에는 컨트롤이 눌려도 변하지 않는다', async () => {
    let release: (r: Response) => void = () => {};
    mockServer({
      [TODAY]: () => json(200, todayExample({ dailyLog: log({ walkCount: 2 }) })),
      [PUT]: () => new Promise<Response>((resolve) => { release = resolve; }),
    });
    renderToday();
    const user = userEvent.setup();
    await waitFor(() => toggle());
    await user.click(saveButton());
    await waitFor(() => expect(btn('산책 횟수 늘리기').getAttribute('aria-disabled')).toBe('true'));
    await user.click(btn('산책 횟수 늘리기'));
    expect(valueOf('walk')).toBe('2회');
    await act(async () => release(json(200, log({ walkCount: 2 }))));
  });

  it('저장이 실패하면 값은 그대로 두고 섹션 안내가 바뀐다', async () => {
    mockServer({
      [TODAY]: () => json(200, todayExample()),
      [PUT]: () => json(500, { code: 'INTERNAL', message: 'x' }),
    });
    renderToday();
    const user = userEvent.setup();
    await waitFor(() => toggle());
    await user.click(toggle());
    await user.click(btn('산책 횟수 늘리기'));
    await user.click(saveButton());
    expect(await screen.findByText('저장하지 못했어요. 바꾼 내용은 이 화면에 그대로 있어요.')).toBeTruthy();
    expect(valueOf('walk')).toBe('1회');
  });

  it('저장 실패 뒤 루틴 값을 다시 고치면 "저장하지 못했어요"가 사라지고 저장 전 안내로 돌아온다', async () => {
    mockServer({
      [TODAY]: () => json(200, todayExample()),
      [PUT]: () => json(500, { code: 'INTERNAL', message: 'x' }),
    });
    renderToday();
    const user = userEvent.setup();
    await waitFor(() => toggle());
    await user.click(toggle());
    await user.click(btn('산책 횟수 늘리기'));
    await user.click(saveButton());
    expect(await screen.findByText('저장하지 못했어요. 바꾼 내용은 이 화면에 그대로 있어요.')).toBeTruthy();
    await user.click(btn('산책 횟수 늘리기'));
    expect(valueOf('walk')).toBe('2회');
    expect(screen.queryByText('저장하지 못했어요. 바꾼 내용은 이 화면에 그대로 있어요.')).toBeNull();
    expect(screen.getByText('저장 전')).toBeTruthy();
  });

  it('값을 바꾸면 0.5초 뒤 한 번만 낭독 영역에 현재 값이 들어간다', async () => {
    mockServer({ [TODAY]: () => json(200, todayExample()) });
    renderToday();
    const user = userEvent.setup();
    await waitFor(() => toggle());
    await user.click(toggle());
    const status = () => document.querySelector('.routine [role="status"]')?.textContent;
    await user.click(btn('산책 횟수 늘리기'));
    await user.click(btn('산책 횟수 늘리기'));
    await user.click(btn('산책 횟수 늘리기'));
    expect(status()).toBe('');
    await waitFor(() => expect(status()).toBe('산책 3회'));
  });

  it('화면의 새 문구는 모두 금지 표현 검사를 통과한다', async () => {
    mockServer({ [TODAY]: () => json(200, todayExample({ dailyLog: log({ walkCount: 20, poopCount: 0 }) })) });
    renderToday();
    await waitFor(() => toggle());
    const section = document.querySelector('.routine') as HTMLElement;
    const labels = Array.from(section.querySelectorAll('[aria-label]')).map((el) => el.getAttribute('aria-label') ?? '');
    for (const text of [section.textContent ?? '', ...labels]) expect(findRoutineForbidden(text)).toBeNull();
  });
});

describe('루틴 기록과 저장 되돌리기', () => {
  it('저장 전 행이 있었고 루틴이 달라졌으면 PUT 으로 복원(10필드)하고 결과 안내에 한 문장을 덧붙인다', async () => {
    const before = log({ foodLevel: 1, walkCount: 1, poopCount: null, memo: '처음' });
    const saved = log({ foodLevel: 1, walkCount: 3, poopCount: 2, memo: '처음', updatedAt: '2026-10-12T02:00:00Z' });
    let todayCalls = 0;
    let puts = 0;
    const calls = mockServer({
      [TODAY]: () => {
        todayCalls += 1;
        return json(200, todayExample({ dailyLog: todayCalls <= 2 ? before : saved })); // 첫 조회·저장 직전은 before, 되돌리기 직전은 saved
      },
      [PUT]: () => json(200, puts++ === 0 ? saved : before),
    });
    renderToday();
    const user = userEvent.setup();
    await waitFor(() => toggle());
    await user.click(btn('산책 횟수 늘리기'));
    await user.click(btn('산책 횟수 늘리기'));
    await user.click(btn('배변 횟수 늘리기'));
    await user.click(btn('배변 횟수 늘리기'));
    await user.click(saveButton());
    await user.click(await screen.findByRole('button', { name: '저장 되돌리기' }));
    expect(await screen.findByText('이전에 저장한 내용으로 되돌렸어요. 산책·배변 기록도 저장 전 내용으로 돌아갔어요.')).toBeTruthy();
    const puts2 = calls.filter((c) => c.method === 'PUT');
    expect(puts2[1].body).toEqual({
      foodLevel: 1, waterLevel: null, waterMl: null, weightKg: null, symptoms: [], symptomsNone: true, symptomOther: null,
      memo: '처음', walkCount: 1, poopCount: null, // 저장 전 값이 안 적음이면 null 을 명시해 지운다
    });
    expect(valueOf('walk')).toBe('1회');
    expect(valueOf('poop')).toBe('안 적음');
  });

  it('저장 전 루틴 값이 저장분과 같으면 기존 결과 문구 그대로다(열지 않은 사용자와 글자 하나도 다르지 않다)', async () => {
    const before = log({ foodLevel: 1, memo: '처음' });
    const saved = log({ foodLevel: 3, memo: '처음', updatedAt: '2026-10-12T02:00:00Z' });
    let todayCalls = 0;
    let puts = 0;
    mockServer({
      [TODAY]: () => json(200, todayExample({ dailyLog: ++todayCalls <= 2 ? before : saved })),
      [PUT]: () => json(200, puts++ === 0 ? saved : before),
    });
    renderToday();
    const user = userEvent.setup();
    await waitFor(() => toggle());
    await user.click(within(screen.getByRole('radiogroup', { name: '식사' })).getByRole('radio', { name: /^많이/ }));
    await user.click(saveButton());
    await user.click(await screen.findByRole('button', { name: '저장 되돌리기' }));
    expect(await screen.findByText('이전에 저장한 내용으로 되돌렸어요.')).toBeTruthy();
  });

  it('그날 첫 저장(루틴 값 있음)을 되돌리면 행이 삭제되고 루틴도 함께 지워졌다고 덧붙인다', async () => {
    const saved = log({ symptomsNone: false, walkCount: 2, updatedAt: '2026-10-12T02:00:00Z' });
    let todayCalls = 0;
    const calls = mockServer({
      [TODAY]: () => json(200, todayExample({ dailyLog: ++todayCalls <= 2 ? null : saved })),
      [PUT]: () => json(200, saved),
      [DELETE]: () => new Response(null, { status: 204 }),
    });
    renderToday();
    const user = userEvent.setup();
    await waitFor(() => toggle());
    await user.click(toggle());
    await user.click(btn('산책 횟수 늘리기'));
    await user.click(btn('산책 횟수 늘리기'));
    await user.click(saveButton());
    await user.click(await screen.findByRole('button', { name: '저장 되돌리기' }));
    await waitFor(() => expect(calls.some((c) => c.method === 'DELETE')).toBe(true));
    expect(await screen.findByText(/산책·배변 기록도 함께 지워졌어요\./)).toBeTruthy();
    expect(valueOf('walk')).toBe('안 적음');
  });

  it('루틴 칸을 고치면 기존 규칙대로 되돌리기 안내가 정리된다', async () => {
    mockServer({
      [TODAY]: () => json(200, todayExample()),
      [PUT]: () => json(200, log()),
    });
    renderToday();
    const user = userEvent.setup();
    await waitFor(() => toggle());
    await user.click(saveButton());
    await screen.findByRole('button', { name: '저장 되돌리기' });
    await user.click(toggle()); // 접고 펴기는 안내를 정리하지 않는다
    expect(screen.getByRole('button', { name: '저장 되돌리기' })).toBeTruthy();
    await user.click(btn('산책 횟수 늘리기'));
    expect(screen.queryByRole('button', { name: '저장 되돌리기' })).toBeNull();
  });
});
