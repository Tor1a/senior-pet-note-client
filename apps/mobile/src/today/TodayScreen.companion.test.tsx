import { act, render, screen } from '@testing-library/react-native';
import { json, PET, todayExample } from '../testing/fixtures';
import { PetContext } from '../pet/PetProvider';
import { PushContext } from '../push/pushContext';
import TodayScreen from './TodayScreen';
import type { Pet } from '../lib/petApi';

// 온보딩 E단계: 오늘 화면 헤더의 함께한 날 · 기록 N일째
jest.mock('../services/client', () => require('../testing/mockClient'));
jest.mock('../services/preferences', () => ({ readPreferMl: async () => false, writePreferMl: async () => {} }));
let focusCb: (() => void) | null = null;
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({}),
  usePathname: () => '/',
  useRouter: () => ({ replace: jest.fn(), push: jest.fn(), setParams: jest.fn() }),
  useFocusEffect: (cb: () => void) => {
    focusCb = cb;
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

let companionBody: unknown;
let todayCalls = 0;
function setup() {
  todayCalls = 0;
  global.fetch = jest.fn(async (url: string) => {
    const path = String(url).replace('http://test', '');
    if (path.endsWith('/today')) {
      todayCalls += 1;
      return json(200, { ...todayExample(), companion: companionBody });
    }
    if (path === '/api/events') return json(202, null);
    return json(404, { code: 'NOT_FOUND', message: 'x' });
  }) as never;
}

function ui(pet: Pet) {
  return (
    <PushContext.Provider value={push}>
      <PetContext.Provider value={{ status: 'ready', pet, reload: jest.fn(), setPet: jest.fn() }}>
        <TodayScreen />
      </PetContext.Provider>
    </PushContext.Provider>
  );
}

async function renderToday(pet: Pet) {
  const r = await render(ui(pet));
  await screen.findByText('10월 6일 (화)');
  return r;
}

const FIRST: Pet = { ...PET, profileType: 'first_time' };

beforeEach(() => {
  focusCb = null;
  companionBody = { togetherDays: 120, recordingDays: 45 };
});

describe('오늘 화면 — 함께한 날 줄', () => {
  it('first_time + companion: 헤더에 두 줄, 한 묶음 라벨', async () => {
    setup();
    await renderToday(FIRST);
    expect(await screen.findByLabelText('보리와 함께한 지 120일째, 기록을 시작한 지 45일째')).toBeTruthy();
  });

  it('로딩 중에는 줄이 없다(임시 숫자 없음)', async () => {
    global.fetch = jest.fn(() => new Promise(() => {})) as never;
    await render(ui(FIRST));
    expect(screen.getByText('불러오는 중…')).toBeTruthy();
    expect(screen.queryByText(/일째/)).toBeNull();
  });

  it('오류로 불러오지 못하면 줄이 없다', async () => {
    global.fetch = jest.fn(async () => json(500, { code: 'INTERNAL', message: 'x' })) as never;
    await render(ui(FIRST));
    await screen.findByText('다시 불러오기');
    expect(screen.queryByText(/일째/)).toBeNull();
  });

  it.each([['senior'], [null], [undefined]])('profileType=%s 이면 companion 이 와도 줄이 없다', async (t) => {
    setup();
    await renderToday({ ...PET, profileType: t as never });
    expect(screen.queryByText(/일째/)).toBeNull();
    expect(screen.queryByLabelText(/일째/)).toBeNull();
  });

  it('companion null(시니어 서버 응답)·필드 없음이면 줄이 없다', async () => {
    companionBody = null;
    setup();
    await renderToday(FIRST);
    expect(screen.queryByText(/일째/)).toBeNull();
    companionBody = undefined;
    setup();
    await renderToday(FIRST);
    expect(screen.queryByText(/일째/)).toBeNull();
  });

  it('다른 화면에서 돌아오면(포커스) 오늘 응답을 다시 읽어 줄이 바뀐다(유형 변경 반영)', async () => {
    companionBody = null;
    setup();
    const view = await renderToday({ ...PET, profileType: 'senior' });
    expect(screen.queryByText(/일째/)).toBeNull();
    const before = todayCalls;
    // 수정 화면에서 first_time 으로 저장 → 오늘 화면으로 돌아옴: 반려동물 상태 갱신 + 포커스
    companionBody = { togetherDays: null, recordingDays: 2 };
    await view.rerender(ui(FIRST));
    await act(async () => {
      focusCb?.();
    });
    expect(todayCalls).toBeGreaterThan(before);
    expect(await screen.findByLabelText('기록을 시작한 지 2일째')).toBeTruthy();
  });
});
