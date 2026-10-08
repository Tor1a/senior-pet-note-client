import { act, render, screen } from '@testing-library/react-native';
import { AppState, Text } from 'react-native';
import { push } from '../services/push';
import { PushProvider } from './PushProvider';
import { usePush } from './pushContext';

// 휴대폰 설정에서 알림을 허용하고 돌아왔을 때의 재확인(AppState active)만 확인한다.
// RNFB·기기 등록은 가짜로 바꾼다.
jest.mock('../services/push', () => ({
  push: {
    available: true,
    getPermission: jest.fn(async () => 'default'),
    requestPermission: jest.fn(async () => 'default'),
    getToken: jest.fn(async () => 'tok'),
    deleteToken: jest.fn(async () => {}),
    onTokenRefresh: jest.fn(() => () => {}),
    onForeground: jest.fn(() => () => {}),
    onOpened: jest.fn(() => () => {}),
    getInitial: jest.fn(async () => null),
  },
}));
const mockRegister = jest.fn(async () => {});
const mockPush = push as unknown as { getPermission: jest.Mock };
jest.mock('../services/pushDevice', () => ({ registerMobileDevice: () => mockRegister() }));
const mockRouter = { replace: jest.fn(), dismissTo: jest.fn() };
jest.mock('expo-router', () => ({ usePathname: () => '/', useRouter: () => mockRouter }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

let toActive: (s: string) => void;

function Probe() {
  return <Text>{`상태:${usePush().state}`}</Text>;
}

async function renderProvider() {
  await render(
    <PushProvider>
      <Probe />
    </PushProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockPush.getPermission.mockResolvedValue('default');
  jest.spyOn(AppState, 'addEventListener').mockImplementation(((_: string, cb: (s: string) => void) => {
    toActive = cb;
    return { remove: jest.fn() };
  }) as never);
});
afterEach(() => jest.restoreAllMocks());

describe('PushProvider — 앱이 다시 앞으로 올 때 권한 재확인', () => {
  it('denied 에서 설정을 바꾸고 돌아오면 허용을 알아보고 기기를 등록한다', async () => {
    mockPush.getPermission.mockResolvedValue('denied');
    await renderProvider();
    await screen.findByText('상태:denied');
    expect(mockRegister).not.toHaveBeenCalled();

    mockPush.getPermission.mockResolvedValue('granted');
    await act(async () => {
      toActive('active');
    });
    await screen.findByText('상태:registered');
    expect(mockRegister).toHaveBeenCalledTimes(1);
  });

  it('default·error 상태에서도 다시 확인한다', async () => {
    await renderProvider();
    await screen.findByText('상태:default');
    const before = mockPush.getPermission.mock.calls.length;
    await act(async () => {
      toActive('active');
    });
    expect(mockPush.getPermission.mock.calls.length).toBe(before + 1);

    mockPush.getPermission.mockResolvedValue('granted');
    mockRegister.mockRejectedValueOnce(new Error('fail'));
    await act(async () => {
      toActive('active');
    });
    await screen.findByText('상태:error');
    const afterError = mockPush.getPermission.mock.calls.length;
    await act(async () => {
      toActive('active');
    });
    expect(mockPush.getPermission.mock.calls.length).toBe(afterError + 1);
    await screen.findByText('상태:registered');
  });

  it('registered 면 돌아와도 다시 확인·등록하지 않는다', async () => {
    mockPush.getPermission.mockResolvedValue('granted');
    await renderProvider();
    await screen.findByText('상태:registered');
    const checks = mockPush.getPermission.mock.calls.length;
    await act(async () => {
      toActive('active');
    });
    expect(mockPush.getPermission.mock.calls.length).toBe(checks);
    expect(mockRegister).toHaveBeenCalledTimes(1);
  });

  it('background·inactive 로 바뀔 때는 아무 일도 하지 않는다', async () => {
    await renderProvider();
    await screen.findByText('상태:default');
    const checks = mockPush.getPermission.mock.calls.length;
    await act(async () => {
      toActive('background');
      toActive('inactive');
    });
    expect(mockPush.getPermission.mock.calls.length).toBe(checks);
  });
});

describe('PushProvider — 알림 탭 이동', () => {
  it('알림을 탭하면 약 관리 스택을 정리하며 오늘 화면으로 간다(replace 가 아니라 dismissTo 한 번)', async () => {
    let opened: (m: unknown) => void = () => {};
    (push as unknown as { onOpened: jest.Mock }).onOpened.mockImplementation((cb: (m: unknown) => void) => {
      opened = cb;
      return () => {};
    });
    await renderProvider();
    await screen.findByText('상태:default');
    await act(async () => {
      opened({
        title: '투약 시간이에요',
        data: { type: 'med_reminder', medicationId: 'med-1', petId: 'pet-1', recordDate: '2026-10-08', scheduledTime: '08:00' },
      });
    });
    expect(mockRouter.dismissTo).toHaveBeenCalledTimes(1);
    expect(mockRouter.dismissTo.mock.calls[0][0]).toMatch(/^\/\?source=push&med=med-1&n=/);
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });
});
