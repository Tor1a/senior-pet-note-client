import { fireEvent, render, screen } from '@testing-library/react-native';
import { json, PET, todayExample } from '../testing/fixtures';
import { PetContext } from '../pet/PetProvider';
import { PushContext } from '../push/pushContext';
import TodayScreen from './TodayScreen';

// 반려동물 등록·수정 1단계: 오늘 화면의 안내 카드, [반려동물 정보] 진입점, 헤더 아바타
jest.mock('../services/client', () => require('../testing/mockClient'));
jest.mock('../services/preferences', () => ({ readPreferMl: async () => false, writePreferMl: async () => {} }));
let mockParams: Record<string, string> = {};
const mockPush = jest.fn();
const mockSetParams = jest.fn();
const mockRouterValue = { replace: jest.fn(), push: mockPush, setParams: mockSetParams };
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
  usePathname: () => '/',
  useRouter: () => mockRouterValue,
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

function setup(doses = todayExample().doses) {
  global.fetch = jest.fn(async (url: string) => {
    const path = String(url).replace('http://test', '');
    if (path.endsWith('/today')) return json(200, todayExample({ doses }));
    if (path === '/api/events') return json(202, null);
    return json(404, { code: 'NOT_FOUND', message: 'x' });
  }) as never;
}

async function renderToday() {
  await render(
    <PushContext.Provider value={push}>
      <PetContext.Provider value={{ status: 'ready', pet: PET, reload: jest.fn(), setPet: jest.fn() }}>
        <TodayScreen />
      </PetContext.Provider>
    </PushContext.Provider>,
  );
  await screen.findByText('10월 6일 (화)');
}

beforeEach(() => {
  mockParams = {};
  mockPush.mockClear();
  mockSetParams.mockClear();
});

describe('오늘 화면 — 반려동물 등록·수정', () => {
  it('맨 아래 [반려동물 정보]는 [약 관리 · 알림 설정] 아래, [계정] 위에 있고 /pet/edit?from=today 로 간다', async () => {
    setup();
    await renderToday();
    const labels = screen.getAllByRole('button').map((b) => b.props.accessibilityLabel);
    const i = labels.indexOf('반려동물 정보');
    expect(i).toBeGreaterThan(labels.indexOf('약 관리 · 알림 설정'));
    expect(i).toBeLessThan(labels.indexOf('계정'));
    await fireEvent.press(screen.getByRole('button', { name: '반려동물 정보' }));
    expect(mockPush).toHaveBeenCalledWith('/pet/edit?from=today');
  });

  it('헤더의 반려동물 줄은 누르는 요소가 아니다(이름 첫 글자 아바타 + 정보 문구)', async () => {
    setup();
    await renderToday();
    expect(screen.getByTestId('pet-avatar', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByText('보리 · 14살 · 신부전').props.onPress).toBeUndefined();
  });

  it('등록 직후(petCreated): "등록했어요" + 약 등록 안내, [약 등록하기]는 약 등록 화면으로, 파라미터는 지운다', async () => {
    mockParams = { notice: 'petCreated' };
    setup([]);
    await renderToday();
    expect(screen.getByText('✓ 보리를 등록했어요.')).toBeTruthy();
    expect(screen.getByText('먹이는 약이 있으면 등록해 두세요.')).toBeTruthy();
    expect(screen.getByText('오늘 화면에서 [먹였어요]로 체크할 수 있어요.')).toBeTruthy();
    expect(mockSetParams).toHaveBeenCalledWith({ notice: undefined });
    await fireEvent.press(screen.getAllByRole('button', { name: '약 등록하기' })[0]);
    expect(mockPush).toHaveBeenCalledWith('/medications/new');
  });

  it('[나중에 할게요]를 누르면 카드를 닫는다', async () => {
    mockParams = { notice: 'petCreated' };
    setup([]);
    await renderToday();
    await fireEvent.press(screen.getByRole('button', { name: '나중에 할게요' }));
    expect(screen.queryByText('✓ 보리를 등록했어요.')).toBeNull();
  });

  it('이미 약이 있어 보이면 첫 줄만 보인다', async () => {
    mockParams = { notice: 'petCreated' };
    setup();
    await renderToday();
    expect(screen.getByText('✓ 보리를 등록했어요.')).toBeTruthy();
    expect(screen.queryByText('먹이는 약이 있으면 등록해 두세요.')).toBeNull();
    expect(screen.queryByRole('button', { name: '나중에 할게요' })).toBeNull();
    expect(screen.getByRole('button', { name: '닫기' })).toBeTruthy();
  });

  it('수정 저장 뒤(petUpdated)에는 "보리 정보를 고쳤어요." 카드', async () => {
    mockParams = { notice: 'petUpdated' };
    setup();
    await renderToday();
    expect(screen.getByText('✓ 보리 정보를 고쳤어요.')).toBeTruthy();
    expect(screen.queryByText(/등록했어요/)).toBeNull();
  });

  it('수정 완료·이미 등록됨 안내에도 [닫기]가 있어 누르면 카드가 사라진다', async () => {
    mockParams = { notice: 'petUpdated' };
    setup();
    await renderToday();
    await fireEvent.press(screen.getByRole('button', { name: '닫기' }));
    expect(screen.queryByText('✓ 보리 정보를 고쳤어요.')).toBeNull();
  });

  it('409 로 돌아왔을 때(petLimit) 안내에도 [닫기]가 있다', async () => {
    mockParams = { notice: 'petLimit' };
    setup();
    await renderToday();
    await fireEvent.press(screen.getByRole('button', { name: '닫기' }));
    expect(screen.queryByText(/이미 등록된 반려동물이 있어요/)).toBeNull();
  });

  it('409 로 돌아왔을 때(petLimit) "이미 등록된 반려동물이 있어요…" 안내', async () => {
    mockParams = { notice: 'petLimit' };
    setup();
    await renderToday();
    expect(screen.getByText('이미 등록된 반려동물이 있어요. 등록된 정보로 오늘 화면을 열었어요.')).toBeTruthy();
  });

  it('다른 종류의 notice(약 관리 코드 등)는 건드리지 않고 지우지도 않는다', async () => {
    mockParams = { notice: 'created' };
    setup();
    await renderToday();
    expect(mockSetParams).not.toHaveBeenCalled();
  });
});
