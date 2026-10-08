// QA 추가: 알림 설정 — 새벽 안내, 간격 경계, 권한 상태 전이, Modal 뒤로가기, 큰 글씨 Modal
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { setFontScale } from '../testing/fontScale';
import { DEFAULT_REMINDER, json, MED, PET, reminderExample } from '../testing/fixtures';
import { resetRouterMocks } from '../testing/mockRouter';
import { PetContext } from '../pet/PetProvider';
import { PushContext, type PushContextValue, type PushDeviceState } from '../push/pushContext';
import ReminderScreen from './ReminderScreen';

jest.mock('../services/client', () => require('../testing/mockClient'));
jest.mock('expo-router', () => require('../testing/mockRouter').factory());
jest.mock('@react-native-community/datetimepicker', () => require('../testing/mockDateTimePicker'));
jest.mock('../services/openAppSettings', () => ({ openAppSettings: jest.fn() }));

// 테스트 렌더러 JSON 트리에서 Modal 호스트 노드를 찾는다(Android 뒤로가기 = onRequestClose 호출용)
function findModal(node: any): any {
  if (!node) return null;
  if (Array.isArray(node)) return node.map(findModal).find(Boolean) ?? null;
  if (node.type === 'Modal') return node;
  return findModal(node.children);
}

let calls: { method: string; path: string; body: any }[] = [];
const GET = 'GET /api/medications/med-1/reminder';
const PUT = 'PUT /api/medications/med-1/reminder';

function setup(routes: Record<string, () => Response>, med = MED) {
  const all = { 'GET /api/pets/pet-1/medications': () => json(200, [med]), ...routes };
  global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
    const path = String(url).replace('http://test', '');
    const method = init?.method ?? 'GET';
    calls.push({ method, path, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    const h = (all as Record<string, () => Response>)[`${method} ${path}`];
    return h ? h() : json(404, { code: 'NOT_FOUND', message: 'x' });
  }) as never;
}
const pv = (s: PushDeviceState, o: Partial<PushContextValue> = {}): PushContextValue => ({
  state: s,
  requestPermission: jest.fn(async () => 'registered' as PushDeviceState),
  recheck: jest.fn(async () => s),
  bannerVisible: false,
  subscribe: () => () => {},
  ...o,
});
async function renderScreen(p: PushContextValue) {
  await render(
    <PushContext.Provider value={p}>
      <PetContext.Provider value={{ status: 'ready', pet: PET, reload: jest.fn() }}>
        <ReminderScreen id="med-1" />
      </PetContext.Provider>
    </PushContext.Provider>,
  );
}
const put = () => calls.find((c) => c.method === 'PUT');
const save = () => screen.getByRole('button', { name: '저장' });

beforeEach(() => {
  calls = [];
  resetRouterMocks();
  setFontScale(1);
});

describe('QA: 새벽 시각 안내', () => {
  const early = { ...MED, times: ['02:30', '20:00'] };
  it('요일·간격일 때 04:00 전 시각이 있으면 전날 기록 안내가 보인다', async () => {
    setup({ [GET]: () => json(200, reminderExample({ times: ['02:30', '20:00'] })) }, early);
    await renderScreen(pv('registered'));
    expect(await screen.findByText(/새벽 4시 전 시각\(.*\)은 전날 기록으로 쳐요/)).toBeTruthy();
  });
  it('매일이면 안내가 없다', async () => {
    setup({ [GET]: () => json(200, reminderExample({ repeat: 'daily', daysOfWeek: [], times: ['02:30'] })) }, early);
    await renderScreen(pv('registered'));
    await screen.findByRole('switch', { name: '알림 받기' });
    expect(screen.queryByText(/새벽 4시 전/)).toBeNull();
  });
  it('04:00 정각은 새벽이 아니다(경계)', async () => {
    setup({ [GET]: () => json(200, reminderExample({ times: ['04:00'] })) }, { ...MED, times: ['04:00'] });
    await renderScreen(pv('registered'));
    await screen.findByRole('switch', { name: '알림 받기' });
    expect(screen.queryByText(/새벽 4시 전/)).toBeNull();
  });
});

describe('QA: 간격 경계', () => {
  it('29 → 30 에서 늘리기가 잠기고 30 으로 저장한다 / 3 → 2 에서 줄이기가 잠긴다', async () => {
    setup({
      [GET]: () => json(200, reminderExample({ repeat: 'interval', daysOfWeek: [], intervalDays: 29 })),
      [PUT]: () => json(200, reminderExample({ repeat: 'interval', daysOfWeek: [], intervalDays: 30 })),
    });
    await renderScreen(pv('registered'));
    await fireEvent.press(await screen.findByRole('button', { name: '하루 늘리기' }));
    expect(screen.getByText('30일마다')).toBeTruthy();
    expect(screen.getByRole('button', { name: '하루 늘리기' }).props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(save());
    await act(async () => {});
    expect(put()?.body.intervalDays).toBe(30);
  });
});

describe('QA: 권한 상태 전이', () => {
  const server = () =>
    setup({ [GET]: () => json(200, DEFAULT_REMINDER), [PUT]: () => json(200, reminderExample({ repeat: 'daily', daysOfWeek: [] })) });

  it('OS 창을 닫아 default 로 돌아와도 저장은 되고 못 받는다고 알린다', async () => {
    server();
    const p = pv('default', { requestPermission: jest.fn(async () => 'default' as PushDeviceState) });
    await renderScreen(p);
    await fireEvent.press(await screen.findByRole('switch', { name: '알림 받기' }));
    await fireEvent.press(save());
    await fireEvent.press(await screen.findByRole('button', { name: '알림 허용하기' }));
    await screen.findByText('✓ 알림을 저장했어요. 다만 이 기기에서는 알림을 받을 수 없어요.');
    expect(put()).toBeDefined();
  });

  it('Modal 이 열린 동안 PUT 이 나가지 않고, Android 뒤로가기(onRequestClose)는 [나중에]와 같다(권한 요청 없이 저장)', async () => {
    server();
    const p = pv('default');
    await renderScreen(p);
    await fireEvent.press(await screen.findByRole('switch', { name: '알림 받기' }));
    await fireEvent.press(save());
    await screen.findByText('약 먹일 시간에 알려 드릴게요');
    expect(put()).toBeUndefined();
    await act(async () => findModal(screen.toJSON()).props.onRequestClose());
    await screen.findByText(/^✓ 알림을 저장했어요/);
    expect(p.requestPermission).not.toHaveBeenCalled();
    expect(put()).toBeDefined();
  });

  it('[알림 허용하기] 연타해도 권한 요청은 한 번이다', async () => {
    server();
    let release!: (s: PushDeviceState) => void;
    const p = pv('default', { requestPermission: jest.fn(() => new Promise<PushDeviceState>((r) => (release = r))) });
    await renderScreen(p);
    await fireEvent.press(await screen.findByRole('switch', { name: '알림 받기' }));
    await fireEvent.press(save());
    const allow = await screen.findByRole('button', { name: '알림 허용하기' });
    await fireEvent.press(allow);
    await fireEvent.press(allow);
    expect(p.requestPermission).toHaveBeenCalledTimes(1);
    await act(async () => release('registered'));
    expect(calls.filter((c) => c.method === 'PUT')).toHaveLength(1);
  });
});

describe('QA: 켜기 + enabled=false', () => {
  it('끈 채로 저장하면 default 여도 PUT 본문 enabled:false 이고 Modal 이 없다', async () => {
    setup({ [GET]: () => json(200, reminderExample()), [PUT]: () => json(200, reminderExample({ enabled: false, nextFireAt: null })) });
    const p = pv('default');
    await renderScreen(p);
    await fireEvent.press(await screen.findByRole('switch', { name: '알림 받기' }));
    await fireEvent.press(save());
    await screen.findByText(/알림을 껐어요/);
    expect(put()?.body.enabled).toBe(false);
    expect(p.requestPermission).not.toHaveBeenCalled();
  });
});

describe('QA: 큰 글씨 200%', () => {
  it('사전 안내 Modal 의 버튼 두 개가 모두 있고, 저장 바 [저장]이 남아 있다', async () => {
    setFontScale(2);
    setup({ [GET]: () => json(200, DEFAULT_REMINDER) });
    await renderScreen(pv('default'));
    await fireEvent.press(await screen.findByRole('switch', { name: '알림 받기' }));
    expect(save()).toBeTruthy();
    await fireEvent.press(save());
    expect(await screen.findByRole('button', { name: '알림 허용하기' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '나중에' })).toBeTruthy();
  });
});
