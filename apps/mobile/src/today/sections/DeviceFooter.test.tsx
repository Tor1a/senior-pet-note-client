import { fireEvent, render, screen } from '@testing-library/react-native';
import { PushContext, type PushDeviceState } from '../../push/pushContext';
import { DeviceFooter } from './DeviceFooter';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('../../auth/AuthContext', () => ({ useAuth: () => ({ signOut: jest.fn() }) }));

function push(state: PushDeviceState, overrides: Partial<React.ContextType<typeof PushContext> & object> = {}) {
  return {
    state,
    requestPermission: jest.fn(async () => 'registered' as PushDeviceState),
    recheck: jest.fn(async () => state),
    bannerVisible: false,
    subscribe: () => () => {},
    ...overrides,
  };
}

async function renderFooter(state: PushDeviceState, onManage?: () => void, value = push(state)) {
  await render(
    <PushContext.Provider value={value}>
      <DeviceFooter onManage={onManage} />
    </PushContext.Provider>,
  );
  return value;
}

describe('오늘 화면 하단 — 알림 카드와 약 관리 진입', () => {
  it('기존 [알림 받기](권한 요청)는 그대로 있다', async () => {
    const value = await renderFooter('default');
    expect(screen.getByText('투약 알림 받기')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: '알림 받기' }));
    expect(value.requestPermission).toHaveBeenCalledTimes(1);
  });

  it('error 면 [다시 시도], denied 면 설정 안내 문구가 그대로다', async () => {
    const value = await renderFooter('error');
    await fireEvent.press(screen.getByRole('button', { name: '다시 시도' }));
    expect(value.recheck).toHaveBeenCalledTimes(1);
  });

  it('"알림 규칙은 웹에서 설정해요" 문구 대신 [약 관리 · 알림 설정] 버튼이 있다', async () => {
    const onManage = jest.fn();
    await renderFooter('registered', onManage);
    expect(screen.queryByText(/웹에서/)).toBeNull();
    expect(screen.getByText('이 휴대폰으로 투약 알림을 받아요.')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: '약 관리 · 알림 설정' }));
    expect(onManage).toHaveBeenCalledTimes(1);
  });

  it.each<PushDeviceState>(['unavailable', 'checking'])('카드가 숨는 상태(%s)에서도 약 관리 버튼은 보인다', async (state) => {
    await renderFooter(state, jest.fn());
    expect(screen.queryByText('투약 알림 받기')).toBeNull();
    expect(screen.getByRole('button', { name: '약 관리 · 알림 설정' })).toBeTruthy();
  });

  it('onManage 가 없으면(반려동물 없음 안내 화면) 약 관리 버튼이 없다', async () => {
    await renderFooter('default');
    expect(screen.queryByRole('button', { name: '약 관리 · 알림 설정' })).toBeNull();
    expect(screen.getByRole('button', { name: '로그아웃' })).toBeTruthy();
  });

  it('[계정]은 항상 보이고 누르면 /account 로 간다(반려동물 없음 안내 화면 포함)', async () => {
    mockPush.mockClear();
    await renderFooter('default');
    await fireEvent.press(screen.getByRole('button', { name: '계정' }));
    expect(mockPush).toHaveBeenCalledWith('/account');
  });

  it.each<PushDeviceState>(['unavailable', 'checking'])('카드가 숨는 상태(%s)에서도 [계정] 버튼은 보인다', async (state) => {
    await renderFooter(state);
    expect(screen.getByRole('button', { name: '계정' })).toBeTruthy();
  });

  it('버튼 순서: 약 관리 → 계정 → 로그아웃', async () => {
    await renderFooter('registered', jest.fn());
    const names = screen.getAllByRole('button').map((b) => b.props.accessibilityLabel);
    expect(names).toEqual(['약 관리 · 알림 설정', '계정', '로그아웃']);
  });
});

describe('반려동물 정보 진입과 compact(시작 화면)', () => {
  async function renderWith(props: React.ComponentProps<typeof DeviceFooter>, state: PushDeviceState = 'default') {
    await render(
      <PushContext.Provider value={push(state)}>
        <DeviceFooter {...props} />
      </PushContext.Provider>,
    );
  }

  it('onEditPet 이 있으면 [반려동물 정보]가 [약 관리 · 알림 설정] 아래, [계정] 위에 있고 누르면 onEditPet', async () => {
    const onEditPet = jest.fn();
    await renderWith({ onManage: jest.fn(), onEditPet }, 'registered');
    const names = screen.getAllByRole('button').map((b) => b.props.accessibilityLabel);
    expect(names).toEqual(['약 관리 · 알림 설정', '반려동물 정보', '계정', '로그아웃']);
    await fireEvent.press(screen.getByRole('button', { name: '반려동물 정보' }));
    expect(onEditPet).toHaveBeenCalledTimes(1);
  });

  it('onEditPet 이 없으면 [반려동물 정보]가 없다', async () => {
    await renderWith({ onManage: jest.fn() }, 'registered');
    expect(screen.queryByRole('button', { name: '반려동물 정보' })).toBeNull();
  });

  it('compact 는 알림 받기 카드만 숨기고 [계정]·로그아웃은 남긴다', async () => {
    await renderWith({ compact: true });
    expect(screen.queryByText('투약 알림 받기')).toBeNull();
    expect(screen.queryByRole('button', { name: '알림 받기' })).toBeNull();
    expect(screen.getByRole('button', { name: '계정' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '로그아웃' })).toBeTruthy();
  });
});
