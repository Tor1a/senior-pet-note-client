// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DailyLog, Pet, TodayResponse } from '../lib/petApi';
import { HIGHLIGHT_MS } from '../lib/todayDoses';
import { setToken } from '../lib/tokenStorage';
import { PetContext } from '../pet';
import TodayPage from './TodayPage';

// "오늘" 화면 핵심 동작 테스트. 실제 서버 없이 fetch 를 가짜로 바꾸고,
// 응답은 계약서(docs/api-today.md)의 예시 JSON 을 그대로 쓴다.

/** 계약서 3장 예시 + (체크 안 한 저녁 회차 1개 추가) */
function todayExample(overrides: Partial<TodayResponse> = {}): TodayResponse {
  return {
    recordDate: '2026-10-06',
    cutoffNotice: '새벽 4시 전 투약은 전날 기록으로 저장돼요',
    doses: [
      {
        medicationId: 'uuid',
        name: '아조딜',
        doseText: '1캡슐',
        scheduledTime: '08:00',
        taken: true,
        medLogId: 'uuid',
        takenAt: '2026-10-05T23:05:00Z',
      },
      {
        medicationId: 'uuid',
        name: '아조딜',
        doseText: '1캡슐',
        scheduledTime: '20:00',
        taken: false,
        medLogId: null,
        takenAt: null,
      },
    ],
    dailyLog: null,
    suggestions: { foodLevel: 2, waterLevel: 2, waterMl: null, weightKg: 4.35 },
    lastWeight: { weightKg: 4.4, recordDate: '2026-10-03' },
    ...overrides,
  };
}

/** 계약서 5장 예시 본문으로 만든 DailyLog */
function dailyLogExample(body: Partial<DailyLog> = {}): DailyLog {
  return {
    id: 'log-uuid',
    petId: 'pet-1',
    recordDate: '2026-10-06',
    foodLevel: 2,
    waterLevel: null,
    waterMl: 350,
    weightKg: null,
    symptoms: [],
    symptomsNone: true,
    symptomOther: null,
    memo: '',
    updatedAt: '2026-10-06T00:10:00Z',
    ...body,
  };
}

const PET: Pet = {
  id: 'pet-1',
  name: '보리',
  species: 'dog',
  birthYear: 2012,
  conditions: '신부전',
  hasPhoto: false,
  createdAt: '2026-10-01T00:00:00Z',
  updatedAt: '2026-10-01T00:00:00Z',
};

const json = (status: number, body: unknown) =>
  new Response(body === null ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

type Handler = (body: unknown) => Response | Promise<Response>;
interface Call {
  method: string;
  path: string;
  body: unknown;
}

/** 경로별 가짜 응답. 이벤트(POST /api/events)는 기본 202 */
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
      if (!handler) return json(404, { code: 'NOT_FOUND', message: 'not found' });
      return handler(body);
    }),
  );
  return calls;
}

function renderToday(reload = vi.fn(async () => {}), path = '/today') {
  render(
    <MemoryRouter initialEntries={[path]}>
      <PetContext.Provider value={{ status: 'ready', pet: PET, reload, setPet: vi.fn() }}>
        <TodayPage />
      </PetContext.Provider>
    </MemoryRouter>,
  );
  return { reload };
}

const radio = (group: string, name: string) =>
  within(screen.getByRole('radiogroup', { name: group })).getByRole('radio', { name: new RegExp(`^${name}`) });

const doseBox = (time: RegExp) => screen.getByRole('checkbox', { name: time });
/** 접힌 줄의 [되돌리기] 버튼(접힌 줄은 이 버튼만 반응한다) */
const undoBtn = (time: RegExp) => screen.getByRole('button', { name: new RegExp(`${time.source}.*체크 되돌리기`) });
const queryUndoBtn = (time: RegExp) =>
  screen.queryByRole('button', { name: new RegExp(`${time.source}.*체크 되돌리기`) });
/** 체크된 회차인가(카드 모양이든 접힌 줄이든) */
const isChecked = (time: RegExp) =>
  queryUndoBtn(time) !== null || screen.queryByRole('checkbox', { name: time })?.getAttribute('aria-checked') === 'true';
/** 응답 대기 중인가 */
const isPending = (time: RegExp) =>
  (queryUndoBtn(time) ?? screen.getByRole('checkbox', { name: time })).getAttribute('aria-disabled') === 'true';

beforeEach(() => {
  setToken('test-token');
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('오늘 화면 — 조회와 제안값', () => {
  it('서버가 준 recordDate·cutoffNotice 를 표시하고, 제안값은 점선 + "최근 평균"으로 보여 준다', async () => {
    mockServer({ 'GET /api/pets/pet-1/today': () => json(200, todayExample()) });
    renderToday();

    expect(await screen.findByText('10월 6일 (화)')).toBeTruthy();
    expect(screen.getByText('새벽 4시 전 투약은 전날 기록으로 저장돼요')).toBeTruthy();
    expect(screen.getByText('보리 · 14살 · 신부전')).toBeTruthy();

    const food = radio('식사', '보통');
    expect(food.getAttribute('aria-checked')).toBe('true');
    expect(food.className).toContain('is-suggested');
    expect(food.className).not.toContain('is-confirmed');
    expect(food.getAttribute('aria-label')).toContain('아직 확인 안 함');
    expect(within(food).getByText('최근 평균')).toBeTruthy();
    expect(screen.getByText('지난 기록 4.4kg (3일 전)')).toBeTruthy();

    // 제안값은 보여 주기만 하고 저장하지 않는다
    expect(screen.getByRole('button', { name: '오늘 기록 저장' })).toBeTruthy();
  });

  it('페이지 제목 h1 은 날짜 하나이고, 체중이 비어 있으면 안내 문구가 비활성 버튼을 누르라고 하지 않는다', async () => {
    mockServer({
      'GET /api/pets/pet-1/today': () =>
        json(200, todayExample({ suggestions: { foodLevel: 2, waterLevel: 2, waterMl: null, weightKg: null }, lastWeight: null })),
    });
    renderToday();

    const h1 = await screen.findByRole('heading', { level: 1 });
    expect(h1.textContent).toBe('10월 6일 (화)');
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect((screen.getByRole('button', { name: '오늘 쟀어요' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('체중을 적으면 오늘 체중으로 저장돼요.')).toBeTruthy();
    expect(screen.queryByText(/\[오늘 쟀어요\]를 누르거나/)).toBeNull();
  });

  it('[저장]을 누르면 제안값을 확정해 계약과 같은 본문으로 PUT 하고, 실선으로 바뀐다', async () => {
    const saved = dailyLogExample({ foodLevel: 2, waterLevel: 2, waterMl: null });
    const calls = mockServer({
      'GET /api/pets/pet-1/today': () => json(200, todayExample()),
      'PUT /api/pets/pet-1/daily-logs/2026-10-06': () => json(200, saved),
    });
    renderToday();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: '오늘 기록 저장' }));

    const put = await waitFor(() => {
      const c = calls.find((x) => x.method === 'PUT');
      expect(c).toBeTruthy();
      return c!;
    });
    expect(put.path).toBe('/api/pets/pet-1/daily-logs/2026-10-06');
    // 계약 5장 필드 8개와 정확히 같아야 한다(루틴은 안 바꿨으니 두 키 생략 = 서버가 기존 값 유지) (체중은 [오늘 쟀어요]를 안 눌렀으니 null)
    expect(put.body).toEqual({
      foodLevel: 2,
      waterLevel: 2,
      waterMl: null,
      weightKg: null,
      symptoms: [],
      symptomsNone: true,
      symptomOther: null,
      memo: '',
    });

    expect(await screen.findByText(/오늘 기록을 남겼어요/)).toBeTruthy();
    const food = radio('식사', '보통');
    expect(food.className).toContain('is-confirmed');
    expect(food.className).not.toContain('is-suggested');
    expect(screen.getByRole('button', { name: '기록 수정하기' })).toBeTruthy();

    // daily_log_saved 이벤트: 탭 수와 소요 시간(ms)
    await waitFor(() => {
      const ev = calls.find((c) => c.path === '/api/events' && (c.body as { name: string }).name === 'daily_log_saved');
      expect(ev).toBeTruthy();
      const props = (ev!.body as { props: { taps: number; durationMs: number } }).props;
      expect(props.taps).toBe(1);
      expect(typeof props.durationMs).toBe('number');
    });
  });

  it('저장된 dailyLog 가 있으면 그 값을 실선으로 보여 준다(제안값보다 우선)', async () => {
    mockServer({
      'GET /api/pets/pet-1/today': () =>
        json(200, todayExample({ dailyLog: dailyLogExample({ foodLevel: 1, waterMl: 350, weightKg: 4.3 }) })),
    });
    renderToday();
    const food = await waitFor(() => radio('식사', '조금'));
    expect(food.className).toContain('is-confirmed');
    expect(radio('식사', '보통').getAttribute('aria-checked')).toBe('false');
    // 저장된 기록이 ml 이면 ml 입력으로 보여 준다
    expect((screen.getByLabelText('물 마신 양 (ml)') as HTMLInputElement).value).toBe('350');
    expect(screen.getByRole('button', { name: '✓ 오늘 쟀어요' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: '기록 수정하기' })).toBeTruthy();
  });

  it('체중은 [오늘 쟀어요]를 눌러야 저장 본문에 들어간다', async () => {
    const calls = mockServer({
      'GET /api/pets/pet-1/today': () => json(200, todayExample()),
      'PUT /api/pets/pet-1/daily-logs/2026-10-06': () => json(200, dailyLogExample({ weightKg: 4.35 })),
    });
    renderToday();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: '오늘 쟀어요' }));
    await user.click(screen.getByRole('button', { name: '오늘 기록 저장' }));
    await waitFor(() => expect(calls.find((c) => c.method === 'PUT')?.body).toMatchObject({ weightKg: 4.35 }));
  });

  it('첫 사용(제안값·기록 없음)이면 안내 문구, 약 등록 카드, "첫 기록 저장"을 보여 준다', async () => {
    mockServer({
      'GET /api/pets/pet-1/today': () =>
        json(
          200,
          todayExample({
            doses: [],
            suggestions: { foodLevel: null, waterLevel: null, waterMl: null, weightKg: null },
            lastWeight: null,
          }),
        ),
    });
    renderToday();
    expect(await screen.findByText('보리와의 첫 기록을 시작해 볼까요?')).toBeTruthy();
    expect(screen.getByRole('link', { name: '약 등록하기' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '첫 기록 저장' })).toBeTruthy();
    expect(radio('식사', '보통').getAttribute('aria-checked')).toBe('false');
  });
});

describe('오늘 화면 — 증상', () => {
  it('"특이사항 없음"이 기본 선택이고, 다른 태그를 고르면 자동 해제된다', async () => {
    const calls = mockServer({
      'GET /api/pets/pet-1/today': () => json(200, todayExample()),
      'PUT /api/pets/pet-1/daily-logs/2026-10-06': () =>
        json(200, dailyLogExample({ symptoms: ['vomit', 'other'], symptomsNone: false, symptomOther: '재채기' })),
    });
    renderToday();
    const user = userEvent.setup();
    const none = await screen.findByRole('button', { name: /특이사항 없음/ });
    expect(none.getAttribute('aria-pressed')).toBe('true');

    await user.click(screen.getByRole('button', { name: /구토/ }));
    expect(screen.getByRole('button', { name: /구토/ }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: /특이사항 없음/ }).getAttribute('aria-pressed')).toBe('false');

    await user.click(screen.getByRole('button', { name: /기타/ }));
    await user.type(screen.getByLabelText('기타 증상 내용'), '재채기');
    await user.click(screen.getByRole('button', { name: '오늘 기록 저장' }));

    await waitFor(() =>
      expect(calls.find((c) => c.method === 'PUT')?.body).toMatchObject({
        symptoms: ['vomit', 'other'],
        symptomsNone: false,
        symptomOther: '재채기',
      }),
    );
  });
});

describe('오늘 화면 — 투약 체크', () => {
  it('탭하면 응답 전에 바로 체크되고(낙관적 업데이트), 계약대로 POST 한 뒤 med_checked 를 보낸다', async () => {
    let resolvePost: (r: Response) => void = () => {};
    const calls = mockServer({
      'GET /api/pets/pet-1/today': () => json(200, todayExample()),
      'POST /api/med-logs': () => new Promise<Response>((r) => (resolvePost = r)),
    });
    renderToday();
    const user = userEvent.setup();
    const evening = await waitFor(() => doseBox(/오후 8:00/));
    expect(evening.getAttribute('aria-checked')).toBe('false');

    await user.click(evening);
    // 서버 응답 전인데도 체크 표시
    expect(doseBox(/오후 8:00/).getAttribute('aria-checked')).toBe('true');
    expect(calls.find((c) => c.method === 'POST' && c.path === '/api/med-logs')?.body).toEqual({
      medicationId: 'uuid',
      scheduledTime: '20:00',
    });

    resolvePost(
      json(201, {
        id: 'new-log',
        medicationId: 'uuid',
        recordDate: '2026-10-06',
        scheduledTime: '20:00',
        takenAt: '2026-10-06T11:02:00Z',
      }),
    );
    // 0.3초 뒤 한 줄로 접히고, 서버가 준 체크 시각(한국 20:02)을 보여 준다
    await waitFor(() => expect(queryUndoBtn(/오후 8:00/)).not.toBeNull(), { timeout: 2000 });
    expect(screen.getByText(/20:02 먹임/)).toBeTruthy();
    expect(screen.getByText(/오늘 약 2개 모두 먹였어요/)).toBeTruthy();
    await waitFor(() =>
      expect(calls.some((c) => c.path === '/api/events' && (c.body as { name: string }).name === 'med_checked')).toBe(
        true,
      ),
    );
  });

  it('저장에 실패하면 체크를 되돌리고 안내한다', async () => {
    mockServer({
      'GET /api/pets/pet-1/today': () => json(200, todayExample()),
      'POST /api/med-logs': () => json(500, { code: 'INTERNAL_ERROR', message: 'boom' }),
    });
    renderToday();
    const user = userEvent.setup();
    await user.click(await waitFor(() => doseBox(/오후 8:00/)));

    expect(await screen.findByText(/체크하지 못했어요/)).toBeTruthy();
    expect(doseBox(/오후 8:00/).getAttribute('aria-checked')).toBe('false');
  });

  it('409 ALREADY_CHECKED 면 체크 상태를 유지하고 서버 상태로 다시 맞춘다', async () => {
    let todayCalls = 0;
    const calls = mockServer({
      'GET /api/pets/pet-1/today': () => {
        todayCalls += 1;
        if (todayCalls === 1) return json(200, todayExample());
        // 두 번째 조회: 다른 기기에서 이미 체크한 상태
        const t = todayExample();
        t.doses[1] = { ...t.doses[1], taken: true, medLogId: 'other-device', takenAt: '2026-10-06T11:00:00Z' };
        return json(200, t);
      },
      'POST /api/med-logs': () => json(409, { code: 'ALREADY_CHECKED', message: 'already' }),
      'DELETE /api/med-logs/other-device': () => new Response(null, { status: 204 }),
    });
    renderToday();
    const user = userEvent.setup();
    await user.click(await waitFor(() => doseBox(/오후 8:00/)));

    expect(await screen.findByText('이미 체크된 약이라 화면을 맞췄어요.')).toBeTruthy();
    expect(isChecked(/오후 8:00/)).toBe(true);
    await waitFor(() => expect(todayCalls).toBe(2));

    // 동기화 후에는 서버의 medLogId 로 되돌릴 수 있다(접힌 줄의 [되돌리기])
    // (방금 체크한 줄은 접히는 동안 탭을 무시하므로 잠시 기다린다)
    const recheckable = await waitFor(() => undoBtn(/오후 8:00/));
    await new Promise((r) => setTimeout(r, 500));
    await user.click(recheckable);
    await waitFor(() =>
      expect(calls.some((c) => c.method === 'DELETE' && c.path === '/api/med-logs/other-device')).toBe(true),
    );
    expect(doseBox(/오후 8:00/).getAttribute('aria-checked')).toBe('false');
  });

  it('접힌 줄의 [되돌리기]를 누르면 DELETE 로 체크를 되돌리고, 결과와 [다시 체크]를 안내한다', async () => {
    const calls = mockServer({
      'GET /api/pets/pet-1/today': () => json(200, todayExample()),
      'DELETE /api/med-logs/uuid': () => new Response(null, { status: 204 }),
    });
    renderToday();
    const user = userEvent.setup();
    const morning = await waitFor(() => undoBtn(/오전 8:00/));
    expect(screen.getByText(/8:05 먹임/)).toBeTruthy(); // 23:05Z = 한국 08:05
    expect(screen.queryByRole('checkbox', { name: /오전 8:00/ })).toBeNull(); // 접힌 줄은 체크박스가 아니다

    await user.click(morning);
    expect(doseBox(/오전 8:00/).getAttribute('aria-checked')).toBe('false');
    await waitFor(() => expect(calls.some((c) => c.method === 'DELETE' && c.path === '/api/med-logs/uuid')).toBe(true));
    expect(await screen.findByText(/아조딜 체크를 되돌렸어요\./)).toBeTruthy();
    expect(screen.getByText(/다시 체크하면 지금 시각으로 기록돼요/)).toBeTruthy();
    expect(screen.getByRole('button', { name: '다시 체크' })).toBeTruthy();
  });

  it('체크 취소 중 늦게 도착한 오래된 GET /today 응답이 낙관적 상태를 덮어쓰지 않는다', async () => {
    let todayCalls = 0;
    let releaseStale!: () => void;
    const staleGate = new Promise<void>((r) => (releaseStale = r));
    mockServer({
      'GET /api/pets/pet-1/today': async () => {
        todayCalls += 1;
        if (todayCalls === 1) return json(200, todayExample());
        await staleGate; // 두 번째 조회는 오래 걸리고, 그 사이 체크 상태가 바뀐다(응답은 취소 전 상태)
        return json(200, todayExample());
      },
      'POST /api/med-logs': () => json(409, { code: 'ALREADY_CHECKED', message: 'already' }), // → 재동기 시작
      'DELETE /api/med-logs/uuid': () => new Response(null, { status: 204 }),
    });
    renderToday();
    const user = userEvent.setup();
    await user.click(await waitFor(() => doseBox(/오후 8:00/)));
    await waitFor(() => expect(todayCalls).toBe(2));
    await user.click(await waitFor(() => undoBtn(/오전 8:00/))); // 되돌리기(DELETE 성공)
    await waitFor(() => expect(doseBox(/오전 8:00/).getAttribute('aria-checked')).toBe('false'));
    releaseStale();
    await new Promise((r) => setTimeout(r, 50));
    expect(doseBox(/오전 8:00/).getAttribute('aria-checked')).toBe('false');
  });

  it('응답 대기 중인 회차는 재동기 응답이 와도 낙관적 체크 상태를 유지하고, 연타해도 POST 는 한 번', async () => {
    let releasePost!: () => void;
    const postGate = new Promise<void>((r) => (releasePost = r));
    let todayCalls = 0;
    const calls = mockServer({
      'GET /api/pets/pet-1/today': () => {
        todayCalls += 1;
        return json(200, todayExample());
      },
      'POST /api/med-logs': async () => {
        await postGate;
        return json(201, { id: 'log-9', medicationId: 'uuid', recordDate: '2026-10-06', scheduledTime: '20:00', takenAt: '2026-10-06T11:00:00Z' });
      },
      'DELETE /api/med-logs/uuid': () => json(404, { code: 'NOT_FOUND', message: 'x' }), // → 재동기 시작
    });
    renderToday();
    const user = userEvent.setup();
    const evening = await waitFor(() => doseBox(/오후 8:00/));
    await user.click(evening);
    await user.click(evening);
    await user.click(evening);
    await user.click(undoBtn(/오전 8:00/)); // 되돌리기 404 → GET /today (서버는 저녁을 아직 안 먹인 것으로 앎)
    await waitFor(() => expect(todayCalls).toBe(2));
    await new Promise((r) => setTimeout(r, 50));
    expect(isChecked(/오후 8:00/)).toBe(true);
    releasePost();
    await waitFor(() => expect(isPending(/오후 8:00/)).toBe(false));
    expect(isChecked(/오후 8:00/)).toBe(true);
    expect(calls.filter((c) => c.method === 'POST' && c.path === '/api/med-logs')).toHaveLength(1);
  });

  it('되돌리기가 404 이고 재동기도 실패해도 대기 상태가 풀려 다시 누를 수 있다', async () => {
    let todayCalls = 0;
    mockServer({
      'GET /api/pets/pet-1/today': () => {
        todayCalls += 1;
        return todayCalls === 1 ? json(200, todayExample()) : json(500, { code: 'INTERNAL', message: 'x' });
      },
      'DELETE /api/med-logs/uuid': () => json(404, { code: 'NOT_FOUND', message: 'x' }),
    });
    renderToday();
    const user = userEvent.setup();
    await user.click(await waitFor(() => undoBtn(/오전 8:00/)));
    await waitFor(() => expect(todayCalls).toBe(2));
    await waitFor(() => expect(doseBox(/오전 8:00/).getAttribute('aria-disabled')).toBeNull());
    expect(doseBox(/오전 8:00/).getAttribute('aria-checked')).toBe('false');
    expect(await screen.findByText(/이미 되돌려진 기록이라 화면을 맞췄어요/)).toBeTruthy();
  });
});

describe('오늘 화면 — 오류 처리', () => {
  it('pet 404 면 반려동물 정보를 다시 읽는다(없으면 등록 화면으로 이동)', async () => {
    mockServer({ 'GET /api/pets/pet-1/today': () => json(404, { code: 'NOT_FOUND', message: 'x' }) });
    const { reload } = renderToday();
    await waitFor(() => expect(reload).toHaveBeenCalled());
  });

  it('저장 400 은 친절한 한국어 안내를 보여 준다', async () => {
    mockServer({
      'GET /api/pets/pet-1/today': () => json(200, todayExample()),
      'PUT /api/pets/pet-1/daily-logs/2026-10-06': () => json(400, { code: 'VALIDATION_ERROR', message: 'bad' }),
    });
    renderToday();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: '오늘 기록 저장' }));
    expect(await screen.findByText(/입력한 내용을 확인해 주세요/)).toBeTruthy();
  });

  it('서버가 꺼져 있으면 연결 안내와 다시 불러오기 버튼을 보여 준다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );
    renderToday();
    expect(await screen.findByText(/서버에 연결할 수 없어요/)).toBeTruthy();
    expect(screen.getByRole('button', { name: '다시 불러오기' })).toBeTruthy();
  });

  it('이벤트 전송이 실패해도 화면은 그대로 동작한다', async () => {
    mockServer({
      'GET /api/pets/pet-1/today': () => json(200, todayExample()),
      'POST /api/events': () => json(401, { code: 'UNAUTHORIZED', message: 'x' }),
    });
    const onUnauthorized = vi.fn();
    window.addEventListener('spn:unauthorized', onUnauthorized);
    renderToday();
    expect(await screen.findByText('10월 6일 (화)')).toBeTruthy();
    await new Promise((r) => setTimeout(r, 50));
    expect(onUnauthorized).not.toHaveBeenCalled();
    window.removeEventListener('spn:unauthorized', onUnauthorized);
  });
});

describe('오늘 화면 — 푸시로 열었을 때(S9)', () => {
  it('?source=push&med=<id> 면 아직 안 먹인 해당 약 카드를 강조한다', async () => {
    mockServer({ 'GET /api/pets/pet-1/today': () => json(200, todayExample()) });
    renderToday(undefined, '/today?source=push&med=uuid');
    expect(await screen.findByText('방금 알림 온 약')).toBeTruthy();
    expect(doseBox(/20:00|오후 8:00/).className).toContain('is-highlight');
  });

  it('없는 약 id 면 강조 없이 그대로 연다', async () => {
    mockServer({ 'GET /api/pets/pet-1/today': () => json(200, todayExample()) });
    renderToday(undefined, '/today?source=push&med=none');
    await screen.findByText('10월 6일 (화)');
    expect(screen.queryByText('방금 알림 온 약')).toBeNull();
  });

  it('source=push 가 아니면 med 가 있어도 강조하지 않는다', async () => {
    mockServer({ 'GET /api/pets/pet-1/today': () => json(200, todayExample()) });
    renderToday(undefined, '/today?med=uuid');
    await screen.findByText('10월 6일 (화)');
    expect(screen.queryByText('방금 알림 온 약')).toBeNull();
  });
});

describe('오늘 화면 — 알림에서 바로 체크의 대체 흐름(큰 버튼·맨 위)', () => {
  const second = (taken = false) => ({
    medicationId: 'm2',
    name: '레나메진',
    doseText: '1포',
    scheduledTime: '21:00',
    taken,
    medLogId: taken ? 'log-2' : null,
    takenAt: taken ? '2026-10-06T00:05:00Z' : null,
  });
  const bigButton = () => screen.queryByRole('button', { name: /먹였어요 체크$/ });
  const order = () => screen.getAllByRole('listitem').map((li) => li.textContent ?? '');

  it('해당 약 카드가 맨 위로 올라오고 카드 아래에 약 이름·시각이 라벨에 든 큰 [먹였어요]가 보인다', async () => {
    mockServer({
      'GET /api/pets/pet-1/today': () => json(200, todayExample({ doses: [...todayExample().doses, second()] })),
    });
    renderToday(undefined, '/today?source=push&med=m2&t=21:00&d=2026-10-06&n=1');
    const big = await screen.findByRole('button', { name: '레나메진 1포 오후 9:00 먹였어요 체크' }, { timeout: 4000 });
    expect(big.textContent).toBe('먹였어요');
    expect(order()[0]).toContain('레나메진');
    expect(order()[0]).toContain('방금 알림 온 약');
    // 큰 버튼은 강조된 카드 하나에만 있다
    expect(screen.getAllByRole('button', { name: /먹였어요 체크$/ })).toHaveLength(1);
  });

  it('큰 버튼을 누르면 체크되고(POST /api/med-logs) 카드는 맨 위에서 접힌 줄이 된다', async () => {
    const calls = mockServer({
      'GET /api/pets/pet-1/today': () => json(200, todayExample({ doses: [...todayExample().doses, second()] })),
      'POST /api/med-logs': () =>
        json(201, { id: 'log-9', medicationId: 'm2', recordDate: '2026-10-06', scheduledTime: '21:00', takenAt: '2026-10-06T12:05:00Z' }),
    });
    renderToday(undefined, '/today?source=push&med=m2&t=21:00&d=2026-10-06');
    await userEvent.click(await screen.findByRole('button', { name: /레나메진.*먹였어요 체크$/ }, { timeout: 4000 }));
    await waitFor(() => expect(calls.some((c) => c.method === 'POST' && c.path === '/api/med-logs')).toBe(true));
    expect(calls.find((c) => c.path === '/api/med-logs')?.body).toEqual({ medicationId: 'm2', scheduledTime: '21:00' });
    expect(await screen.findByRole('button', { name: /레나메진.*체크 되돌리기/ }, { timeout: 4000 })).toBeTruthy();
    expect(bigButton()).toBeNull();
    expect(order()[0]).toContain('레나메진'); // 체크해도 아래로 튀지 않는다
  });

  it('push 로 열지 않았거나 이미 모두 먹인 약이면 큰 버튼이 없다(먹인 약은 접힌 상태 줄이 맨 위)', async () => {
    mockServer({
      'GET /api/pets/pet-1/today': () => json(200, todayExample({ doses: [...todayExample().doses, second(true)] })),
    });
    renderToday(undefined, '/today?med=m2');
    await screen.findByText('10월 6일 (화)');
    expect(bigButton()).toBeNull();
    expect(order()[0]).toContain('아조딜'); // 순서 그대로
    cleanup();
    renderToday(undefined, '/today?source=push&med=m2&t=21:00&d=2026-10-06');
    await screen.findByText('10월 6일 (화)');
    expect(bigButton()).toBeNull();
    expect(order()[0]).toContain('레나메진');
    expect(order()[0]).toContain('먹임');
  });

  it('없는 약 id 면 순서도 그대로고 큰 버튼도 없다', async () => {
    mockServer({ 'GET /api/pets/pet-1/today': () => json(200, todayExample()) });
    renderToday(undefined, '/today?source=push&med=none');
    await screen.findByText('10월 6일 (화)');
    expect(bigButton()).toBeNull();
    expect(order()[0]).toContain('오전 8:00');
  });
});

describe('오늘 화면 — 알림이 가리킨 회차에만 강조·큰 버튼 (리뷰 필수 1)', () => {
  // 같은 약 m1 의 아침(08:00)·저녁(20:00) 회차
  const dose = (scheduledTime: string, taken = false) => ({
    medicationId: 'm1',
    name: '아조딜',
    doseText: '1캡슐',
    scheduledTime,
    taken,
    medLogId: taken ? `log-${scheduledTime}` : null,
    takenAt: taken ? '2026-10-05T23:05:00Z' : null,
  });
  const twoDoses = (morningTaken = false) => ({ 'GET /api/pets/pet-1/today': () => json(200, todayExample({ doses: [dose('08:00', morningTaken), dose('20:00')] })) });
  const bigButtons = () => screen.queryAllByRole('button', { name: /먹였어요 체크$/ });
  const order = () => screen.getAllByRole('listitem').map((li) => li.textContent ?? '');

  it('08:00 미체크 + 20:00 알림 → 20:00 카드에만 강조·큰 버튼, 맨 위로 올라온다', async () => {
    mockServer(twoDoses());
    renderToday(undefined, '/today?source=push&med=m1&t=20:00&d=2026-10-06&n=1');
    const big = await screen.findByRole('button', { name: /오후 8:00 먹였어요 체크$/ }, { timeout: 4000 });
    expect(big).toBeTruthy();
    expect(bigButtons()).toHaveLength(1);
    expect(order()[0]).toContain('오후 8:00');
    expect(order()[0]).toContain('방금 알림 온 약');
    expect(order()[1]).not.toContain('방금 알림 온 약');
  });

  it('08:00 알림이면 08:00 카드에만 붙는다(같은 약의 저녁 회차에는 붙지 않는다)', async () => {
    mockServer(twoDoses());
    renderToday(undefined, '/today?source=push&med=m1&t=08:00&d=2026-10-06&n=1');
    await screen.findByRole('button', { name: /오전 8:00 먹였어요 체크$/ }, { timeout: 4000 });
    expect(bigButtons()).toHaveLength(1);
    expect(screen.queryByRole('button', { name: /오후 8:00 먹였어요 체크$/ })).toBeNull();
  });

  it('08:00 체크 후 20:00 으로 옮겨 가지 않는다(큰 버튼도 강조도 사라진다)', async () => {
    mockServer({
      ...twoDoses(),
      'POST /api/med-logs': () => json(201, { id: 'log-9', medicationId: 'm1', recordDate: '2026-10-06', scheduledTime: '08:00', takenAt: '2026-10-06T00:05:00Z' }),
    });
    renderToday(undefined, '/today?source=push&med=m1&t=08:00&d=2026-10-06&n=1');
    await userEvent.click(await screen.findByRole('button', { name: /오전 8:00 먹였어요 체크$/ }, { timeout: 4000 }));
    await screen.findByRole('button', { name: /오전 8:00.*체크 되돌리기/ }, { timeout: 4000 });
    expect(bigButtons()).toHaveLength(0);
    expect(screen.queryByText('방금 알림 온 약')).toBeNull();
    expect(order()[0]).toContain('오전 8:00'); // 고정된 자리도 그대로
  });

  it('어제 알림(d 가 오늘 recordDate 와 다름) → 강조도 큰 버튼도 순서 변경도 없다', async () => {
    mockServer(twoDoses());
    renderToday(undefined, '/today?source=push&med=m1&t=20:00&d=2026-10-05&n=1');
    await screen.findByText('10월 6일 (화)');
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByText('방금 알림 온 약')).toBeNull();
    expect(bigButtons()).toHaveLength(0);
    expect(order()[0]).toContain('오전 8:00');
  });

  it('시각이 없는 옛 URL 은 아직 안 먹인 첫 회차를 강조만 하고 큰 버튼은 붙이지 않는다(보수적 폴백)', async () => {
    mockServer(twoDoses());
    renderToday(undefined, '/today?source=push&med=m1&n=1');
    expect(await screen.findByText('방금 알림 온 약')).toBeTruthy();
    expect(bigButtons()).toHaveLength(0);
    expect(order()[0]).toContain('오전 8:00');
  });

  it('t 에 맞는 회차가 없으면(시각이 바뀜) 같은 약의 다른 회차로 넘어가지 않는다', async () => {
    mockServer(twoDoses());
    renderToday(undefined, '/today?source=push&med=m1&t=12:00&d=2026-10-06&n=1');
    await screen.findByText('10월 6일 (화)');
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByText('방금 알림 온 약')).toBeNull();
    expect(bigButtons()).toHaveLength(0);
  });
});

describe('오늘 화면 — 큰 버튼 UX (리뷰 참고 7)', () => {
  const dose = (scheduledTime: string) => ({
    medicationId: 'm1', name: '아조딜', doseText: '1캡슐', scheduledTime, taken: false, medLogId: null, takenAt: null,
  });
  const server = () =>
    mockServer({
      'GET /api/pets/pet-1/today': () => json(200, todayExample({ doses: [dose('08:00'), dose('20:00')] })),
      'POST /api/med-logs': () => json(201, { id: 'log-9', medicationId: 'm1', recordDate: '2026-10-06', scheduledTime: '20:00', takenAt: '2026-10-06T11:05:00Z' }),
    });

  it('2분 강조가 끝나도 큰 버튼은 남는다(카드 높이가 손가락 밑에서 바뀌지 않게). 테두리와 머리글만 사라진다', async () => {
    let expire: (() => void) | null = null;
    const realSetTimeout = window.setTimeout.bind(window);
    const spy = vi.spyOn(window, 'setTimeout').mockImplementation(((fn: TimerHandler, ms?: number, ...args: unknown[]) => {
      if (ms === HIGHLIGHT_MS) {
        expire = fn as () => void;
        return 0;
      }
      return realSetTimeout(fn, ms, ...args);
    }) as typeof window.setTimeout);
    server();
    renderToday(undefined, '/today?source=push&med=m1&t=20:00&d=2026-10-06&n=1');
    await screen.findByRole('button', { name: /오후 8:00 먹였어요 체크$/ }, { timeout: 4000 });
    expect(screen.getByText('방금 알림 온 약')).toBeTruthy();
    expect(expire).not.toBeNull();
    act(() => expire?.());
    expect(screen.queryByText('방금 알림 온 약')).toBeNull();
    expect(screen.getByRole('button', { name: /오후 8:00 먹였어요 체크$/ })).toBeTruthy();
    spy.mockRestore();
  });

  it('큰 버튼을 누른 직후에도 포커스가 body 로 떨어지지 않고, 줄이 접히면 [되돌리기]로 간다', async () => {
    server();
    renderToday(undefined, '/today?source=push&med=m1&t=20:00&d=2026-10-06&n=1');
    const user = userEvent.setup();
    const big = await screen.findByRole('button', { name: /오후 8:00 먹였어요 체크$/ }, { timeout: 4000 });
    await user.click(big);
    // 체크 직후(접히기 전): 큰 버튼이 그대로 있고 포커스를 유지한다(눌러도 다시 요청하지 않도록 비활성 표시)
    expect(document.activeElement).not.toBe(document.body);
    expect(document.contains(big)).toBe(true);
    expect(big.getAttribute('aria-disabled')).toBe('true');
    const undo = await screen.findByRole('button', { name: /오후 8:00.*체크 되돌리기/ }, { timeout: 4000 });
    await waitFor(() => expect(document.activeElement).toBe(undo));
  });
});

describe('오늘 화면 — 지난 기록 진입', () => {
  it('상단 바로가기와 아래쪽 링크 행이 /history 로 이어진다', async () => {
    mockServer({ 'GET /api/pets/pet-1/today': () => json(200, todayExample()) });
    renderToday();
    await screen.findByText('새벽 4시 전 투약은 전날 기록으로 저장돼요');
    expect(screen.getByRole('link', { name: '지난 기록' }).getAttribute('href')).toBe('/history');
    expect(screen.getByRole('link', { name: '지난 기록 보기 ›' }).getAttribute('href')).toBe('/history');
    expect(screen.getByRole('link', { name: '리포트 보기' }).getAttribute('href')).toBe('/report');
  });
});
