// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DailyLog, Pet, TodayResponse } from '../lib/petApi';
import { setToken } from '../lib/tokenStorage';
import { PetContext } from '../pet';
import TodayPage from './TodayPage';

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
const memoInput = () => document.getElementById('memo') as HTMLTextAreaElement;
const foodRadio = (name: string) =>
  within(screen.getByRole('radiogroup', { name: '식사' })).getByRole('radio', { name: new RegExp(`^${name}`) });
const weightInput = () => screen.getByLabelText('체중 (kg)') as HTMLInputElement;

beforeEach(() => setToken('test-token'));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('일일 기록 저장 되돌리기', () => {
  it('하루의 첫 저장이면 서버 기록을 확인한 뒤 DELETE 로 되돌린다', async () => {
    const saved = log({ updatedAt: '2026-10-12T02:00:00Z' });
    let todayCalls = 0;
    const calls = mockServer({
      [TODAY]: () => {
        todayCalls += 1;
        // 1: 첫 조회, 2: 저장 직전 확인(서버에 기록 없음), 3: 되돌리기 직전 확인
        return json(200, todayCalls <= 2 ? todayExample() : todayExample({ dailyLog: saved }));
      },
      [PUT]: () => json(200, saved),
      [DELETE]: () => new Response(null, { status: 204 }),
    });
    renderToday();
    const user = userEvent.setup();
    await user.click(await waitFor(() => saveButton()));
    expect(await screen.findByText(/오늘 기록을 남겼어요/)).toBeTruthy();

    await user.click(screen.getByRole('button', { name: '저장 되돌리기' }));
    expect(await screen.findByText('저장하기 전 상태로 되돌렸어요.')).toBeTruthy();
    const order = calls.map((c) => `${c.method} ${c.path}`).filter((c) => !c.includes('/events'));
    expect(order).toEqual([TODAY, TODAY, PUT, TODAY, DELETE]); // 저장 직전·되돌리기 직전에 서버 기록을 확인한다(저장 후 추가 조회 없음)
    // 저장 전 상태: 저장 버튼 이름이 돌아오고 되돌리기 버튼은 사라진다
    expect(saveButton().textContent).toBe('오늘 기록 저장');
    expect(screen.queryByRole('button', { name: '저장 되돌리기' })).toBeNull();
  });

  it('수정이었다면 직전 서버 값을 PUT 으로 복원한다', async () => {
    const before = log({ foodLevel: 1, memo: '처음 메모', updatedAt: '2026-10-12T01:00:00Z' });
    // 서버 수정 후 저장 응답의 updatedAt 은 DB 저장값이라 이어서 부른 GET /today 와 문자열까지 같다
    const saved = log({ foodLevel: 3, memo: '처음 메모', updatedAt: '2026-10-12T02:00:00.133Z' });
    let todayCalls = 0;
    let puts = 0;
    const calls = mockServer({
      [TODAY]: () => {
        todayCalls += 1;
        return json(200, todayExample({ dailyLog: todayCalls <= 2 ? before : saved }));
      },
      [PUT]: () => json(200, puts++ === 0 ? saved : before),
    });
    renderToday();
    const user = userEvent.setup();
    await waitFor(() => saveButton());
    await user.click(foodRadio('많이'));
    await user.click(saveButton());
    expect(await screen.findByText('고친 내용을 저장했어요.')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: '저장 되돌리기' }));
    expect(await screen.findByText('이전에 저장한 내용으로 되돌렸어요.')).toBeTruthy();
    const puts2 = calls.filter((c) => c.method === 'PUT');
    expect(puts2).toHaveLength(2);
    expect(puts2[1].body).toEqual({
      foodLevel: 1, waterLevel: 2, waterMl: null, weightKg: null, symptoms: [], symptomsNone: true, symptomOther: null, memo: '처음 메모', walkCount: null, poopCount: null,
    });
    expect(foodRadio('조금').getAttribute('aria-checked')).toBe('true');
  });

  it('서버의 updatedAt 이 다르면(다른 곳에서 고침) 덮어쓰지 않고 안내한다', async () => {
    const saved = log({ updatedAt: '2026-10-12T02:00:00Z' });
    let todayCalls = 0;
    const calls = mockServer({
      [TODAY]: () => {
        todayCalls += 1;
        if (todayCalls <= 2) return json(200, todayExample()); // 첫 조회, 저장 직전 확인
        return json(200, todayExample({ dailyLog: { ...saved, memo: '다른 기기', updatedAt: '2026-10-12T02:05:00Z' } }));
      },
      [PUT]: () => json(200, saved),
    });
    renderToday();
    const user = userEvent.setup();
    await user.click(await waitFor(() => saveButton()));
    await user.click(await screen.findByRole('button', { name: '저장 되돌리기' }));
    expect(await screen.findByText('다른 곳에서 고친 기록이라 되돌리지 않았어요.')).toBeTruthy();
    expect(calls.some((c) => c.method === 'DELETE')).toBe(false);
    expect(calls.filter((c) => c.method === 'PUT')).toHaveLength(1);
    // 서버 값으로 화면을 맞춘다
    expect(memoInput().value).toBe('다른 기기');
  });

  it('04시를 넘겨 400 INVALID_RECORD_DATE 면 "시간이 지나 되돌릴 수 없어요"', async () => {
    const saved = log({ updatedAt: '2026-10-12T02:00:00Z' });
    let todayCalls = 0;
    mockServer({
      [TODAY]: () => {
        todayCalls += 1;
        return json(200, todayCalls >= 3 ? todayExample({ dailyLog: saved }) : todayExample());
      },
      [PUT]: () => json(200, saved),
      [DELETE]: () => json(400, { code: 'INVALID_RECORD_DATE', message: 'x' }),
    });
    renderToday();
    const user = userEvent.setup();
    await user.click(await waitFor(() => saveButton()));
    await user.click(await screen.findByRole('button', { name: '저장 되돌리기' }));
    expect(await screen.findByText('시간이 지나 되돌릴 수 없어요.')).toBeTruthy();
  });

  it('연결 실패면 안내를 유지하고 [다시 시도]로 한 번 더 할 수 있다', async () => {
    const saved = log({ updatedAt: '2026-10-12T02:00:00Z' });
    let todayCalls = 0;
    mockServer({
      [TODAY]: () => {
        todayCalls += 1;
        if (todayCalls === 3) throw new TypeError('Failed to fetch'); // 1: 첫 조회, 2: 저장 직전 확인, 3: 되돌리기 직전 확인
        return json(200, todayCalls <= 2 ? todayExample() : todayExample({ dailyLog: saved }));
      },
      [PUT]: () => json(200, saved),
      [DELETE]: () => new Response(null, { status: 204 }),
    });
    renderToday();
    const user = userEvent.setup();
    await user.click(await waitFor(() => saveButton()));
    await user.click(await screen.findByRole('button', { name: '저장 되돌리기' }));
    expect(await screen.findByText(/되돌리지 못했어요\. 서버에 연결할 수 없어요\. 방금 저장한 내용은 그대로 남아 있어요\./)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '다시 시도' }));
    expect(await screen.findByText('저장하기 전 상태로 되돌렸어요.')).toBeTruthy();
  });

  it('폼을 고치면 되돌리기 안내가 사라지고, [닫기]로도 닫힌다', async () => {
    const saved = log({ updatedAt: '2026-10-12T02:00:00Z' });
    mockServer({ [TODAY]: () => json(200, todayExample()), [PUT]: () => json(200, saved) });
    renderToday();
    const user = userEvent.setup();
    await user.click(await waitFor(() => saveButton()));
    await screen.findByRole('button', { name: '저장 되돌리기' });
    await user.click(foodRadio('많이'));
    expect(screen.queryByRole('button', { name: '저장 되돌리기' })).toBeNull();

    await user.click(saveButton());
    await user.click(await screen.findByRole('button', { name: '닫기' }));
    expect(screen.queryByRole('button', { name: '저장 되돌리기' })).toBeNull();
  });
});

describe('일일 기록 저장 되돌리기 - 두 기기 경쟁', () => {
  const bodyOf = (l: DailyLog) => ({
    foodLevel: l.foodLevel, waterLevel: l.waterLevel, waterMl: l.waterMl, weightKg: l.weightKg,
    symptoms: l.symptoms, symptomsNone: l.symptomsNone, symptomOther: l.symptomOther, memo: l.memo,
    walkCount: l.walkCount ?? null, poopCount: l.poopCount ?? null,
  });

  it('A·B 가 모두 "기록 없음"으로 열고 A 가 먼저 저장한 뒤 B 가 저장해도, B 의 되돌리기는 A 의 기록을 지우지 않고 A 의 기록으로 복원한다', async () => {
    const aLog = log({ foodLevel: 1, memo: 'A 기기', updatedAt: '2026-10-12T01:00:00.100Z' });
    const bLog = log({ foodLevel: 3, memo: 'B 기기', updatedAt: '2026-10-12T02:00:00.200Z' });
    let todayCalls = 0;
    let puts = 0;
    const calls = mockServer({
      [TODAY]: () => {
        todayCalls += 1;
        if (todayCalls === 1) return json(200, todayExample()); // B 가 연 시점: 기록 없음
        if (todayCalls === 2) return json(200, todayExample({ dailyLog: aLog })); // B 가 저장하기 직전: A 가 이미 저장함
        return json(200, todayExample({ dailyLog: bLog })); // 되돌리기 직전: B 가 저장한 상태
      },
      [PUT]: () => json(200, puts++ === 0 ? bLog : aLog),
      [DELETE]: () => new Response(null, { status: 204 }),
    });
    renderToday();
    const user = userEvent.setup();
    await waitFor(() => saveButton());
    await user.click(foodRadio('많이'));
    await user.type(memoInput(), 'B 기기');
    await user.click(saveButton());
    // 화면은 기록 없음이었지만 서버에 A 의 기록이 있었으므로 "고친 내용" 안내가 나온다
    expect(await screen.findByText('고친 내용을 저장했어요.')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: '저장 되돌리기' }));
    expect(await screen.findByText('이전에 저장한 내용으로 되돌렸어요.')).toBeTruthy();
    expect(calls.some((c) => c.method === 'DELETE')).toBe(false); // A·B 기록이 모두 사라지지 않는다
    const putCalls = calls.filter((c) => c.method === 'PUT');
    expect(putCalls).toHaveLength(2);
    expect(putCalls[1].body).toEqual(bodyOf(aLog));
    expect(memoInput().value).toBe('A 기기');
  });

  it('저장 직전 확인이 실패하면 화면이 알던 기록으로 되돌리되, 그 사이 다른 기기가 고쳤으면 덮어쓰지 않는다', async () => {
    const bLog = log({ memo: 'B 기기', updatedAt: '2026-10-12T02:00:00.200Z' });
    let todayCalls = 0;
    const calls = mockServer({
      [TODAY]: () => {
        todayCalls += 1;
        if (todayCalls === 1) return json(200, todayExample());
        if (todayCalls === 2) throw new TypeError('Failed to fetch'); // 저장 직전 확인 실패
        return json(200, todayExample({ dailyLog: { ...bLog, memo: 'C 기기', updatedAt: '2026-10-12T03:00:00.000Z' } }));
      },
      [PUT]: () => json(200, bLog),
      [DELETE]: () => new Response(null, { status: 204 }),
    });
    renderToday();
    const user = userEvent.setup();
    await waitFor(() => saveButton());
    await user.type(memoInput(), 'B 기기');
    await user.click(saveButton());
    expect(await screen.findByText(/오늘 기록을 남겼어요|첫/)).toBeTruthy(); // 저장은 된다
    await user.click(screen.getByRole('button', { name: '저장 되돌리기' }));
    expect(await screen.findByText('다른 곳에서 고친 기록이라 되돌리지 않았어요.')).toBeTruthy();
    expect(calls.some((c) => c.method === 'DELETE')).toBe(false);
    expect(calls.filter((c) => c.method === 'PUT')).toHaveLength(1);
  });

  it('저장 직전 확인이 실패해도 서버 기록이 그대로면 기존 방식(화면의 기록)으로 되돌린다', async () => {
    const saved = log({ updatedAt: '2026-10-12T02:00:00.000Z' });
    let todayCalls = 0;
    const calls = mockServer({
      [TODAY]: () => {
        todayCalls += 1;
        if (todayCalls === 2) throw new TypeError('Failed to fetch');
        return json(200, todayCalls === 1 ? todayExample() : todayExample({ dailyLog: saved }));
      },
      [PUT]: () => json(200, saved),
      [DELETE]: () => new Response(null, { status: 204 }),
    });
    renderToday();
    const user = userEvent.setup();
    await user.click(await waitFor(() => saveButton()));
    await user.click(await screen.findByRole('button', { name: '저장 되돌리기' }));
    expect(await screen.findByText('저장하기 전 상태로 되돌렸어요.')).toBeTruthy();
    expect(calls.some((c) => c.method === 'DELETE')).toBe(true);
  });

  it('되돌리는 중에 입력한 내용은 완료되어도 지워지지 않는다', async () => {
    const saved = log({ updatedAt: '2026-10-12T02:00:00Z' });
    let todayCalls = 0;
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => {
      release = r;
    });
    mockServer({
      [TODAY]: async () => {
        todayCalls += 1;
        if (todayCalls <= 2) return json(200, todayExample());
        await gate; // 되돌리기 직전 확인을 붙잡아 "되돌리는 중" 상태를 만든다
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
    await user.type(memoInput(), '되돌리는 중 입력');
    release();
    expect(await screen.findByText('저장하기 전 상태로 되돌렸어요.')).toBeTruthy();
    expect(memoInput().value).toBe('되돌리는 중 입력');
    expect(saveButton().textContent).toBe('오늘 기록 저장'); // savedLog 는 서버 상태(기록 없음)로 갱신됐다
  });
});

describe('체중 자릿수 확인', () => {
  async function typeWeight(user: ReturnType<typeof userEvent.setup>, value: string) {
    await waitFor(() => saveButton());
    const input = weightInput();
    await user.clear(input);
    await user.type(input, value);
  }

  it('지난 기록의 5배 이상이면 저장 전에 숫자 두 개를 나란히 보여 주고 요청을 보내지 않는다', async () => {
    const calls = mockServer({ [TODAY]: () => json(200, todayExample()), [PUT]: () => json(200, log({ weightKg: 43 })) });
    renderToday();
    const user = userEvent.setup();
    await typeWeight(user, '43');
    await user.click(saveButton());
    const card = await screen.findByRole('alert', { name: /체중 숫자를 한 번 확인해 주세요/ });
    expect(card.textContent).toContain('4.3kg (3일 전)');
    expect(card.textContent).toContain('43kg');
    expect(calls.some((c) => c.method === 'PUT')).toBe(false);
  });

  it('[다시 입력]은 값을 지우지 않고 칸에 포커스를 두어 전체 선택한다', async () => {
    mockServer({ [TODAY]: () => json(200, todayExample()) });
    renderToday();
    const user = userEvent.setup();
    await typeWeight(user, '43');
    await user.click(saveButton());
    await user.click(await screen.findByRole('button', { name: '다시 입력' }));
    expect(screen.queryByRole('button', { name: '그대로 저장' })).toBeNull();
    const input = weightInput();
    expect(document.activeElement).toBe(input);
    expect(input.value).toBe('43');
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe(2);
  });

  it('[그대로 저장]은 한 번에 저장하고, 같은 값으로는 다시 묻지 않는다', async () => {
    let n = 0;
    const calls = mockServer({
      [TODAY]: () => json(200, todayExample()),
      [PUT]: () => json(200, log({ weightKg: 43, updatedAt: `2026-10-12T02:0${++n}:00Z` })),
    });
    renderToday();
    const user = userEvent.setup();
    await typeWeight(user, '43');
    await user.click(saveButton());
    await user.click(await screen.findByRole('button', { name: '그대로 저장' }));
    await waitFor(() => expect(calls.filter((c) => c.method === 'PUT')).toHaveLength(1));
    expect((calls.find((c) => c.method === 'PUT')?.body as { weightKg: number }).weightKg).toBe(43);
    await screen.findByText(/고친 내용을 저장했어요|오늘 기록을 남겼어요/);
    // 같은 값으로 다시 저장해도 묻지 않는다
    await user.click(saveButton());
    await waitFor(() => expect(calls.filter((c) => c.method === 'PUT')).toHaveLength(2));
    expect(screen.queryByRole('button', { name: '다시 입력' })).toBeNull();
  });

  it('보통 범위(4.8)나 값을 고친 뒤에는 묻지 않는다', async () => {
    const calls = mockServer({ [TODAY]: () => json(200, todayExample()), [PUT]: () => json(200, log({ weightKg: 4.8 })) });
    renderToday();
    const user = userEvent.setup();
    await typeWeight(user, '43');
    await user.click(saveButton());
    await screen.findByRole('button', { name: '다시 입력' });
    await user.clear(weightInput());
    await user.type(weightInput(), '4.8');
    expect(screen.queryByRole('button', { name: '다시 입력' })).toBeNull(); // 값을 고치면 카드가 닫힌다
    await user.click(saveButton());
    await waitFor(() => expect(calls.some((c) => c.method === 'PUT')).toBe(true));
  });

  it('"그대로 저장"으로 확인한 값은 날짜가 바뀌어 새로 불러오면 다시 묻는다', async () => {
    let todayCalls = 0;
    mockServer({
      [TODAY]: () => {
        todayCalls += 1;
        return json(200, todayCalls <= 2 ? todayExample() : todayExample({ recordDate: '2026-10-13', doses: [] }));
      },
      [PUT]: () => json(400, { code: 'INVALID_RECORD_DATE', message: 'x' }), // 새벽 4시를 넘겨 날짜가 바뀜 → 새로 불러옴
    });
    renderToday();
    const user = userEvent.setup();
    await typeWeight(user, '43');
    await user.click(saveButton());
    await user.click(await screen.findByRole('button', { name: '그대로 저장' }));
    await waitFor(() => expect(todayCalls).toBe(3)); // 새 날짜로 다시 불러옴
    await waitFor(() => expect(screen.queryByRole('alert', { name: /체중 숫자/ })).toBeNull());
    await user.clear(weightInput());
    await user.type(weightInput(), '43');
    await user.click(saveButton());
    expect(await screen.findByRole('button', { name: '그대로 저장' })).toBeTruthy(); // 이전 날짜의 확인값이 남아 있으면 묻지 않는다
  });
});

describe('저장하지 않은 입력을 두고 나가기', () => {
  it('바뀐 내용이 없으면 확인 없이 이동한다', async () => {
    mockServer({ [TODAY]: () => json(200, todayExample()) });
    renderToday();
    const user = userEvent.setup();
    await waitFor(() => saveButton());
    await user.click(screen.getAllByRole('link', { name: '지난 기록' })[0]);
    expect(await screen.findByText('지난 기록 화면')).toBeTruthy();
  });

  it('제안값 그대로면 바뀐 것이 아니다. 바꾸면 확인하고, [계속 적기]는 화면을 유지한다', async () => {
    mockServer({ [TODAY]: () => json(200, todayExample()) });
    renderToday();
    const user = userEvent.setup();
    await waitFor(() => saveButton());
    await user.type(memoInput(), '산책');
    const link = screen.getAllByRole('link', { name: '지난 기록' })[0];
    await user.click(link);
    const dialog = await screen.findByRole('alertdialog', { name: '저장하지 않고 나갈까요?' });
    expect(dialog.textContent).toContain('오늘 기록에서 바꾼 내용이 아직 저장되지 않았어요.');
    await user.click(screen.getByRole('button', { name: '계속 적기' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(memoInput().value).toBe('산책');
    expect(screen.queryByText('지난 기록 화면')).toBeNull();
  });

  it('[저장하지 않고 나가기]는 이동하고, Esc 는 계속 적기와 같다', async () => {
    mockServer({ [TODAY]: () => json(200, todayExample()) });
    renderToday();
    const user = userEvent.setup();
    await waitFor(() => saveButton());
    await user.type(memoInput(), '산책');
    await user.click(screen.getAllByRole('link', { name: '지난 기록' })[0]);
    await screen.findByRole('alertdialog');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('alertdialog')).toBeNull();

    await user.click(screen.getAllByRole('link', { name: '지난 기록' })[0]);
    await user.click(await screen.findByRole('button', { name: '저장하지 않고 나가기' }));
    expect(await screen.findByText('지난 기록 화면')).toBeTruthy();
  });

  it('저장한 뒤에는 깨끗해져서 확인 없이 이동한다', async () => {
    mockServer({ [TODAY]: () => json(200, todayExample()), [PUT]: () => json(200, log({ memo: '산책' })) });
    renderToday();
    const user = userEvent.setup();
    await waitFor(() => saveButton());
    await user.type(memoInput(), '산책');
    await user.click(saveButton());
    await screen.findByRole('button', { name: '저장 되돌리기' });
    await user.click(screen.getAllByRole('link', { name: '지난 기록' })[0]);
    expect(await screen.findByText('지난 기록 화면')).toBeTruthy();
  });
});

describe('투약 체크 되돌린 뒤 다시 체크', () => {
  it('[다시 체크]는 지금 시각으로 다시 기록한다', async () => {
    const calls = mockServer({
      [TODAY]: () =>
        json(200, todayExample({ doses: [{ medicationId: 'uuid', name: '아조딜', doseText: '1캡슐', scheduledTime: '20:00', taken: true, medLogId: 'm1', takenAt: '2026-10-12T11:00:00Z' }] })),
      'DELETE /api/med-logs/m1': () => new Response(null, { status: 204 }),
      'POST /api/med-logs': () =>
        json(201, { id: 'm2', medicationId: 'uuid', recordDate: '2026-10-12', scheduledTime: '20:00', takenAt: '2026-10-12T11:30:00Z' }),
    });
    renderToday();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /체크 되돌리기/ }));
    await user.click(await screen.findByRole('button', { name: '다시 체크' }));
    await waitFor(() => expect(calls.some((c) => c.method === 'POST' && c.path === '/api/med-logs')).toBe(true));
    expect(await screen.findByRole('button', { name: /체크 되돌리기/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '다시 체크' })).toBeNull();
  });
});

describe('투약 되돌리기 실패 시 포커스', () => {
  it('되돌리기가 실패해 줄이 다시 접혀도 포커스는 [되돌리기] 버튼에 남는다', async () => {
    mockServer({
      [TODAY]: () =>
        json(200, todayExample({ doses: [{ medicationId: 'uuid', name: '아조딜', doseText: '1캡슐', scheduledTime: '20:00', taken: true, medLogId: 'm1', takenAt: '2026-10-12T11:00:00Z' }] })),
      'DELETE /api/med-logs/m1': () => json(500, { code: 'INTERNAL', message: 'x' }),
    });
    renderToday();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /체크 되돌리기/ }));
    await screen.findByText(/되돌리지 못했어요|못했어요/);
    await waitFor(() => {
      const btn = screen.getByRole('button', { name: /체크 되돌리기/ });
      expect(document.activeElement).toBe(btn);
    });
  });
});
