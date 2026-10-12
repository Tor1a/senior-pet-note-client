// QA 추가: 알림으로 열린 오늘 화면의 큰 [먹였어요] 경계 시나리오(모바일). 헬퍼는 TodayScreen.undo.qa.test.tsx 와 같다.
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { json, PET, todayExample } from '../testing/fixtures';
import { setFontScale } from '../testing/fontScale';
import { PetContext } from '../pet/PetProvider';
import { PushContext, type PushBannerMessage } from '../push/pushContext';
import TodayScreen from './TodayScreen';

jest.mock('../services/client', () => require('../testing/mockClient'));
jest.mock('../services/preferences', () => ({ readPreferMl: async () => false, writePreferMl: async () => {} }));
let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
  usePathname: () => '/',
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
  useFocusEffect: (cb: () => void) => {
    require('react').useEffect(() => cb(), [cb]);
  },
}));
jest.mock('../auth/AuthContext', () => ({ useAuth: () => ({ signOut: jest.fn() }) }));

type Req = { url: string; method: string; body: any };
let calls: Req[] = [];
let handler: (r: Req) => Response | Promise<Response | undefined> | undefined;
let todayFn: () => ReturnType<typeof todayExample>;

function setup(h: typeof handler = () => undefined, today: typeof todayFn = () => todayExample()) {
  handler = h;
  todayFn = today;
  global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
    const req = { url: String(url).replace('http://test', ''), method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : undefined };
    calls.push(req);
    const custom = await handler(req);
    if (custom) return custom;
    if (req.url.endsWith('/today')) return json(200, todayFn());
    if (req.url === '/api/events') return json(202, null);
    return json(404, { code: 'NOT_FOUND', message: 'x' });
  }) as never;
}
const push = {
  state: 'unavailable' as const,
  requestPermission: async () => 'unavailable' as const,
  recheck: async () => 'unavailable' as const,
  bannerVisible: false,
  subscribe: (_l: (m: PushBannerMessage) => void) => () => {},
};
async function renderToday() {
  await render(
    <PushContext.Provider value={push}>
      <PetContext.Provider value={{ status: 'ready', pet: PET, reload: jest.fn(), setPet: jest.fn() }}>
        <TodayScreen />
      </PetContext.Provider>
    </PushContext.Provider>,
  );
}
const dose = (medicationId: string, name: string, scheduledTime: string, taken = false) => ({
  medicationId, name, doseText: '1정', scheduledTime, taken, medLogId: taken ? `log-${medicationId}-${scheduledTime}` : null, takenAt: taken ? '2026-10-06T00:05:00Z' : null,
});
const bigButtons = () => screen.queryAllByRole('button', { name: /먹였어요 체크$/ });

beforeEach(() => {
  calls = [];
  mockParams = { source: 'push', med: 'med-a', t: '20:00', d: '2026-10-06', n: '1' };
  setFontScale(1);
});
afterAll(() => setFontScale(2));

describe('QA: 모바일 큰 [먹였어요]', () => {
  for (const scale of [1, 1.3, 2, 3]) {
    it(`글자 배율 ${scale}: 큰 버튼이 있고 라벨에 약 이름·시각이 든다`, async () => {
      setFontScale(scale);
      setup();
      await renderToday();
      expect(await screen.findByRole('button', { name: '아조딜 1캡슐 오후 8:00 먹였어요 체크' })).toBeTruthy();
      expect(bigButtons()).toHaveLength(1);
    });
  }

  it('약 여러 개: 알림을 누른 약 한 곳에만 큰 버튼, 누르면 그 약만 POST', async () => {
    mockParams = { source: 'push', med: 'm3', t: '08:00', d: '2026-10-06', n: '1' };
    setup(
      (r) => (r.method === 'POST' && r.url === '/api/med-logs'
        ? json(201, { id: 'l9', medicationId: 'm3', recordDate: '2026-10-06', scheduledTime: '08:00', takenAt: '2026-10-06T00:05:00Z' })
        : undefined),
      () => todayExample({ doses: [dose('m1', '아조딜', '08:00'), dose('m2', '레나메진', '08:00'), dose('m3', '프로넥스', '08:00')] }),
    );
    await renderToday();
    await screen.findByRole('button', { name: /프로넥스.*먹였어요 체크$/ });
    expect(bigButtons()).toHaveLength(1);
    await fireEvent.press(bigButtons()[0]);
    await waitFor(() => expect(calls.filter((c) => c.method === 'POST' && c.url === '/api/med-logs')).toHaveLength(1));
    expect(calls.find((c) => c.url === '/api/med-logs')?.body).toEqual({ medicationId: 'm3', scheduledTime: '08:00' });
  });

  it('이미 체크된 회차(409 ALREADY_CHECKED)면 체크 상태로 정리되고 큰 버튼이 사라진다', async () => {
    mockParams = { source: 'push', med: 'med-a', t: '08:00', d: '2026-10-06', n: '1' };
    let checked = false;
    setup(
      (r) => {
        if (r.method === 'POST' && r.url === '/api/med-logs') {
          checked = true;
          return json(409, { code: 'ALREADY_CHECKED', message: 'x' });
        }
        return undefined;
      },
      () => todayExample({ doses: [dose('med-a', '아조딜', '08:00', checked)] }),
    );
    await renderToday();
    await fireEvent.press(await screen.findByRole('button', { name: /아조딜.*먹였어요 체크$/ }));
    await waitFor(() => expect(bigButtons()).toHaveLength(0));
  });

  it('체크 요청이 500 이면 롤백되어 큰 버튼이 다시 보인다', async () => {
    mockParams = { source: 'push', med: 'med-a', t: '08:00', d: '2026-10-06', n: '1' };
    setup((r) => (r.method === 'POST' && r.url === '/api/med-logs' ? json(500, { code: 'INTERNAL', message: 'x' }) : undefined),
      () => todayExample({ doses: [dose('med-a', '아조딜', '08:00')] }));
    await renderToday();
    await fireEvent.press(await screen.findByRole('button', { name: /아조딜.*먹였어요 체크$/ }));
    await waitFor(() => expect(calls.some((c) => c.method === 'POST')).toBe(true));
    await waitFor(() => expect(bigButtons()).toHaveLength(1));
  });

  // QA 보고 결함 수정(웹과 같음): 아침 회차를 체크하면 큰 버튼이 같은 약의 저녁 회차로 옮겨 가던 문제.
  // 이제 처음 정한 회차(약·시각이 모두 맞는 회차)에 고정하고, 체크하면 해제한다.
  it('같은 약의 다른 회차: 한 회차를 체크해도 큰 버튼이 같은 약의 다음 회차로 옮겨 가지 않는다', async () => {
    mockParams = { source: 'push', med: 'med-a', t: '08:00', d: '2026-10-06', n: '1' };
    setup(
      (r) => (r.method === 'POST' && r.url === '/api/med-logs'
        ? json(201, { id: 'l9', medicationId: 'med-a', recordDate: '2026-10-06', scheduledTime: '08:00', takenAt: '2026-10-06T00:05:00Z' })
        : undefined),
      () => todayExample({ doses: [dose('med-a', '아조딜', '08:00'), dose('med-a', '아조딜', '20:00')] }),
    );
    await renderToday();
    await fireEvent.press(await screen.findByRole('button', { name: /오전 8:00 먹였어요 체크$/ }));
    await waitFor(() => expect(bigButtons()).toHaveLength(0));
    expect(screen.queryByRole('button', { name: /오후 8:00 먹였어요 체크$/ })).toBeNull();
    expect(screen.queryByText('방금 알림 온 약')).toBeNull();
  });
});
