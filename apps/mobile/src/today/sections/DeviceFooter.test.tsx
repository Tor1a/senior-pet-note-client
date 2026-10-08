import { fireEvent, render, screen } from '@testing-library/react-native';
import { PushContext, type PushDeviceState } from '../../push/pushContext';
import { DeviceFooter } from './DeviceFooter';

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
});
