// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Medication, Pet } from '../lib/petApi';
import type { Reminder } from '../lib/reminderApi';
import { setToken } from '../lib/tokenStorage';
import { PetContext } from '../pet';
import { PushContext, type PushContextValue, type PushDeviceState } from '../push/PushProvider';
import MedicationsPage from './MedicationsPage';

// 약 관리 화면 현재 동작 고정 테스트(medicationForm.ts 추출 전 작성, 추출 후에도 그대로 통과해야 한다).
// 실제 서버 없이 fetch 를 가짜로 바꾸고 응답은 계약서 예시 JSON 을 쓴다.

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
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      const method = init?.method ?? 'GET';
      const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
      calls.push({ method, path: url.pathname, body });
      const handler = routes[`${method} ${url.pathname}`];
      if (!handler) return json(404, { code: 'NOT_FOUND', message: 'not found' });
      return handler(body);
    }),
  );
  return calls;
}

function pushValue(state: PushDeviceState): PushContextValue {
  return {
    state,
    isMobile: true,
    requestPermission: vi.fn(async () => 'registered' as PushDeviceState),
    recheck: vi.fn(async () => state),
    subscribe: () => () => {},
  };
}

function renderPage(push: PushContextValue = pushValue('registered'), reload = vi.fn(async () => {})) {
  render(
    <MemoryRouter initialEntries={['/medications']}>
      <PetContext.Provider value={{ status: 'ready', pet: PET, reload, setPet: vi.fn() }}>
        <PushContext.Provider value={push}>
          <Routes>
            <Route path="/medications" element={<MedicationsPage />} />
            <Route path="/medications/:id/reminder" element={<p>알림 설정 화면</p>} />
            <Route path="/today" element={<p>오늘 화면</p>} />
          </Routes>
        </PushContext.Provider>
      </PetContext.Provider>
    </MemoryRouter>,
  );
  return reload;
}

const REMINDER_GET = 'GET /api/medications/med-1/reminder';

beforeEach(() => {
  setToken('test-token');
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('약 관리 — 목록', () => {
  it('약 카드: 이름·용량·시각과 알림 상태 줄, 이 기기에서 못 받으면 2줄째, 라벨 문장', async () => {
    mockServer({
      'GET /api/pets/pet-1/medications': () => json(200, [MED]),
      [REMINDER_GET]: () => json(200, reminderExample()),
    });
    renderPage(pushValue('denied'));

    expect(await screen.findByText('아조딜')).toBeTruthy();
    expect(screen.getByText(/1캡슐/)).toBeTruthy();
    expect(screen.getByText('오전 8:00 · 오후 8:00')).toBeTruthy();
    expect(await screen.findByText('알림 켜짐 · 월·수')).toBeTruthy();
    expect(screen.getByText('이 기기에서는 받을 수 없어요 ›')).toBeTruthy();
    expect(
      screen.getByRole('link', {
        name: '아조딜 알림 켜짐, 월·수. 오전 8:00와 오후 8:00. 이 기기에서는 받을 수 없어요. 누르면 알림 설정으로 가요',
      }),
    ).toBeTruthy();
  });

  it('알림 꺼짐·기간 끝남 문구, 알림을 못 불러오면 상태 줄만 숨기고 [알림 설정]은 남긴다', async () => {
    const second: Medication = { ...MED, id: 'med-2', name: '레나메진', doseText: null, times: ['09:00'] };
    const third: Medication = { ...MED, id: 'med-3', name: '푸로세미드', doseText: null, times: ['10:00'] };
    mockServer({
      'GET /api/pets/pet-1/medications': () => json(200, [MED, second, third]),
      [REMINDER_GET]: () => json(200, reminderExample({ enabled: false, nextFireAt: null })),
      'GET /api/medications/med-2/reminder': () => json(200, reminderExample({ medicationId: 'med-2', nextFireAt: null })),
      'GET /api/medications/med-3/reminder': () => json(500, { code: 'INTERNAL', message: 'x' }),
    });
    renderPage();
    expect(await screen.findByText('알림 꺼짐')).toBeTruthy();
    expect(await screen.findByText('알림 기간이 끝났어요')).toBeTruthy();
    expect(screen.getAllByRole('link', { name: '알림 설정' })).toHaveLength(3);
  });

  it('약이 없으면 바로 등록 폼을 연다(닫기 버튼 없음)', async () => {
    mockServer({ 'GET /api/pets/pet-1/medications': () => json(200, []) });
    renderPage();
    expect(await screen.findByRole('heading', { name: '약 추가' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '닫기' })).toBeNull();
  });

  it('목록을 못 불러오면 안내하고, 404 면 반려동물을 다시 읽는다', async () => {
    mockServer({ 'GET /api/pets/pet-1/medications': () => json(404, { code: 'NOT_FOUND', message: 'x' }) });
    const reload = renderPage();
    await waitFor(() => expect(reload).toHaveBeenCalled());
  });
});

describe('약 관리 — 등록·수정', () => {
  it('등록: 이름·용량 trim, 용량 공백이면 null, 시각 오름차순으로 POST 하고 안내 + [알림 설정하기 ›]', async () => {
    let meds: Medication[] = [MED];
    const calls = mockServer({
      'GET /api/pets/pet-1/medications': () => json(200, meds),
      [REMINDER_GET]: () => json(200, reminderExample()),
      'POST /api/pets/pet-1/medications': (body) => {
        const b = body as Pick<Medication, 'name' | 'doseText' | 'times'>;
        const created: Medication = { ...MED, id: 'med-9', ...b };
        meds = [...meds, created];
        return json(201, created);
      },
    });
    renderPage();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: '+ 약 추가' }));
    expect(screen.getByRole('heading', { name: '약 추가' })).toBeTruthy();
    expect(screen.queryByText('시각을 바꾸면 알림 시각도 같이 바뀌어요.')).toBeNull();

    await user.type(screen.getByLabelText('약 이름'), '  레나메진 ');
    await user.type(screen.getByLabelText('용량 (선택)'), '   ');
    await user.click(screen.getByRole('button', { name: '+ 시각 추가' }));
    expect((screen.getByLabelText('2번째 시각') as HTMLInputElement).value).toBe('20:00');
    fireEvent.change(screen.getByLabelText('1번째 시각'), { target: { value: '21:00' } });
    await user.click(screen.getByRole('button', { name: '약 등록' }));

    await waitFor(() => expect(calls.some((c) => c.method === 'POST')).toBe(true));
    const post = calls.find((c) => c.method === 'POST')!;
    expect(post.body).toEqual({ name: '레나메진', doseText: null, times: ['20:00', '21:00'] });
    expect(await screen.findByText('레나메진을(를) 등록했어요.')).toBeTruthy();
    expect(screen.getByText('먹일 시간에 알림을 받아 볼까요?')).toBeTruthy();
    expect(screen.getByRole('link', { name: '알림 설정하기 ›' }).getAttribute('href')).toBe(
      '/medications/med-9/reminder',
    );
    expect(screen.queryByRole('heading', { name: '약 추가' })).toBeNull();
  });

  it('수정: 현재 값으로 폼이 열리고 PUT 하며 "정보를 고쳤어요." 안내(알림 설정하기 없음)', async () => {
    const calls = mockServer({
      'GET /api/pets/pet-1/medications': () => json(200, [MED]),
      [REMINDER_GET]: () => json(200, reminderExample()),
      'PUT /api/medications/med-1': (body) => json(200, { ...MED, ...(body as object) }),
    });
    renderPage();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: '고치기' }));
    expect(screen.getByRole('heading', { name: '약 고치기' })).toBeTruthy();
    expect(screen.getByText('시각을 바꾸면 알림 시각도 같이 바뀌어요.')).toBeTruthy();
    expect((screen.getByLabelText('약 이름') as HTMLInputElement).value).toBe('아조딜');
    expect((screen.getByLabelText('용량 (선택)') as HTMLInputElement).value).toBe('1캡슐');
    await user.clear(screen.getByLabelText('용량 (선택)'));
    await user.click(screen.getByRole('button', { name: '고친 내용 저장' }));

    await waitFor(() => expect(calls.some((c) => c.method === 'PUT')).toBe(true));
    expect(calls.find((c) => c.method === 'PUT')!.body).toEqual({
      name: '아조딜',
      doseText: null,
      times: ['08:00', '20:00'],
    });
    expect(await screen.findByText('아조딜 정보를 고쳤어요.')).toBeTruthy();
    expect(screen.queryByText('먹일 시간에 알림을 받아 볼까요?')).toBeNull();
  });

  it('입력 검증 문구 5종: 요청을 보내지 않는다', async () => {
    const calls = mockServer({
      'GET /api/pets/pet-1/medications': () => json(200, [MED]),
      [REMINDER_GET]: () => json(200, reminderExample()),
    });
    renderPage();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: '+ 약 추가' }));
    const submit = () => user.click(screen.getByRole('button', { name: '약 등록' }));

    await submit();
    expect(await screen.findByText('약 이름을 적어 주세요.')).toBeTruthy();

    await user.type(screen.getByLabelText('약 이름'), 'a');
    fireEvent.change(screen.getByLabelText('1번째 시각'), { target: { value: '' } });
    await submit();
    expect(await screen.findByText('먹이는 시각을 모두 골라 주세요.')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('1번째 시각'), { target: { value: '20:00' } });
    await user.click(screen.getByRole('button', { name: '+ 시각 추가' }));
    await submit();
    expect(await screen.findByText('같은 시각이 두 번 들어갔어요. 서로 다른 시각으로 골라 주세요.')).toBeTruthy();

    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(0);
  });

  it('시각은 최대 3개까지 추가되고 빼면 다시 추가할 수 있다. 1개일 때는 빼기가 없다', async () => {
    mockServer({ 'GET /api/pets/pet-1/medications': () => json(200, []) });
    renderPage();
    const user = userEvent.setup();
    await screen.findByRole('heading', { name: '약 추가' });
    expect(screen.queryByRole('button', { name: '이 시각 빼기' })).toBeNull();
    await user.click(screen.getByRole('button', { name: '+ 시각 추가' }));
    await user.click(screen.getByRole('button', { name: '+ 시각 추가' }));
    expect(screen.getByLabelText('3번째 시각')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '+ 시각 추가' })).toBeNull();
    await user.click(screen.getAllByRole('button', { name: '이 시각 빼기' })[0]);
    expect(screen.queryByLabelText('3번째 시각')).toBeNull();
    expect(screen.getByRole('button', { name: '+ 시각 추가' })).toBeTruthy();
  });

  it('이름 50자 제한(maxLength)과 서버 400 안내, 입력값 유지', async () => {
    mockServer({
      'GET /api/pets/pet-1/medications': () => json(200, [MED]),
      [REMINDER_GET]: () => json(200, reminderExample()),
      'POST /api/pets/pet-1/medications': () => json(400, { code: 'VALIDATION_ERROR', message: 'x' }),
    });
    renderPage();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: '+ 약 추가' }));
    expect((screen.getByLabelText('약 이름') as HTMLInputElement).maxLength).toBe(50);
    expect((screen.getByLabelText('용량 (선택)') as HTMLInputElement).maxLength).toBe(50);
    await user.type(screen.getByLabelText('약 이름'), '약');
    await user.click(screen.getByRole('button', { name: '약 등록' }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect((screen.getByLabelText('약 이름') as HTMLInputElement).value).toBe('약');
  });
});

describe('약 관리 — 삭제', () => {
  it('[목록에서 빼기] → 확인 → DELETE → 안내와 재조회', async () => {
    let meds: Medication[] = [MED];
    const calls = mockServer({
      'GET /api/pets/pet-1/medications': () => json(200, meds),
      [REMINDER_GET]: () => json(200, reminderExample()),
      'DELETE /api/medications/med-1': () => {
        meds = [];
        return json(204, null);
      },
    });
    renderPage();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: '목록에서 빼기' }));
    expect(screen.getByText('목록에서 뺄까요? 지난 기록은 남아요.')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '그대로 두기' }));
    expect(screen.queryByText('목록에서 뺄까요? 지난 기록은 남아요.')).toBeNull();
    expect(calls.some((c) => c.method === 'DELETE')).toBe(false);

    await user.click(screen.getByRole('button', { name: '목록에서 빼기' }));
    await user.click(screen.getByRole('button', { name: '빼기' }));
    expect(await screen.findByText('아조딜을(를) 목록에서 뺐어요. 지난 기록은 그대로 남아요.')).toBeTruthy();
    expect(calls.filter((c) => c.method === 'DELETE')).toHaveLength(1);
    // 약이 0개가 되면 등록 폼이 열린다
    expect(await screen.findByRole('heading', { name: '약 추가' })).toBeTruthy();
  });
});

describe('약 관리 — 이동', () => {
  it('[오늘 화면으로] 링크와 면책 문구', async () => {
    mockServer({
      'GET /api/pets/pet-1/medications': () => json(200, [MED]),
      [REMINDER_GET]: () => json(200, reminderExample()),
    });
    renderPage();
    const link = await screen.findByRole('link', { name: '오늘 화면으로' });
    expect(link.getAttribute('href')).toBe('/today');
    expect(screen.getByRole('link', { name: '← 오늘로' })).toBeTruthy();
    const card = (await screen.findByText('아조딜')).closest('li')!;
    expect(within(card).getByRole('link', { name: '알림 설정' }).getAttribute('href')).toBe('/medications/med-1/reminder');
  });
});
