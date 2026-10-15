import { fireEvent, render, screen } from '@testing-library/react-native';
import { daysFixture, historyFixture } from '../lib/historyFixtures';
import { json, PET, todayExample } from '../testing/fixtures';
import { setFontScale } from '../testing/fontScale';
import { PetContext } from '../pet/PetProvider';
import { PushContext } from '../push/pushContext';
import TodayScreen from './TodayScreen';

// 최근 7일 돌아보기 카드: 삽입 조건, 펼칠 때만 요청, 지난 기록 이동, 404
jest.mock('../services/client', () => require('../testing/mockClient'));
jest.mock('../services/preferences', () => ({ readPreferMl: async () => false, writePreferMl: async () => {} }));
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({}),
  usePathname: () => '/',
  useRouter: () => ({ replace: jest.fn(), push: (...a: unknown[]) => mockPush(...a), setParams: jest.fn() }),
  useFocusEffect: (cb: () => void) => {
    require('react').useEffect(() => cb(), [cb]);
  },
}));
jest.mock('../auth/AuthContext', () => ({ useAuth: () => ({ signOut: jest.fn() }) }));

const push = {
  state: 'unavailable' as const,
  requestPermission: async () => 'unavailable' as const,
  recheck: async () => 'unavailable' as const,
  bannerVisible: false,
  subscribe: () => () => {},
};

const EMPTY_SUGGESTIONS = { foodLevel: null, waterLevel: null, waterMl: null, weightKg: null };
let historyCalls: number;
let historyStatus: number;
const reloadPet = jest.fn();

function setup(first: boolean) {
  historyCalls = 0;
  global.fetch = jest.fn(async (url: string) => {
    const path = String(url).replace('http://test', '');
    if (path.endsWith('/today')) {
      return json(200, first ? todayExample({ doses: [], suggestions: EMPTY_SUGGESTIONS, lastWeight: null }) : todayExample());
    }
    if (path.includes('/daily-logs')) {
      historyCalls += 1;
      if (historyStatus === 404) return json(404, { code: 'NOT_FOUND', message: 'x' });
      return json(200, historyFixture(daysFixture('2026-10-06', 30, { '2026-10-06': { weightKg: 4.4 } })));
    }
    if (path === '/api/events') return json(202, null);
    return json(404, { code: 'NOT_FOUND', message: 'x' });
  }) as never;
}

const tree = (pet = PET) => (
  <PushContext.Provider value={push}>
    <PetContext.Provider value={{ status: 'ready', pet, reload: reloadPet, setPet: jest.fn() }}>
      <TodayScreen />
    </PetContext.Provider>
  </PushContext.Provider>
);

async function renderToday() {
  const view = await render(tree());
  await screen.findByText('10월 6일 (화)');
  return view;
}

beforeEach(() => {
  historyStatus = 200;
  mockPush.mockClear();
  reloadPet.mockClear();
  setFontScale(1);
});
afterAll(() => setFontScale(2));

describe('오늘 화면 — 최근 7일 돌아보기', () => {
  it('첫 사용 중에는 카드가 없다', async () => {
    setup(true);
    await renderToday();
    expect(screen.queryByRole('button', { name: '최근 7일 돌아보기' })).toBeNull();
    expect(historyCalls).toBe(0);
  });

  it('평소에는 접힌 카드가 있고 요청이 없다, 펼치면 1회 요청', async () => {
    setup(false);
    await renderToday();
    const toggle = await screen.findByRole('button', { name: '최근 7일 돌아보기' });
    expect(historyCalls).toBe(0);
    await fireEvent.press(toggle);
    expect(await screen.findByText('기록한 날 1일 / 7일')).toBeTruthy();
    expect(historyCalls).toBe(1);
  });

  it('지난 기록 보기 버튼은 기존 이동 방식(router.push)을 쓴다', async () => {
    setup(false);
    await renderToday();
    await fireEvent.press(await screen.findByRole('button', { name: '최근 7일 돌아보기' }));
    await screen.findByText('기록한 날 1일 / 7일');
    mockPush.mockClear();
    const links = screen.getAllByRole('button', { name: '지난 기록 보기' });
    await fireEvent.press(links[0]);
    expect(mockPush).toHaveBeenCalledTimes(1);
  });

  it('404 면 카드를 접고 반려동물을 다시 불러온다', async () => {
    historyStatus = 404;
    setup(false);
    await renderToday();
    await fireEvent.press(await screen.findByRole('button', { name: '최근 7일 돌아보기' }));
    await screen.findByText('펼치기');
    expect(reloadPet).toHaveBeenCalled();
  });

  it('반려동물이 바뀌면 열린 상태와 결과가 초기화된다(key=pet.id)', async () => {
    setup(false);
    const view = await renderToday();
    await fireEvent.press(await screen.findByRole('button', { name: '최근 7일 돌아보기' }));
    await screen.findByText('기록한 날 1일 / 7일');
    await view.rerender(tree({ ...PET, id: 'pet-2' }));
    expect(await screen.findByText('펼치기')).toBeTruthy();
    expect(screen.queryByText('기록한 날 1일 / 7일')).toBeNull();
  });
});
