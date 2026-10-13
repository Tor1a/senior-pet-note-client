// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ForegroundMessage, PushSupport } from './webPush';

// PushProvider: 시작 시 기기 등록, 포그라운드 배너. Firebase 연결부(webPush)와 기기 등록(device)은 가짜로 바꾼다.

const fake = vi.hoisted(() => ({
  support: 'ok' as PushSupport,
  permission: 'granted' as NotificationPermission,
  foreground: null as ((m: ForegroundMessage) => void) | null,
  register: vi.fn(async () => ({ id: 'uuid' })),
}));

vi.mock('./webPush', () => ({
  readBrowserEnv: () => ({ userAgent: 'Android Mobile', maxTouchPoints: 5 }),
  isMobileDevice: () => true,
  webPush: {
    support: async () => fake.support,
    permission: () => fake.permission,
    requestPermission: async () => fake.permission,
    onForeground: async (l: (m: ForegroundMessage) => void) => {
      fake.foreground = l;
      return () => {
        fake.foreground = null;
      };
    },
  },
}));
vi.mock('./device', () => ({ registerWebDevice: fake.register }));

const { PushProvider, usePush, usePushMessages } = await import('./PushProvider');

function Probe() {
  const { state } = usePush();
  const loc = useLocation();
  return (
    <p data-testid="probe">
      {state} {loc.pathname + loc.search}
    </p>
  );
}

function renderProvider(path = '/medications', onMessage = vi.fn()) {
  function Listener() {
    usePushMessages(onMessage);
    return null;
  }
  render(
    <MemoryRouter initialEntries={[path]}>
      <PushProvider>
        <Routes>
          <Route path="*" element={<Probe />} />
        </Routes>
        <Listener />
      </PushProvider>
    </MemoryRouter>,
  );
  return { onMessage };
}

const MED_MESSAGE: ForegroundMessage = {
  notification: { title: '투약 시간이에요', body: '초코 · 아조딜 1캡슐' },
  data: { type: 'med_reminder', medicationId: 'm1', petId: 'p1', recordDate: '2026-10-06', scheduledTime: '08:00' },
};

beforeEach(() => {
  fake.support = 'ok';
  fake.permission = 'granted';
  fake.foreground = null;
  fake.register.mockClear();
});

afterEach(() => {
  cleanup();
});

describe('PushProvider — 시작 시 기기 등록', () => {
  it('권한이 이미 허용돼 있으면 조용히 1회 등록한다', async () => {
    renderProvider();
    await waitFor(() => expect(screen.getByTestId('probe').textContent).toContain('registered'));
    expect(fake.register).toHaveBeenCalledTimes(1);
  });

  it('아직 안 물어봄이면 묻지도 등록하지도 않는다', async () => {
    fake.permission = 'default';
    renderProvider();
    await waitFor(() => expect(screen.getByTestId('probe').textContent).toContain('default'));
    expect(fake.register).not.toHaveBeenCalled();
  });

  it('Firebase 설정이 없으면 unavailable, 등록 없음', async () => {
    fake.support = 'unavailable';
    renderProvider();
    await waitFor(() => expect(screen.getByTestId('probe').textContent).toContain('unavailable'));
    expect(fake.register).not.toHaveBeenCalled();
  });

  it('등록이 실패하면 error (화면은 막지 않음)', async () => {
    fake.register.mockRejectedValueOnce(new Error('500'));
    renderProvider();
    await waitFor(() => expect(screen.getByTestId('probe').textContent).toContain('error'));
  });
});

describe('PushProvider — 동시 호출', () => {
  it('시작 확인과 recheck 가 겹쳐도 등록은 한 번만 돈다', async () => {
    let recheck!: () => Promise<unknown>;
    function Grab() {
      recheck = usePush().recheck;
      return null;
    }
    render(
      <MemoryRouter>
        <PushProvider>
          <Grab />
        </PushProvider>
      </MemoryRouter>,
    );
    await act(async () => {
      await Promise.all([recheck(), recheck()]);
    });
    expect(fake.register).toHaveBeenCalledTimes(1);
  });
});

describe('PushProvider — 포그라운드 배너(S8)', () => {
  it('투약 알림이면 배너를 띄우고, [오늘 화면에서 체크하기]는 /today?source=push 로 보낸다', async () => {
    const { onMessage } = renderProvider();
    await waitFor(() => expect(fake.foreground).toBeTruthy());
    act(() => fake.foreground!(MED_MESSAGE));

    const banner = await screen.findByRole('status');
    expect(banner.textContent).toContain('투약 시간이에요');
    expect(banner.textContent).toContain('초코 · 아조딜 1캡슐 · 오전 8:00');
    expect(onMessage).toHaveBeenCalledTimes(1);

    await userEvent.setup().click(screen.getByRole('button', { name: '오늘 화면에서 체크하기' }));
    // 알림이 가리킨 회차(시각·기록 날짜)와 열 때마다 바뀌는 n 을 함께 싣는다
    expect(screen.getByTestId('probe').textContent).toMatch(/\/today\?source=push&med=m1&t=08%3A00&d=2026-10-06&n=\d+/);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('오늘 화면이면 버튼 대신 안내 문구, [닫기]로 닫힌다', async () => {
    renderProvider('/today');
    await waitFor(() => expect(fake.foreground).toBeTruthy());
    act(() => fake.foreground!(MED_MESSAGE));
    expect(await screen.findByText('아래 목록에서 [먹였어요]를 눌러 주세요.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '오늘 화면에서 체크하기' })).toBeNull();
    await userEvent.setup().click(screen.getByRole('button', { name: '알림 닫기' }));
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('알 수 없는 알림(type 다름)은 무시한다', async () => {
    const { onMessage } = renderProvider();
    await waitFor(() => expect(fake.foreground).toBeTruthy());
    act(() => fake.foreground!({ notification: { title: 'x' }, data: { type: 'other' } }));
    expect(screen.queryByRole('status')).toBeNull();
    expect(onMessage).not.toHaveBeenCalled();
  });
});

describe('PushProvider — 할 일 알림 배너', () => {
  const TODO_MESSAGE: ForegroundMessage = {
    notification: { title: '내일 일정이 있어요', body: '초코 · 광견병 접종 · 15:00' },
    data: { type: 'todo_reminder', todoId: 't1', petId: 'p1', dueDate: '2026-10-20', kind: 'day_before', dueTime: '15:00' },
  };

  it('todo_reminder 면 배너(서버 알림 문구 그대로)와 [할 일 열기]를 보이고, 누르면 /todos?source=push 로 간다. 투약 구독자에게는 알리지 않는다', async () => {
    const { onMessage } = renderProvider('/today');
    await waitFor(() => expect(fake.foreground).toBeTruthy());
    act(() => fake.foreground!(TODO_MESSAGE));

    const banner = await screen.findByRole('status');
    expect(banner.textContent).toContain('내일 일정이 있어요');
    expect(banner.textContent).toContain('초코 · 광견병 접종 · 15:00');
    expect(banner.textContent).not.toContain('먹였어요');
    expect(onMessage).not.toHaveBeenCalled();

    await userEvent.setup().click(screen.getByRole('button', { name: '할 일 열기' }));
    expect(screen.getByTestId('probe').textContent).toContain('/todos?source=push');
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('알림 제목이 비어 있으면 종류에 맞는 기본 제목, [닫기]로 닫힌다', async () => {
    renderProvider('/todos');
    await waitFor(() => expect(fake.foreground).toBeTruthy());
    act(() => fake.foreground!({ data: { ...TODO_MESSAGE.data!, kind: 'due_day' } }));
    expect((await screen.findByRole('status')).textContent).toContain('오늘 일정이 있어요');
    await userEvent.setup().click(screen.getByRole('button', { name: '알림 닫기' }));
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('필수 값이 빠진 todo_reminder 는 무시하고, 투약 배너 동작은 그대로다', async () => {
    const { onMessage } = renderProvider('/today');
    await waitFor(() => expect(fake.foreground).toBeTruthy());
    act(() => fake.foreground!({ data: { type: 'todo_reminder', petId: 'p1' } }));
    expect(screen.queryByRole('status')).toBeNull();
    act(() => fake.foreground!(MED_MESSAGE));
    expect((await screen.findByRole('status')).textContent).toContain('투약 시간이에요');
    expect(onMessage).toHaveBeenCalledTimes(1);
  });
});
