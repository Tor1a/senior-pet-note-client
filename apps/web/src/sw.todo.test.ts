import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { saveSwToken } from './lib/swTokenStore';

// 서비스워커: 할 일 알림(todo_reminder) 본문 탭은 /todos?source=push 를 연다. 투약 처리 코드와 섞이지 않는지(기획서 6-3, W5).

type Listener = (event: unknown) => void;
const listeners: Record<string, Listener[]> = {};
const showNotification = vi.fn(async (_title: string, _options?: unknown) => {});
const openWindow = vi.fn(async (_url: string) => ({}));
const matchAll = vi.fn(async () => [] as unknown[]);

vi.mock('workbox-core', () => ({ clientsClaim: vi.fn() }));
vi.mock('workbox-precaching', () => ({
  cleanupOutdatedCaches: vi.fn(),
  createHandlerBoundToURL: vi.fn(),
  precacheAndRoute: vi.fn(),
}));
vi.mock('workbox-routing', () => ({ NavigationRoute: class {}, registerRoute: vi.fn() }));
vi.mock('firebase/app', () => ({ initializeApp: vi.fn(() => ({})) }));
vi.mock('firebase/messaging/sw', () => ({ getMessaging: vi.fn(() => ({})) }));

const TODO_DATA = { type: 'todo_reminder', todoId: 't1', petId: 'p1', dueDate: '2026-10-20', kind: 'day_before' };
const MED_DATA = { type: 'med_reminder', medicationId: 'med-1', petId: 'p1', recordDate: '2026-10-06', scheduledTime: '20:00' };

async function click(action: string, data: unknown) {
  const done: Promise<unknown>[] = [];
  const event = {
    action,
    notification: { tag: 'todo:t1:day_before:2026-10-20', body: '초코 · 광견병 접종', data: { FCM_MSG: { data } }, close: vi.fn() },
    stopImmediatePropagation: vi.fn(),
    waitUntil: (p: Promise<unknown>) => void done.push(p),
  };
  for (const l of listeners.notificationclick) l(event);
  await Promise.all(done);
  return event;
}

const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));

beforeAll(async () => {
  vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.test');
  vi.stubGlobal('self', {
    skipWaiting: vi.fn(async () => {}),
    __WB_MANIFEST: [],
    location: { origin: 'https://app.example.test' },
    addEventListener: (type: string, fn: Listener) => {
      (listeners[type] ??= []).push(fn);
    },
    clients: { matchAll, openWindow },
    registration: { showNotification, getNotifications: vi.fn(async () => []) },
  });
  await import('./sw');
});

beforeEach(async () => {
  globalThis.indexedDB = new IDBFactory();
  showNotification.mockClear();
  openWindow.mockClear();
  fetchMock.mockClear();
  vi.stubGlobal('fetch', fetchMock);
  await saveSwToken('jwt-1');
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('sw.ts — 할 일 알림', () => {
  it('본문 탭: 알림을 닫고 /todos?source=push 를 열며 Firebase 기본 처리기로 넘기지 않는다', async () => {
    const e = await click('', TODO_DATA);
    expect(e.stopImmediatePropagation).toHaveBeenCalled();
    expect(e.notification.close).toHaveBeenCalled();
    expect(openWindow).toHaveBeenCalledTimes(1);
    expect(openWindow.mock.calls[0][0]).toBe('https://app.example.test/todos?source=push');
  });

  it('투약 API 를 부르지 않고 알림도 새로 띄우지 않는다 (버튼 값이 와도 투약 흐름으로 가지 않는다)', async () => {
    await click('', TODO_DATA);
    await click('taken', TODO_DATA);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(showNotification).not.toHaveBeenCalled();
    expect(openWindow).toHaveBeenCalledTimes(2);
    expect(openWindow.mock.calls.every((c) => c[0] === 'https://app.example.test/todos?source=push')).toBe(true);
  });

  it('필수 값이 빠진 todo_reminder 는 할 일 알림으로 보지 않는다(첫 화면만)', async () => {
    await click('', { type: 'todo_reminder', petId: 'p1' });
    expect(openWindow.mock.calls[0][0]).toBe('https://app.example.test/');
  });

  it('투약 알림 본문 탭은 그대로 오늘 화면(회귀)', async () => {
    await click('', MED_DATA);
    const url = new URL(openWindow.mock.calls[0][0]);
    expect(url.pathname).toBe('/today');
    expect(url.searchParams.get('med')).toBe('med-1');
  });
});
