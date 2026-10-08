import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import { addDays, seoulDateString } from '../lib/format';
import type { Reminder } from '../lib/reminderApi';
import { setFontScale } from '../testing/fontScale';
import { DEFAULT_REMINDER, json, MED, PET, reminderExample } from '../testing/fixtures';
import { pickInSheet } from '../testing/mockDateTimePicker';
import { mockNavigation, mockRouter, queued, queueRouterActions, resetRouterMocks, state as routerState, systemBack } from '../testing/mockRouter';
import { PetContext } from '../pet/PetProvider';
import { PushContext, type PushContextValue, type PushDeviceState } from '../push/pushContext';
import ReminderScreen from './ReminderScreen';

// 알림 설정 화면 테스트: 웹 ReminderPage.test.tsx 의 시나리오와 같은 이름·의미(+ 모바일 전용: 설정 열기, 시스템 뒤로, 선택기)
// 실제 서버·Firebase 없이 fetch 를 가짜로 바꾸고, 응답은 계약서(docs/api-reminders.md)의 예시 JSON 을 쓴다.

jest.mock('../services/client', () => require('../testing/mockClient'));
jest.mock('expo-router', () => require('../testing/mockRouter').factory());
jest.mock('@react-native-community/datetimepicker', () => require('../testing/mockDateTimePicker'));
const mockOpenSettings = jest.fn();
jest.mock('../services/openAppSettings', () => ({ openAppSettings: () => mockOpenSettings() }));

type Handler = (body: unknown) => Response | Promise<Response>;
let calls: { method: string; path: string; body: unknown }[] = [];

function setup(routes: Record<string, Handler> = {}) {
  const all: Record<string, Handler> = { 'GET /api/pets/pet-1/medications': () => json(200, [MED]), ...routes };
  global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
    const path = String(url).replace('http://test', '');
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ method, path, body });
    const h = all[`${method} ${path}`];
    return h ? h(body) : json(404, { code: 'NOT_FOUND', message: 'x' });
  }) as never;
}

function pushValue(s: PushDeviceState, overrides: Partial<PushContextValue> = {}): PushContextValue {
  return {
    state: s,
    requestPermission: jest.fn(async () => 'registered' as PushDeviceState),
    recheck: jest.fn(async () => s),
    bannerVisible: false,
    subscribe: () => () => {},
    ...overrides,
  };
}

const GET = 'GET /api/medications/med-1/reminder';
const PUT = 'PUT /api/medications/med-1/reminder';

function ui(p: PushContextValue) {
  return (
    <PushContext.Provider value={p}>
      <PetContext.Provider value={{ status: 'ready', pet: PET, reload: jest.fn() }}>
        <ReminderScreen id="med-1" />
      </PetContext.Provider>
    </PushContext.Provider>
  );
}

async function renderScreen(p: PushContextValue) {
  const r = await render(ui(p));
  return r;
}

const put = () => calls.find((c) => c.method === 'PUT' && c.path === '/api/medications/med-1/reminder');
const saveButton = () => screen.getByRole('button', { name: '저장' });

beforeEach(() => {
  calls = [];
  resetRouterMocks();
  mockOpenSettings.mockClear();
  setFontScale(1);
});

describe('알림 설정 — 조회', () => {
  it('설정 전 기본값: 꺼짐, 약 이름, 푸시 미설정 안내(알림 사용 불가)', async () => {
    setup({ [GET]: () => json(200, DEFAULT_REMINDER) });
    await renderScreen(pushValue('unavailable'));
    const sw = await screen.findByRole('switch', { name: '알림 받기' });
    expect(sw.props.accessibilityState.checked).toBe(false);
    // 글자 "꺼짐"은 눈에 보이는 표시(스크린리더는 스위치 상태로 읽으므로 접근성 트리에서는 숨김)
    expect(within(sw).getByText('□ 꺼짐', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByText('아조딜 · 1캡슐')).toBeTruthy();
    expect(screen.getByText('알림을 켜면 얼마나 자주, 언제까지 받을지 정할 수 있어요.')).toBeTruthy();
    expect(screen.getByText('이 앱에서는 아직 알림을 받을 수 없어요.')).toBeTruthy();
    expect(screen.getByText('알림 설정은 저장해 둘 수 있어요.')).toBeTruthy();
  });

  it('저장된 켜짐: 시각·요일·다음 알림(서울 시각)을 보여 준다', async () => {
    setup({ [GET]: () => json(200, reminderExample()) });
    await renderScreen(pushValue('registered'));
    await screen.findByText('오전 8:00 · 오후 8:00');
    expect(screen.getByRole('checkbox', { name: '월요일' }).props.accessibilityState.checked).toBe(true);
    expect(screen.getByRole('checkbox', { name: '화요일' }).props.accessibilityState.checked).toBe(false);
    expect(screen.getByText('다음 알림: 10월 7일 (수) 오전 8:00')).toBeTruthy();
    expect(screen.getByText(/오늘 화면에는 이 약이 매일 보여요/)).toBeTruthy();
    expect(screen.getByText('이 계정으로 로그인한 모든 기기에 알림이 가요.')).toBeTruthy();
    expect(screen.queryByText(/이 기기에서/)).toBeNull(); // 허용됨이면 기기 안내 카드가 없다
  });

  it('켜짐인데 nextFireAt 이 null 이고 종료일이 있으면 "기간이 끝났어요"', async () => {
    setup({ [GET]: () => json(200, reminderExample({ nextFireAt: null, endDate: '2026-10-31' })) });
    await renderScreen(pushValue('registered'));
    await screen.findByText('10월 31일에 알림 기간이 끝났어요. 끝나는 날을 바꾸면 다시 알려 드려요.');
  });

  it('약이 없어졌으면(404) 약 목록으로 돌아가며 gone 안내 코드를 싣는다', async () => {
    setup({ [GET]: () => json(404, { code: 'NOT_FOUND', message: 'x' }) });
    await renderScreen(pushValue('registered'));
    await act(async () => {});
    expect(mockRouter.dismissTo).toHaveBeenCalledWith({ pathname: '/medications', params: { notice: 'gone' } });
  });

  it('목록에 약이 없어도 gone 으로 돌아간다', async () => {
    setup({ 'GET /api/pets/pet-1/medications': () => json(200, []), [GET]: () => json(200, reminderExample()) });
    await renderScreen(pushValue('registered'));
    await act(async () => {});
    expect(mockRouter.dismissTo).toHaveBeenCalledWith({ pathname: '/medications', params: { notice: 'gone' } });
  });

  it('불러오기 실패는 [다시 불러오기], 401 은 아무 문구도 없다', async () => {
    setup({ [GET]: () => json(500, { code: 'INTERNAL', message: 'x' }) });
    await renderScreen(pushValue('registered'));
    await screen.findByRole('button', { name: '다시 불러오기' });
    setup({ [GET]: () => json(200, reminderExample()) });
    await fireEvent.press(screen.getByRole('button', { name: '다시 불러오기' }));
    await screen.findByText('오전 8:00 · 오후 8:00');
  });

  it('401 이면 오류 문구를 띄우지 않는다', async () => {
    setup({ [GET]: () => json(401, { code: 'UNAUTHORIZED', message: 'x' }) });
    await renderScreen(pushValue('registered'));
    await act(async () => {});
    expect(screen.queryByText(/로그인이 만료/)).toBeNull();
    expect(screen.queryByRole('button', { name: '다시 불러오기' })).toBeNull();
  });
});

describe('알림 설정 — 저장', () => {
  it('매일 → 정한 요일만으로 바꿔 저장하면 요일만 담아 PUT 하고 다음 알림을 알려 준다', async () => {
    setup({
      [GET]: () => json(200, DEFAULT_REMINDER),
      [PUT]: () => json(200, reminderExample({ daysOfWeek: ['mon', 'fri'] })),
    });
    await renderScreen(pushValue('registered'));
    await fireEvent.press(await screen.findByRole('switch', { name: '알림 받기' }));
    await fireEvent.press(screen.getByRole('radio', { name: /^정한 요일만/ }));
    await fireEvent.press(screen.getByRole('checkbox', { name: '금요일' }));
    await fireEvent.press(screen.getByRole('checkbox', { name: '월요일' }));
    expect(screen.getByText('저장하면 다음 알림 시각을 알려 드려요.')).toBeTruthy();
    await fireEvent.press(saveButton());
    await screen.findByText('✓ 알림을 저장했어요. 다음 알림: 10월 7일 (수) 오전 8:00');
    expect(put()?.body).toEqual({ enabled: true, repeat: 'weekly', daysOfWeek: ['mon', 'fri'], startDate: '2026-10-07', endDate: null });
  });

  it('며칠마다: intervalDays 만 보내고, 이 기기에서 못 받으면 그 사실을 알린다', async () => {
    setup({
      [GET]: () => json(200, reminderExample({ repeat: 'daily', daysOfWeek: [] })),
      [PUT]: (body) => json(200, reminderExample({ ...(body as Partial<Reminder>), daysOfWeek: [] })),
    });
    await renderScreen(pushValue('denied'));
    await fireEvent.press(await screen.findByRole('radio', { name: /^며칠마다/ }));
    expect(screen.getByText('하루 걸러 알려 드려요.')).toBeTruthy();
    expect(screen.getByText('2일마다')).toBeTruthy();
    expect(screen.getByRole('button', { name: '하루 줄이기' }).props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(screen.getByRole('button', { name: '하루 늘리기' }));
    expect(screen.getByText('3일마다')).toBeTruthy();
    await fireEvent.press(saveButton());
    await screen.findByText('✓ 알림을 저장했어요. 다만 이 기기에서는 알림을 받을 수 없어요.');
    expect(put()?.body).toEqual({ enabled: true, repeat: 'interval', intervalDays: 3, startDate: '2026-10-06', endDate: null });
    expect(screen.getByText('이 기기에서 알림이 꺼져 있어요.')).toBeTruthy();
  });

  it('간격은 30일에서 더 늘어나지 않는다', async () => {
    setup({ [GET]: () => json(200, reminderExample({ repeat: 'interval', daysOfWeek: [], intervalDays: 30 })) });
    await renderScreen(pushValue('registered'));
    expect((await screen.findByRole('button', { name: '하루 늘리기' })).props.accessibilityState.disabled).toBe(true);
  });

  it('요일을 하나도 안 고르면 저장하지 않고 안내한다(칸 아래 + 저장 바)', async () => {
    setup({ [GET]: () => json(200, reminderExample({ daysOfWeek: ['mon'] })) });
    await renderScreen(pushValue('registered'));
    await fireEvent.press(await screen.findByRole('checkbox', { name: '월요일' }));
    await fireEvent.press(saveButton());
    expect(await screen.findAllByText('! 알림 받을 요일을 하나 이상 골라 주세요.')).toHaveLength(2);
    expect(put()).toBeUndefined();
  });

  it('서버 400 이면 설계 문구로 안내한다', async () => {
    setup({ [GET]: () => json(200, reminderExample()), [PUT]: () => json(400, { code: 'VALIDATION_ERROR', message: 'bad' }) });
    await renderScreen(pushValue('registered'));
    await fireEvent.press(await screen.findByRole('button', { name: '저장' }));
    await screen.findByText('! 알림 설정을 저장하지 못했어요. 고른 내용을 다시 확인해 주세요.');
  });

  it('저장 실패(서버 오류)여도 고른 값은 그대로 둔다', async () => {
    setup({ [GET]: () => json(200, reminderExample()), [PUT]: () => json(500, { code: 'INTERNAL', message: 'x' }) });
    await renderScreen(pushValue('registered'));
    await fireEvent.press(await screen.findByRole('checkbox', { name: '금요일' }));
    await fireEvent.press(saveButton());
    await screen.findByText(/^! /);
    expect(screen.getByRole('checkbox', { name: '금요일' }).props.accessibilityState.checked).toBe(true);
  });

  it('끄고 저장하면 고른 값은 그대로 두고 enabled:false 로 보낸다', async () => {
    setup({
      [GET]: () => json(200, reminderExample()),
      [PUT]: () => json(200, reminderExample({ enabled: false, nextFireAt: null })),
    });
    await renderScreen(pushValue('registered'));
    await fireEvent.press(await screen.findByRole('switch', { name: '알림 받기' }));
    await fireEvent.press(saveButton());
    await screen.findByText('✓ 알림을 껐어요. 고른 설정은 그대로 남아 있어요.');
    expect(put()?.body).toEqual({ enabled: false, repeat: 'weekly', daysOfWeek: ['mon', 'wed'], startDate: '2026-10-06', endDate: null });
  });

  it('끈 상태에서 숨은 값이 잘못이면(요일 0개) 마지막 저장값으로 enabled:false 를 보낸다', async () => {
    setup({
      [GET]: () => json(200, reminderExample()),
      [PUT]: () => json(200, reminderExample({ enabled: false, nextFireAt: null })),
    });
    await renderScreen(pushValue('registered'));
    await fireEvent.press(await screen.findByRole('checkbox', { name: '월요일' }));
    await fireEvent.press(screen.getByRole('checkbox', { name: '수요일' }));
    await fireEvent.press(screen.getByRole('switch', { name: '알림 받기' }));
    await fireEvent.press(saveButton());
    await screen.findByText(/알림을 껐어요/);
    expect(put()?.body).toEqual({ enabled: false, repeat: 'weekly', daysOfWeek: ['mon', 'wed'], startDate: '2026-10-06', endDate: null });
  });

  it('저장 중 404 면 목록으로 gone', async () => {
    setup({ [GET]: () => json(200, reminderExample()), [PUT]: () => json(404, { code: 'NOT_FOUND', message: 'x' }) });
    await renderScreen(pushValue('registered'));
    await fireEvent.press(await screen.findByRole('checkbox', { name: '금요일' }));
    await fireEvent.press(saveButton());
    await act(async () => {});
    expect(mockRouter.dismissTo).toHaveBeenCalledWith({ pathname: '/medications', params: { notice: 'gone' } });
  });

  it('저장 중에는 [저장]이 잠기고 한 번만 보낸다', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    setup({
      [GET]: () => json(200, reminderExample()),
      [PUT]: async () => {
        await gate;
        return json(200, reminderExample());
      },
    });
    await renderScreen(pushValue('registered'));
    await fireEvent.press(await screen.findByRole('button', { name: '저장' }));
    await fireEvent.press(screen.getByRole('button', { name: '저장하는 중' }));
    await fireEvent.press(screen.getByRole('button', { name: '저장하는 중' }));
    expect(calls.filter((c) => c.method === 'PUT')).toHaveLength(1);
    await act(async () => release());
    await screen.findByText(/^✓ 알림을 저장했어요/);
  });
});

describe('알림 설정 — 기간(선택기)', () => {
  it('시작일 상한은 오늘+365일(서버 기준 서울 날짜), 선택한 날짜가 PUT 본문에 들어간다', async () => {
    setup({ [GET]: () => json(200, reminderExample({ repeat: 'daily', daysOfWeek: [] })), [PUT]: () => json(200, reminderExample()) });
    await renderScreen(pushValue('registered'));
    await fireEvent.press(await screen.findByRole('button', { name: /^시작하는 날, 2026년 10월 6일 화요일/ }));
    const max: Date = screen.getByTestId('datetimepicker').props.maximumDate;
    const expected = addDays(seoulDateString(), 365);
    expect(`${max.getFullYear()}-${String(max.getMonth() + 1).padStart(2, '0')}-${String(max.getDate()).padStart(2, '0')}`).toBe(expected);
    await pickInSheet(new Date(2026, 9, 20, 12, 0));
    expect(screen.getByRole('button', { name: /^시작하는 날, 2026년 10월 20일 화요일/ })).toBeTruthy();
    await fireEvent.press(saveButton());
    await act(async () => {});
    expect(put()?.body).toMatchObject({ startDate: '2026-10-20' });
  });

  it('끝나는 날: [날짜 정하기]를 고르면 시작일로 채워 보여 주고, 시작일보다 앞이면 저장하지 않고 안내한다', async () => {
    setup({ [GET]: () => json(200, reminderExample({ repeat: 'daily', daysOfWeek: [] })) });
    await renderScreen(pushValue('registered'));
    await fireEvent.press(await screen.findByRole('radio', { name: /^날짜 정하기/ }));
    const endButton = screen.getByRole('button', { name: /^끝나는 날, 2026년 10월 6일/ });
    await fireEvent.press(endButton);
    expect(screen.getByTestId('datetimepicker').props.minimumDate.getDate()).toBe(6); // 하한 = 시작일
    await pickInSheet(new Date(2026, 9, 1, 12, 0));
    await fireEvent.press(saveButton());
    expect(await screen.findAllByText('! 끝나는 날은 시작하는 날과 같거나 그 뒤여야 해요.')).toHaveLength(2);
    expect(put()).toBeUndefined();
  });

  it('끝나는 날을 정해 저장하면 endDate 를 보낸다', async () => {
    setup({ [GET]: () => json(200, reminderExample({ repeat: 'daily', daysOfWeek: [] })), [PUT]: () => json(200, reminderExample()) });
    await renderScreen(pushValue('registered'));
    await fireEvent.press(await screen.findByRole('radio', { name: /^날짜 정하기/ }));
    await fireEvent.press(screen.getByRole('button', { name: /^끝나는 날/ }));
    await pickInSheet(new Date(2026, 9, 31, 12, 0));
    await fireEvent.press(saveButton());
    await act(async () => {});
    expect(put()?.body).toMatchObject({ endDate: '2026-10-31' });
  });
});

describe('알림 설정 — 권한 사전 안내(S3)', () => {
  const defaultServer = () =>
    setup({
      [GET]: () => json(200, DEFAULT_REMINDER),
      [PUT]: () => json(200, reminderExample({ repeat: 'daily', daysOfWeek: [] })),
    });

  it('아직 안 물어봄이면 저장 전에 설명을 먼저 보여 주고, [알림 허용하기]에서만 권한을 요청한다', async () => {
    defaultServer();
    const p = pushValue('default');
    await renderScreen(p);
    await fireEvent.press(await screen.findByRole('switch', { name: '알림 받기' }));
    await fireEvent.press(saveButton());

    await screen.findByText('약 먹일 시간에 알려 드릴게요');
    expect(screen.getByText('아조딜을(를) 먹일 시각이 되면 이 휴대폰으로 알림을 보내요.')).toBeTruthy();
    expect(screen.getByText('잠금화면에 반려동물과 약 이름이 보여요.')).toBeTruthy();
    expect(p.requestPermission).not.toHaveBeenCalled();
    expect(put()).toBeUndefined();

    await fireEvent.press(screen.getByRole('button', { name: '알림 허용하기' }));
    expect(p.requestPermission).toHaveBeenCalledTimes(1);
    await screen.findByText(/^✓ 알림을 저장했어요. 다음 알림/);
    expect(put()).toBeDefined();
    expect(screen.queryByText('약 먹일 시간에 알려 드릴게요')).toBeNull();
  });

  it('OS 권한 창에서 거부하면 저장은 하고 못 받는다고 알린다', async () => {
    defaultServer();
    const p = pushValue('default', { requestPermission: jest.fn(async () => 'denied' as PushDeviceState) });
    await renderScreen(p);
    await fireEvent.press(await screen.findByRole('switch', { name: '알림 받기' }));
    await fireEvent.press(saveButton());
    await fireEvent.press(await screen.findByRole('button', { name: '알림 허용하기' }));
    await screen.findByText('✓ 알림을 저장했어요. 다만 이 기기에서는 알림을 받을 수 없어요.');
    expect(put()).toBeDefined();
  });

  it('[나중에]를 누르면 권한은 묻지 않고 저장만 한다', async () => {
    defaultServer();
    const p = pushValue('default');
    await renderScreen(p);
    await fireEvent.press(await screen.findByRole('switch', { name: '알림 받기' }));
    await fireEvent.press(saveButton());
    await fireEvent.press(await screen.findByRole('button', { name: '나중에' }));
    await screen.findByText('✓ 알림을 저장했어요. 다만 이 기기에서는 알림을 받을 수 없어요.');
    expect(p.requestPermission).not.toHaveBeenCalled();
    expect(put()).toBeDefined();
  });

  it('끄고 저장할 때는 권한을 묻지 않는다', async () => {
    setup({ [GET]: () => json(200, reminderExample()), [PUT]: () => json(200, reminderExample({ enabled: false, nextFireAt: null })) });
    const p = pushValue('default');
    await renderScreen(p);
    await fireEvent.press(await screen.findByRole('switch', { name: '알림 받기' }));
    await fireEvent.press(saveButton());
    await screen.findByText(/알림을 껐어요/);
    expect(screen.queryByText('약 먹일 시간에 알려 드릴게요')).toBeNull();
    expect(p.requestPermission).not.toHaveBeenCalled();
  });

  it('unavailable 이면 사전 안내 없이 바로 저장한다', async () => {
    defaultServer();
    await renderScreen(pushValue('unavailable'));
    await fireEvent.press(await screen.findByRole('switch', { name: '알림 받기' }));
    await fireEvent.press(saveButton());
    await screen.findByText('✓ 알림을 저장했어요. 다만 이 기기에서는 알림을 받을 수 없어요.');
    expect(screen.queryByText('약 먹일 시간에 알려 드릴게요')).toBeNull();
  });
});

describe('알림 설정 — 이 기기 상태 안내', () => {
  it('아직 안 물어봄 + 켜짐으로 저장됨이면 [알림 허용하기] 카드, 누르면 사전 안내', async () => {
    setup({ [GET]: () => json(200, reminderExample()) });
    const p = pushValue('default');
    await renderScreen(p);
    await screen.findByText('이 기기에서는 아직 알림을 받을 수 없어요.');
    await fireEvent.press(screen.getByRole('button', { name: '알림 허용하기' }));
    await screen.findByText('약 먹일 시간에 알려 드릴게요');
    expect(p.requestPermission).not.toHaveBeenCalled();
  });

  it('아직 안 물어봄 + 꺼짐으로 저장됨이면 카드가 없다', async () => {
    setup({ [GET]: () => json(200, DEFAULT_REMINDER) });
    await renderScreen(pushValue('default'));
    await screen.findByRole('switch', { name: '알림 받기' });
    expect(screen.queryByText('이 기기에서는 아직 알림을 받을 수 없어요.')).toBeNull();
  });

  it('denied: 안내 + [설정 열기]가 openAppSettings 를 부르고, 켜는 방법을 펼칠 수 있다', async () => {
    setup({ [GET]: () => json(200, reminderExample()) });
    await renderScreen(pushValue('denied'));
    await screen.findByText('이 기기에서 알림이 꺼져 있어요.');
    expect(screen.getByText('휴대폰 설정에서 이 앱의 알림을 켜야 받을 수 있어요.')).toBeTruthy();
    expect(screen.getByText('설정에서 알림을 켜고 돌아오면 자동으로 확인해요.')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: '설정 열기' }));
    expect(mockOpenSettings).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByRole('button', { name: '켜는 방법 보기' }));
    screen.getByText(/설정 > 알림/);
  });

  it('error: [다시 시도]가 recheck 를 부른다', async () => {
    setup({ [GET]: () => json(200, reminderExample()) });
    const p = pushValue('error');
    await renderScreen(p);
    await screen.findByText('이 기기를 알림 받을 기기로 등록하지 못했어요.');
    await fireEvent.press(screen.getByRole('button', { name: '다시 시도' }));
    expect(p.recheck).toHaveBeenCalledTimes(1);
  });

  it('설정에서 허용하고 돌아와 registered 가 되면 "이제 이 기기에서도 알림을 받아요."', async () => {
    setup({ [GET]: () => json(200, reminderExample()) });
    const r = await renderScreen(pushValue('denied'));
    await screen.findByText('이 기기에서 알림이 꺼져 있어요.');
    await r.rerender(ui(pushValue('registered')));
    await screen.findByText('✓ 이제 이 기기에서도 알림을 받아요.');
    expect(screen.queryByText('이 기기에서 알림이 꺼져 있어요.')).toBeNull();
  });
});

describe('알림 설정 — 설정에서 허용하고 돌아온 뒤', () => {
  it('denied → registering → registered 로 두 단계를 거쳐도 안내를 보여 준다', async () => {
    setup({ [GET]: () => json(200, reminderExample()) });
    const r = await renderScreen(pushValue('denied'));
    await screen.findByText('이 기기에서 알림이 꺼져 있어요.');
    await r.rerender(ui(pushValue('registering')));
    await r.rerender(ui(pushValue('registered')));
    await screen.findByText('✓ 이제 이 기기에서도 알림을 받아요.');
  });

  it('처음부터 registered 면 안내가 없다', async () => {
    setup({ [GET]: () => json(200, reminderExample()) });
    await renderScreen(pushValue('registered'));
    await screen.findByText('오전 8:00 · 오후 8:00');
    expect(screen.queryByText(/이제 이 기기에서도/)).toBeNull();
  });
});

describe('알림 설정 — 저장 안 한 변경 확인과 이동', () => {
  it('고친 내용이 없으면 [← 약 목록으로]는 바로 돌아가고 시스템 뒤로도 막지 않는다', async () => {
    setup({ [GET]: () => json(200, reminderExample()) });
    await renderScreen(pushValue('registered'));
    await screen.findByRole('switch', { name: '알림 받기' });
    expect(systemBack()).toBe(false);
    await fireEvent.press(screen.getByRole('button', { name: '약 목록으로 돌아가기' }));
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
  });

  it('고친 내용이 있으면 화면 안 [← 약 목록으로]가 확인 카드를 띄운다. [계속 고치기]는 머무르고 [나가기]는 이동한다', async () => {
    setup({ [GET]: () => json(200, reminderExample()) });
    await renderScreen(pushValue('registered'));
    await fireEvent.press(await screen.findByRole('checkbox', { name: '금요일' }));
    await fireEvent.press(screen.getByRole('button', { name: '약 목록으로 돌아가기' }));
    expect(screen.getByText('저장하지 않고 나갈까요?')).toBeTruthy();
    expect(mockRouter.back).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('button', { name: '계속 고치기' }));
    expect(screen.queryByText('저장하지 않고 나갈까요?')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: '약 목록으로 돌아가기' }));
    await fireEvent.press(screen.getByRole('button', { name: '나가기' }));
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
  });

  it('시스템 뒤로가기도 가로채 같은 확인 카드를 띄우고, [나가기]에서 막았던 동작을 이어서 실행한다', async () => {
    setup({ [GET]: () => json(200, reminderExample()) });
    await renderScreen(pushValue('registered'));
    await fireEvent.press(await screen.findByRole('checkbox', { name: '금요일' }));
    const action = { type: 'GO_BACK' };
    let blocked = false;
    await act(async () => {
      blocked = systemBack(action);
    });
    expect(blocked).toBe(true);
    await screen.findByText('저장하지 않고 나갈까요?');
    expect(mockNavigation.dispatch).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('button', { name: '나가기' }));
    expect(mockNavigation.dispatch).toHaveBeenCalledWith(action);
  });

  it('저장하고 나면(변경 없음) 시스템 뒤로를 막지 않는다', async () => {
    setup({ [GET]: () => json(200, reminderExample()), [PUT]: () => json(200, reminderExample({ daysOfWeek: ['mon', 'wed', 'fri'] })) });
    await renderScreen(pushValue('registered'));
    await fireEvent.press(await screen.findByRole('checkbox', { name: '금요일' }));
    await fireEvent.press(saveButton());
    await screen.findByText(/^✓ 알림을 저장했어요/);
    expect(systemBack()).toBe(false);
  });

  it('[먹이는 시각 바꾸기 ›]는 약 수정 화면(from=reminder)으로 가고, 고친 내용이 있으면 먼저 확인한다', async () => {
    setup({ [GET]: () => json(200, reminderExample()) });
    await renderScreen(pushValue('registered'));
    await fireEvent.press(await screen.findByRole('button', { name: '먹이는 시각 바꾸기' }));
    expect(mockRouter.push).toHaveBeenLastCalledWith('/medications/med-1/edit?from=reminder');
    mockRouter.push.mockClear();

    await fireEvent.press(screen.getByRole('checkbox', { name: '금요일' }));
    await fireEvent.press(screen.getByRole('button', { name: '먹이는 시각 바꾸기' }));
    expect(mockRouter.push).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('button', { name: '나가기' }));
    expect(mockRouter.push).toHaveBeenCalledWith('/medications/med-1/edit?from=reminder');
  });

  it('수정 화면에서 돌아와(재포커스) 최신 시각을 다시 읽는다', async () => {
    let times = ['08:00', '20:00'];
    setup({
      [GET]: () => json(200, reminderExample({ times })),
      'GET /api/pets/pet-1/medications': () => json(200, [{ ...MED, times }]),
    });
    await renderScreen(pushValue('registered'));
    await screen.findByText('오전 8:00 · 오후 8:00');
    times = ['09:30'];
    const { state } = require('../testing/mockRouter');
    await act(async () => {
      state.focusCb?.();
    });
    await screen.findByText('오전 9:30');
  });
});

// 실제 expo-router 는 router.* 를 큐에 쌓았다가 나중에 실행한다(beforeRemove 도 그때 불린다). 가드는 가짜가 아니라 진짜를 쓴다.
const flushQueue = () => act(async () => new Promise<void>((r) => setTimeout(r, 5)));

describe('알림 설정 — 이탈 가드와 큐에 쌓인 이동(실제 가드)', () => {
  it('고친 채 저장했는데 404(약이 사라짐)이면 확인 카드 없이 목록으로 간다', async () => {
    queueRouterActions();
    setup({ [GET]: () => json(200, reminderExample()), [PUT]: () => json(404, { code: 'NOT_FOUND', message: 'x' }) });
    await renderScreen(pushValue('registered'));
    await fireEvent.press(await screen.findByRole('checkbox', { name: '금요일' }));
    await fireEvent.press(saveButton());
    await flushQueue();
    expect(mockRouter.dismissTo).toHaveBeenCalledWith({ pathname: '/medications', params: { notice: 'gone' } });
    expect(queued.blocked).toEqual([]);
    expect(screen.queryByText('저장하지 않고 나갈까요?')).toBeNull();
  });

  it('[나가기]로 실행한 이동이 큐에서 다시 막혀 카드가 되돌아오지 않는다', async () => {
    queueRouterActions();
    setup({ [GET]: () => json(200, reminderExample()) });
    await renderScreen(pushValue('registered'));
    await fireEvent.press(await screen.findByRole('checkbox', { name: '금요일' }));
    await fireEvent.press(screen.getByRole('button', { name: '약 목록으로 돌아가기' }));
    await fireEvent.press(screen.getByRole('button', { name: '나가기' }));
    await flushQueue();
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
    expect(queued.blocked).toEqual([]);
    expect(screen.queryByText('저장하지 않고 나갈까요?')).toBeNull();
  });

  it('[먹이는 시각 바꾸기] 후 이 화면으로 돌아오면(focus) 가드가 다시 켜진다', async () => {
    queueRouterActions();
    setup({ [GET]: () => json(200, reminderExample()) });
    await renderScreen(pushValue('registered'));
    await fireEvent.press(await screen.findByRole('checkbox', { name: '금요일' }));
    await fireEvent.press(screen.getByRole('button', { name: '먹이는 시각 바꾸기' }));
    await fireEvent.press(screen.getByRole('button', { name: '나가기' }));
    await flushQueue();
    expect(queued.blocked).toEqual([]);
    await act(async () => {
      require('../testing/mockRouter').focusScreen();
    });
    expect(systemBack()).toBe(true); // 아직 고친 내용이 남아 있으면 다시 막는다
  });

  it('알림 탭(오늘로 dismissTo): 고친 내용이 있으면 확인 카드를 먼저 띄우고(의도), [나가기]하면 그 이동을 이어서 한다', async () => {
    queueRouterActions();
    setup({ [GET]: () => json(200, reminderExample()) });
    await renderScreen(pushValue('registered'));
    await fireEvent.press(await screen.findByRole('checkbox', { name: '금요일' }));
    await act(async () => {
      mockRouter.dismissTo('/?source=push&med=med-1&n=1' as never);
    });
    await flushQueue();
    await screen.findByText('저장하지 않고 나갈까요?');
    expect(queued.blocked).toEqual(['dismissTo']);
    await fireEvent.press(screen.getByRole('button', { name: '나가기' }));
    expect(mockNavigation.dispatch).toHaveBeenCalledWith({ type: 'dismissTo' });
  });

  it('알림 탭: 고친 내용이 없으면 카드 없이 바로 이동한다', async () => {
    queueRouterActions();
    setup({ [GET]: () => json(200, reminderExample()) });
    await renderScreen(pushValue('registered'));
    await screen.findByRole('switch', { name: '알림 받기' });
    await act(async () => {
      mockRouter.dismissTo('/?source=push&med=med-1&n=1' as never);
    });
    await flushQueue();
    expect(queued.blocked).toEqual([]);
    expect(screen.queryByText('저장하지 않고 나갈까요?')).toBeNull();
  });
});

describe('알림 설정 — 재포커스 로드와 편집 중인 폼', () => {
  const fridayChecked = () => screen.getByRole('checkbox', { name: '금요일' }).props.accessibilityState.checked;

  it('다시 읽는 응답이 늦게 와도 고치는 중인 폼을 덮어쓰지 않는다', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    let n = 0;
    setup({
      [GET]: async () => {
        if (++n === 1) return json(200, reminderExample());
        await gate;
        return json(200, reminderExample({ daysOfWeek: ['tue'] }));
      },
    });
    await renderScreen(pushValue('registered'));
    await screen.findByRole('switch', { name: '알림 받기' });
    await act(async () => {
      routerState.focusCb?.(); // 돌아옴 → 두 번째 읽기 시작(응답 대기)
    });
    await fireEvent.press(screen.getByRole('checkbox', { name: '금요일' }));
    expect(fridayChecked()).toBe(true);
    await act(async () => {
      release();
    });
    expect(fridayChecked()).toBe(true); // 응답(화요일만)이 버려졌다
    expect(screen.getByRole('checkbox', { name: '화요일' }).props.accessibilityState.checked).toBe(false);
    expect(screen.getByRole('checkbox', { name: '월요일' }).props.accessibilityState.checked).toBe(true);
  });

  it('고친 게 없으면 늦게 온 응답을 그대로 반영한다', async () => {
    let n = 0;
    setup({ [GET]: () => json(200, ++n === 1 ? reminderExample() : reminderExample({ daysOfWeek: ['tue'] })) });
    await renderScreen(pushValue('registered'));
    await screen.findByRole('switch', { name: '알림 받기' });
    await act(async () => {
      routerState.focusCb?.();
    });
    expect(screen.getByRole('checkbox', { name: '화요일' }).props.accessibilityState.checked).toBe(true);
  });

  it('두 번 읽을 때 먼저 시작한 응답이 나중에 와도 최신 응답이 남는다', async () => {
    const releases: (() => void)[] = [];
    let n = 0;
    setup({
      [GET]: async () => {
        const my = ++n;
        if (my === 1) return json(200, reminderExample());
        await new Promise<void>((r) => releases.push(r));
        return json(200, reminderExample({ daysOfWeek: my === 2 ? ['sat'] : ['tue'] }));
      },
    });
    await renderScreen(pushValue('registered'));
    await screen.findByRole('switch', { name: '알림 받기' });
    await act(async () => {
      routerState.focusCb?.(); // 2번째(오래된 것)
      routerState.focusCb?.(); // 3번째(최신)
    });
    await act(async () => {
      releases[1](); // 최신이 먼저 도착
      releases[0](); // 오래된 것이 나중에 도착
    });
    expect(screen.getByRole('checkbox', { name: '화요일' }).props.accessibilityState.checked).toBe(true);
    expect(screen.getByRole('checkbox', { name: '토요일' }).props.accessibilityState.checked).toBe(false);
  });
});

describe('알림 설정 — 큰 글씨 배치', () => {
  it('글자 배율 2 에서는 요일 격자가 2열, 저장 결과 안내가 스크롤 영역 위쪽(제목 아래)에 온다', async () => {
    setFontScale(2);
    setup({ [GET]: () => json(200, reminderExample()), [PUT]: () => json(200, reminderExample()) });
    await renderScreen(pushValue('registered'));
    await fireEvent.press(await screen.findByRole('checkbox', { name: '월요일' }));
    await fireEvent.press(screen.getByRole('checkbox', { name: '월요일' }));
    await fireEvent.press(saveButton());
    await screen.findByText(/^✓ 알림을 저장했어요/);
    const labels = screen.getAllByRole('checkbox').map((c) => c.props.accessibilityLabel);
    expect(labels).toEqual(['월요일', '화요일', '수요일', '목요일', '금요일', '토요일', '일요일']); // 읽는 순서는 월→일
  });

  it('간격 스테퍼도 큰 글씨에서 동작한다', async () => {
    setFontScale(2);
    setup({ [GET]: () => json(200, reminderExample({ repeat: 'interval', daysOfWeek: [], intervalDays: 5 })) });
    await renderScreen(pushValue('registered'));
    await fireEvent.press(await screen.findByRole('button', { name: '하루 늘리기' }));
    expect(screen.getByText('6일마다')).toBeTruthy();
  });
});
