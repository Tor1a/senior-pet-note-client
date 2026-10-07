// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Medication, Pet } from '../lib/petApi';
import type { Reminder } from '../lib/reminderApi';
import { setToken } from '../lib/tokenStorage';
import { PetContext } from '../pet';
import { PushContext, type PushContextValue, type PushDeviceState } from '../push/PushProvider';
import MedicationsPage from './MedicationsPage';
import ReminderPage from './ReminderPage';

// 투약 알림 설정 화면 테스트. 실제 서버·Firebase 없이 fetch 를 가짜로 바꾸고,
// 응답은 계약서(docs/api-reminders.md)의 예시 JSON 을 쓴다.

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

const MED: Medication = {
  id: 'med-1',
  petId: 'pet-1',
  name: '아조딜',
  doseText: '1캡슐',
  times: ['08:00', '20:00'],
  active: true,
};

/** 계약서 2장 Reminder 응답 예시 */
function reminderExample(overrides: Partial<Reminder> = {}): Reminder {
  return {
    medicationId: 'med-1',
    enabled: true,
    repeat: 'weekly',
    daysOfWeek: ['mon', 'wed'],
    intervalDays: null,
    startDate: '2026-10-06',
    endDate: null,
    times: ['08:00', '20:00'],
    nextFireAt: '2026-10-06T23:00:00Z',
    updatedAt: '2026-10-06T00:00:00Z',
    ...overrides,
  };
}

/** 계약서 2장 "설정 전 기본값" */
const DEFAULT_REMINDER = reminderExample({
  enabled: false,
  repeat: 'daily',
  daysOfWeek: [],
  startDate: '2026-10-07',
  nextFireAt: null,
  updatedAt: null,
});

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

function mockServer(routes: Record<string, Handler>) {
  const calls: Call[] = [];
  const all: Record<string, Handler> = {
    'GET /api/pets/pet-1/medications': () => json(200, [MED]),
    ...routes,
  };
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

function pushValue(state: PushDeviceState, overrides: Partial<PushContextValue> = {}): PushContextValue {
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
  return <p data-testid="location">{loc.pathname + loc.search}</p>;
}

function renderPage(push: PushContextValue, path = '/medications/med-1/reminder') {
  render(
    <MemoryRouter initialEntries={[path]}>
      <PetContext.Provider value={{ status: 'ready', pet: PET, reload: vi.fn(async () => {}), setPet: vi.fn() }}>
        <PushContext.Provider value={push}>
          <Routes>
            <Route path="/medications/:id/reminder" element={<ReminderPage />} />
            <Route path="/medications" element={<MedicationsPage />} />
          </Routes>
          <LocationProbe />
        </PushContext.Provider>
      </PetContext.Provider>
    </MemoryRouter>,
  );
}

const putCall = (calls: Call[]) =>
  waitFor(() => {
    const c = calls.find((x) => x.method === 'PUT' && x.path === '/api/medications/med-1/reminder');
    expect(c).toBeTruthy();
    return c!;
  });

beforeEach(() => {
  setToken('test-token');
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('알림 설정 — 조회', () => {
  it('설정 전 기본값: 꺼짐, 약 이름, 개발 환경 안내(알림 사용 불가)', async () => {
    mockServer({ 'GET /api/medications/med-1/reminder': () => json(200, DEFAULT_REMINDER) });
    renderPage(pushValue('unavailable'));

    const sw = await screen.findByRole('switch', { name: /알림 받기/ });
    expect(sw.getAttribute('aria-checked')).toBe('false');
    expect(within(sw).getByText('꺼짐')).toBeTruthy();
    expect(screen.getByText('아조딜 · 1캡슐')).toBeTruthy();
    expect(screen.getByText('알림을 켜면 얼마나 자주, 언제까지 받을지 정할 수 있어요.')).toBeTruthy();
    expect(screen.getByText('이 환경에서는 알림이 설정되지 않았어요(개발 환경).')).toBeTruthy();
  });

  it('저장된 켜짐: 시각·요일·다음 알림(서울 시각)을 보여 준다', async () => {
    mockServer({ 'GET /api/medications/med-1/reminder': () => json(200, reminderExample()) });
    renderPage(pushValue('registered'));

    expect(await screen.findByText('오전 8:00 · 오후 8:00')).toBeTruthy();
    const days = screen.getByRole('group', { name: '알림 받을 요일' });
    expect(within(days).getByRole('button', { name: '월요일' }).getAttribute('aria-pressed')).toBe('true');
    expect(within(days).getByRole('button', { name: '화요일' }).getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByText('다음 알림: 10월 7일 (수) 오전 8:00')).toBeTruthy();
    expect(screen.getByText(/오늘 화면에는 이 약이 매일 보여요/)).toBeTruthy();
    // 허용됨이면 기기 안내 카드가 없다
    expect(screen.queryByText(/이 기기에서/)).toBeNull();
  });

  it('켜짐인데 nextFireAt 이 null 이고 종료일이 있으면 "기간이 끝났어요"', async () => {
    mockServer({
      'GET /api/medications/med-1/reminder': () =>
        json(200, reminderExample({ nextFireAt: null, endDate: '2026-10-31' })),
    });
    renderPage(pushValue('registered'));
    expect(await screen.findByText('10월 31일에 알림 기간이 끝났어요. 끝나는 날을 바꾸면 다시 알려 드려요.')).toBeTruthy();
  });

  it('약이 없어졌으면(404) 약 목록으로 돌아가 안내한다', async () => {
    mockServer({ 'GET /api/medications/med-1/reminder': () => json(404, { code: 'NOT_FOUND', message: 'x' }) });
    renderPage(pushValue('registered'));
    await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/medications'));
    expect(await screen.findByText('목록에서 뺀 약이에요. 약 목록으로 돌아왔어요.')).toBeTruthy();
  });
});

describe('알림 설정 — 저장', () => {
  it('매일 → 정한 요일만으로 바꿔 저장하면 요일만 담아 PUT 하고 다음 알림을 알려 준다', async () => {
    const saved = reminderExample({ daysOfWeek: ['mon', 'fri'] });
    const calls = mockServer({
      'GET /api/medications/med-1/reminder': () => json(200, DEFAULT_REMINDER),
      'PUT /api/medications/med-1/reminder': () => json(200, saved),
    });
    renderPage(pushValue('registered'));
    const user = userEvent.setup();

    await user.click(await screen.findByRole('switch', { name: /알림 받기/ }));
    await user.click(screen.getByRole('radio', { name: /정한 요일만/ }));
    await user.click(screen.getByRole('button', { name: '금요일' }));
    await user.click(screen.getByRole('button', { name: '월요일' }));
    expect(screen.getByText('저장하면 다음 알림 시각을 알려 드려요.')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '저장' }));

    const put = await putCall(calls);
    expect(put.body).toEqual({
      enabled: true,
      repeat: 'weekly',
      daysOfWeek: ['mon', 'fri'],
      startDate: '2026-10-07',
      endDate: null,
    });
    expect(await screen.findByText('알림을 저장했어요. 다음 알림: 10월 7일 (수) 오전 8:00')).toBeTruthy();
  });

  it('며칠마다: intervalDays 만 보내고, 이 기기에서 못 받으면 그 사실을 알린다', async () => {
    const calls = mockServer({
      'GET /api/medications/med-1/reminder': () => json(200, reminderExample({ repeat: 'daily', daysOfWeek: [] })),
      'PUT /api/medications/med-1/reminder': (body) =>
        json(200, reminderExample({ ...(body as Partial<Reminder>), daysOfWeek: [] })),
    });
    renderPage(pushValue('denied'));
    const user = userEvent.setup();

    await user.click(await screen.findByRole('radio', { name: /며칠마다/ }));
    expect(screen.getByText('하루 걸러 알려 드려요.')).toBeTruthy();
    expect((screen.getByRole('button', { name: '하루 줄이기' }) as HTMLButtonElement).disabled).toBe(true);
    await user.click(screen.getByRole('button', { name: '하루 늘리기' }));
    await user.click(screen.getByRole('button', { name: '저장' }));

    const put = await putCall(calls);
    expect(put.body).toEqual({ enabled: true, repeat: 'interval', intervalDays: 3, startDate: '2026-10-06', endDate: null });
    expect(await screen.findByText('알림을 저장했어요. 다만 이 기기에서는 알림을 받을 수 없어요.')).toBeTruthy();
    expect(screen.getByText('이 기기에서 알림이 꺼져 있어요.')).toBeTruthy();
  });

  it('요일을 하나도 안 고르면 저장하지 않고 안내한다', async () => {
    const calls = mockServer({
      'GET /api/medications/med-1/reminder': () => json(200, reminderExample({ daysOfWeek: ['mon'] })),
    });
    renderPage(pushValue('registered'));
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: '월요일' }));
    await user.click(screen.getByRole('button', { name: '저장' }));
    expect(await screen.findAllByText('알림 받을 요일을 하나 이상 골라 주세요.')).toHaveLength(2);
    expect(calls.some((c) => c.method === 'PUT')).toBe(false);
  });

  it('서버 400 이면 설계 문구로 안내한다', async () => {
    mockServer({
      'GET /api/medications/med-1/reminder': () => json(200, reminderExample()),
      'PUT /api/medications/med-1/reminder': () => json(400, { code: 'VALIDATION_ERROR', message: 'bad' }),
    });
    renderPage(pushValue('registered'));
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: '저장' }));
    expect(await screen.findByText('알림 설정을 저장하지 못했어요. 고른 내용을 다시 확인해 주세요.')).toBeTruthy();
  });

  it('끄고 저장하면 고른 값은 그대로 두고 enabled:false 로 보낸다', async () => {
    const calls = mockServer({
      'GET /api/medications/med-1/reminder': () => json(200, reminderExample()),
      'PUT /api/medications/med-1/reminder': () => json(200, reminderExample({ enabled: false, nextFireAt: null })),
    });
    renderPage(pushValue('registered'));
    const user = userEvent.setup();
    await user.click(await screen.findByRole('switch', { name: /알림 받기/ }));
    await user.click(screen.getByRole('button', { name: '저장' }));
    const put = await putCall(calls);
    expect(put.body).toEqual({
      enabled: false,
      repeat: 'weekly',
      daysOfWeek: ['mon', 'wed'],
      startDate: '2026-10-06',
      endDate: null,
    });
    expect(await screen.findByText('알림을 껐어요. 고른 설정은 그대로 남아 있어요.')).toBeTruthy();
  });
});

describe('알림 설정 — 권한 사전 안내(S3)', () => {
  it('아직 안 물어봄이면 저장 전에 설명을 먼저 보여 주고, [알림 허용하기]에서만 권한을 요청한다', async () => {
    const calls = mockServer({
      'GET /api/medications/med-1/reminder': () => json(200, DEFAULT_REMINDER),
      'PUT /api/medications/med-1/reminder': () => json(200, reminderExample({ repeat: 'daily', daysOfWeek: [] })),
    });
    const push = pushValue('default');
    renderPage(push);
    const user = userEvent.setup();

    await user.click(await screen.findByRole('switch', { name: /알림 받기/ }));
    await user.click(screen.getByRole('button', { name: '저장' }));

    const dialog = await screen.findByRole('dialog', { name: '약 먹일 시간에 알려 드릴게요' });
    expect(within(dialog).getByText('아조딜을(를) 먹일 시각이 되면 이 휴대폰으로 알림을 보내요.')).toBeTruthy();
    expect(push.requestPermission).not.toHaveBeenCalled();
    expect(calls.some((c) => c.method === 'PUT')).toBe(false);

    await user.click(within(dialog).getByRole('button', { name: '알림 허용하기' }));
    expect(push.requestPermission).toHaveBeenCalledTimes(1);
    await putCall(calls);
    expect(await screen.findByText(/^알림을 저장했어요. 다음 알림/)).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('[나중에]를 누르면 권한은 묻지 않고 저장만 한다', async () => {
    const calls = mockServer({
      'GET /api/medications/med-1/reminder': () => json(200, DEFAULT_REMINDER),
      'PUT /api/medications/med-1/reminder': () => json(200, reminderExample({ repeat: 'daily', daysOfWeek: [] })),
    });
    const push = pushValue('default');
    renderPage(push);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('switch', { name: /알림 받기/ }));
    await user.click(screen.getByRole('button', { name: '저장' }));
    await user.click(await screen.findByRole('button', { name: '나중에' }));
    await putCall(calls);
    expect(push.requestPermission).not.toHaveBeenCalled();
    expect(await screen.findByText('알림을 저장했어요. 다만 이 기기에서는 알림을 받을 수 없어요.')).toBeTruthy();
  });
});

describe('알림 설정 — 이 기기 상태 안내', () => {
  it.each<[PushDeviceState, string]>([
    ['ios-browser', 'iPhone에서는 홈 화면에 추가하면 알림을 받을 수 있어요.'],
    ['ios-outdated', 'iOS를 최신 버전(16.4 이상)으로 업데이트하면 받을 수 있어요.'],
    ['unsupported', '이 브라우저에서는 알림을 받을 수 없어요.'],
    ['denied', '이 기기에서 알림이 꺼져 있어요.'],
    ['error', '이 기기를 알림 받을 기기로 등록하지 못했어요.'],
  ])('%s', async (state, text) => {
    mockServer({ 'GET /api/medications/med-1/reminder': () => json(200, reminderExample()) });
    renderPage(pushValue(state));
    expect(await screen.findByText(text)).toBeTruthy();
  });

  it('아직 안 물어봄 + 켜짐으로 저장됨이면 [알림 허용하기] 카드', async () => {
    mockServer({ 'GET /api/medications/med-1/reminder': () => json(200, reminderExample()) });
    renderPage(pushValue('default'));
    expect(await screen.findByText('이 기기에서는 아직 알림을 받을 수 없어요.')).toBeTruthy();
  });
});

describe('약 목록 — 알림 진입점과 상태 줄(S1)', () => {
  it('약 카드에 알림 상태 줄과 [알림 설정]이 있고, 누르면 설정 화면 주소로 간다', async () => {
    mockServer({ 'GET /api/medications/med-1/reminder': () => json(200, reminderExample()) });
    renderPage(pushValue('denied'), '/medications');

    expect(await screen.findByText('알림 켜짐 · 월·수')).toBeTruthy();
    expect(screen.getByText('이 기기에서는 받을 수 없어요 ›')).toBeTruthy();
    const user = userEvent.setup();
    await user.click(screen.getByRole('link', { name: '알림 설정' }));
    await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/medications/med-1/reminder'));
  });

  it('[먹이는 시각 바꾸기]는 약 목록에서 그 약 고치기 폼을 연다', async () => {
    mockServer({ 'GET /api/medications/med-1/reminder': () => json(200, reminderExample()) });
    renderPage(pushValue('registered'));
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: '먹이는 시각 바꾸기 ›' }));
    expect(await screen.findByRole('heading', { name: '약 고치기' })).toBeTruthy();
    expect(screen.getByText('시각을 바꾸면 알림 시각도 같이 바뀌어요.')).toBeTruthy();
  });
});
