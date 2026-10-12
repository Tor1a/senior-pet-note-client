// QA 보강: 큰 글씨 배율 경계, 저장 중 되돌리기 가드. 헬퍼는 TodayScreen.undo.test.tsx 와 같다.
// (원본 설명) 저장 되돌리기·실수 방지(U1~U3) 화면 테스트: 일일 기록 저장 되돌리기, 체중 숫자 확인, 투약 [다시 체크], 큰 글씨 배치
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import { AccessibilityInfo, StyleSheet } from 'react-native';
import { json, PET, todayExample } from '../testing/fixtures';
import { setFontScale } from '../testing/fontScale';
import { PetContext } from '../pet/PetProvider';
import { PushContext, type PushBannerMessage } from '../push/pushContext';
import TodayScreen from './TodayScreen';

jest.mock('../services/client', () => require('../testing/mockClient'));
jest.mock('../services/preferences', () => ({ readPreferMl: async () => false, writePreferMl: async () => {} }));
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({}),
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
      <PetContext.Provider value={{ status: 'ready', pet: PET, reload: jest.fn() }}>
        <TodayScreen />
      </PetContext.Provider>
    </PushContext.Provider>,
  );
  await screen.findByText('오늘 먹일 약 1 / 2');
}
const log = (b: Record<string, unknown> = {}) => ({
  id: 'l', petId: 'pet-1', recordDate: '2026-10-06', foodLevel: 2, waterLevel: 2, waterMl: null, weightKg: null,
  symptoms: [], symptomsNone: true, symptomOther: null, memo: '', updatedAt: '2026-10-06T01:00:00Z', ...b,
});
const withLog = (l: ReturnType<typeof log> | null) => () => todayExample({ dailyLog: l as never });
const PUT_URL = '/api/pets/pet-1/daily-logs/2026-10-06';
const press = (name: string | RegExp) => fireEvent.press(screen.getByRole('button', { name }));
/** 하단 저장 막대(윗선이 있는 칸) */
const saveBarNode = () => {
  for (let n: any = saveBtn(); n; n = n.parent) {
    if (StyleSheet.flatten(n.props?.style)?.borderTopWidth === 1) return n;
  }
  throw new Error('저장 막대를 찾지 못했어요');
};
const saveBtn = () => screen.getByRole('button', { name: /^(첫 기록 저장|오늘 기록 저장|기록 수정하기)$/ });

beforeEach(() => {
  calls = [];
  setFontScale(1);
});
afterAll(() => setFontScale(2));


describe('QA: 큰 글씨 배율 경계', () => {
  for (const [scale, inScroll] of [[1.0, false], [1.29, false], [1.3, true], [2.0, true]] as const) {
    it(`배율 ${scale}: 되돌리기 안내는 ${inScroll ? '스크롤 맨 위(저장 막대에는 버튼만)' : '저장 막대 안'}`, async () => {
      setFontScale(scale);
      setup((r) => (r.method === 'PUT' ? json(200, log()) : undefined));
      await renderToday();
      await fireEvent.press(saveBtn());
      await screen.findByText(/오늘 기록을 남겼어요/);
      const inBar = within(saveBarNode()).queryByRole('button', { name: '저장 되돌리기' }) !== null;
      expect(inBar).toBe(!inScroll);
      expect(screen.getByRole('button', { name: '저장 되돌리기' })).toBeTruthy(); // 어느 배율에서도 버튼에 닿는다
    });
  }
});

describe('QA: 저장·되돌리기 동시 가드', () => {
  it('되돌리는 중에는 저장 버튼을 눌러도 PUT 이 나가지 않는다', async () => {
    const SAVED = log({ updatedAt: '2026-10-06T02:00:00Z' });
    let server: ReturnType<typeof log> | null = null; // 가짜 서버의 현재 기록
    let hold = false;
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => { release = r; });
    setup(
      async (r) => {
        if (r.method === 'PUT') { server = SAVED; return json(200, SAVED); }
        if (r.method === 'DELETE') { server = null; return json(204, null); }
        if (r.method === 'GET' && r.url.endsWith('/today') && hold) await gate;
        return undefined;
      },
      () => todayExample({ dailyLog: server as never }),
    );
    await renderToday();
    await fireEvent.press(saveBtn());
    const undoBtn = await screen.findByRole('button', { name: '저장 되돌리기' });
    hold = true;
    await fireEvent.press(undoBtn);
    await screen.findByText('되돌리는 중…');
    const puts = calls.filter((c) => c.method === 'PUT').length;
    await fireEvent.press(saveBtn());
    expect(calls.filter((c) => c.method === 'PUT').length).toBe(puts);
    hold = false;
    await act(async () => {
      release();
    });
    await screen.findByText(/저장하기 전 상태로 되돌렸어요/);
  });

  // 웹과 같은 빈틈이 모바일에도 있는지: 다시 저장하는 중에 이전 저장의 [저장 되돌리기]를 누른다.
  it('다시 저장하는 중에는 이전 저장의 [저장 되돌리기]가 동작하지 않아야 한다', async () => {
    let puts = 0;
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => { release = r; });
    setup(
      async (r) => {
        if (r.method === 'PUT') {
          puts += 1;
          if (puts === 1) return json(200, log({ updatedAt: '2026-10-06T02:00:00Z' }));
          await gate;
          return json(200, log({ updatedAt: '2026-10-06T02:00:05Z' }));
        }
        if (r.method === 'DELETE') return json(204, null);
        return undefined;
      },
      () => todayExample({ dailyLog: (puts === 0 ? null : log({ updatedAt: '2026-10-06T02:00:00Z' })) as never }),
    );
    await renderToday();
    await fireEvent.press(saveBtn());
    const undoBtn = await screen.findByRole('button', { name: '저장 되돌리기' });
    await fireEvent.press(saveBtn()); // 입력을 바꾸지 않고 다시 저장
    await waitFor(() => expect(puts).toBe(2));
    expect(screen.getByText('저장하는 중에는 되돌릴 수 없어요.')).toBeTruthy();
    expect(screen.getByRole('button', { name: '저장 되돌리기' }).props.accessibilityState?.disabled ?? screen.getByRole('button', { name: '저장 되돌리기' }).props['aria-disabled']).toBeTruthy();
    await fireEvent.press(undoBtn);
    await act(async () => {
      release();
    });
    await new Promise((r) => setTimeout(r, 150));
    expect(calls.filter((c) => c.method === 'PUT')).toHaveLength(2);
    expect(calls.some((c) => c.method === 'DELETE')).toBe(false);
  });
});
