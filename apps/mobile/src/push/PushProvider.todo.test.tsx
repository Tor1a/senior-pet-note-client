import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import { TODOS_PUSH_PATH } from '../lib/todoApi';
import { push } from '../services/push';
import { PushProvider } from './PushProvider';
import { usePush } from './pushContext';

// 할 일 알림(todo_reminder): 탭하면 /todos?source=push 로, 포그라운드면 [할 일 열기] 배너. 투약 알림 동작은 그대로.
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
jest.mock('../services/pushDevice', () => ({ registerMobileDevice: jest.fn(async () => {}) }));
const mockRouter = { replace: jest.fn(), dismissTo: jest.fn() };
jest.mock('expo-router', () => ({ usePathname: () => '/', useRouter: () => mockRouter }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

const mockPush = push as unknown as {
  onOpened: jest.Mock;
  onForeground: jest.Mock;
  getInitial: jest.Mock;
};

const TODO_DATA = {
  type: 'todo_reminder',
  todoId: 'todo-1',
  petId: 'pet-1',
  dueDate: '2026-10-20',
  kind: 'day_before',
  dueTime: '14:30',
};

function Probe() {
  const { bannerVisible } = usePush();
  return <Text>{`배너:${bannerVisible}`}</Text>;
}

async function renderProvider() {
  await render(
    <PushProvider>
      <Probe />
    </PushProvider>,
  );
}

function capture(fn: jest.Mock) {
  const holder: { cb: (m: unknown) => void } = { cb: () => {} };
  fn.mockImplementation((cb: (m: unknown) => void) => {
    holder.cb = cb;
    return () => {};
  });
  return holder;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockPush.getInitial.mockResolvedValue(null);
});

describe('PushProvider — 할 일 알림 탭 이동', () => {
  it('백그라운드에서 알림을 탭하면 할 일 목록(/todos?source=push)으로 간다. 오늘 화면으로는 가지 않는다', async () => {
    const opened = capture(mockPush.onOpened);
    await renderProvider();
    await act(async () => opened.cb({ title: '내일 일정이 있어요', body: '보리 · 광견병 접종', data: TODO_DATA }));
    expect(mockRouter.dismissTo).toHaveBeenCalledTimes(1);
    expect(mockRouter.dismissTo).toHaveBeenCalledWith(TODOS_PUSH_PATH);
    expect(TODOS_PUSH_PATH).toBe('/todos?source=push');
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  it('종료 상태에서 알림으로 시작해도(getInitial) 할 일 목록으로 간다', async () => {
    mockPush.getInitial.mockResolvedValue({ title: '오늘 일정이 있어요', data: { ...TODO_DATA, kind: 'due_day' } });
    await renderProvider();
    await act(async () => {});
    expect(mockRouter.dismissTo).toHaveBeenCalledWith(TODOS_PUSH_PATH);
  });

  it('알 수 없는 type 이거나 필수 값이 빠진 알림은 아무 데도 가지 않는다', async () => {
    const opened = capture(mockPush.onOpened);
    await renderProvider();
    await act(async () => {
      opened.cb({ data: { type: 'something_else' } });
      opened.cb({ data: { ...TODO_DATA, todoId: undefined } });
      opened.cb({ data: { ...TODO_DATA, kind: 'weird' } });
    });
    expect(mockRouter.dismissTo).not.toHaveBeenCalled();
  });

  it('투약 알림은 그대로 오늘 화면으로 간다(회귀)', async () => {
    const opened = capture(mockPush.onOpened);
    await renderProvider();
    await act(async () => {
      opened.cb({
        data: { type: 'med_reminder', medicationId: 'med-1', petId: 'pet-1', recordDate: '2026-10-08', scheduledTime: '08:00' },
      });
    });
    expect(mockRouter.dismissTo).toHaveBeenCalledTimes(1);
    expect(mockRouter.dismissTo.mock.calls[0][0]).toMatch(/^\/\?source=push&med=med-1/);
  });
});

describe('PushProvider — 할 일 알림 포그라운드 배너', () => {
  it('서버 알림 문구를 배너로 보이고 [할 일 열기]로 목록에 간다. 투약 배너·오늘 화면 재동기는 건드리지 않는다', async () => {
    const foreground = capture(mockPush.onForeground);
    await renderProvider();
    await act(async () => foreground.cb({ title: '내일 일정이 있어요', body: '보리 · 광견병 접종 · 14:30', data: TODO_DATA }));
    expect(screen.getByText('내일 일정이 있어요')).toBeTruthy();
    expect(screen.getByText('보리 · 광견병 접종 · 14:30')).toBeTruthy();
    expect(screen.getByText('배너:true')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '오늘 화면에서 체크하기' })).toBeNull();

    await fireEvent.press(screen.getByRole('button', { name: '할 일 열기' }));
    expect(mockRouter.dismissTo).toHaveBeenCalledWith(TODOS_PUSH_PATH);
    expect(screen.queryByText('내일 일정이 있어요')).toBeNull();
    expect(screen.getByText('배너:false')).toBeTruthy();
  });

  it('서버 제목이 없으면 종류에 맞는 기본 제목, [닫기]로 닫힌다. 같은 알림은 하나로 합쳐진다', async () => {
    const foreground = capture(mockPush.onForeground);
    await renderProvider();
    await act(async () => {
      foreground.cb({ body: '보리 · 구충제', data: { ...TODO_DATA, kind: 'due_day' } });
      foreground.cb({ body: '보리 · 구충제', data: { ...TODO_DATA, kind: 'due_day' } });
    });
    expect(screen.getByText('오늘 일정이 있어요')).toBeTruthy();
    expect(screen.getAllByText('보리 · 구충제')).toHaveLength(1);
    await fireEvent.press(screen.getByRole('button', { name: '닫기' }));
    expect(screen.queryByText('오늘 일정이 있어요')).toBeNull();
    expect(mockRouter.dismissTo).not.toHaveBeenCalled();
  });

  it('투약 알림 배너는 기존대로 보인다(회귀)', async () => {
    const foreground = capture(mockPush.onForeground);
    await renderProvider();
    await act(async () =>
      foreground.cb({
        title: '투약 시간이에요',
        body: '보리 · 아조딜',
        data: { type: 'med_reminder', medicationId: 'med-1', petId: 'pet-1', recordDate: '2026-10-08', scheduledTime: '08:00' },
      }),
    );
    expect(screen.getByText('투약 시간이에요')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '할 일 열기' })).toBeNull();
  });
});
