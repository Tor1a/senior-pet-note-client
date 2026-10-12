import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { readSwToken, saveSwToken } from './lib/swTokenStore';

// QA 추가: 동시 알림·연타·결과 알림 정합. 서비스워커(sw.ts) 알림 클릭 처리 테스트 — 가짜 self·fetch·IndexedDB 로 import 해서 등록된 처리기를 직접 부른다.
// 실제 브라우저·실제 FCM 발송이 필요한 end-to-end 는 이 테스트 범위 밖이다.

type Listener = (event: unknown) => void;
const listeners: Record<string, Listener[]> = {};
const showNotification = vi.fn(async (_title: string, _options?: unknown) => {});
const openWindow = vi.fn(async () => ({}));
const matchAll = vi.fn(async () => [] as unknown[]);

vi.mock('workbox-core', () => ({ clientsClaim: vi.fn() }));
vi.mock('workbox-precaching', () => ({
  cleanupOutdatedCaches: vi.fn(),
  createHandlerBoundToURL: vi.fn(),
  precacheAndRoute: vi.fn(),
}));
vi.mock('workbox-routing', () => ({ NavigationRoute: class {}, registerRoute: vi.fn() }));
vi.mock('firebase/app', () => ({ initializeApp: vi.fn(() => ({})) }));
vi.mock('firebase/messaging/sw', () => ({
  getMessaging: vi.fn(() => {
    return {};
  }),
}));

const NOW = Date.UTC(2026, 9, 6, 11, 0, 0);
const DATA = {
  type: 'med_reminder',
  medicationId: 'med-1',
  petId: 'pet-1',
  recordDate: '2026-10-06',
  scheduledTime: '20:00',
};
const TAG = 'med-1:2026-10-06:20:00';

interface FakeEvent {
  action: string;
  notification: { tag: string; body: string; timestamp?: number; data: unknown; close: ReturnType<typeof vi.fn> };
  stopImmediatePropagation: ReturnType<typeof vi.fn>;
  waitUntil: (p: Promise<unknown>) => void;
  done: Promise<unknown>[];
}

function clickEvent(action: string, over: Partial<FakeEvent['notification']> = {}): FakeEvent {
  const done: Promise<unknown>[] = [];
  return {
    action,
    // Firebase 가 표시한 알림은 data.FCM_MSG.data 에 서버 data 가 들어 있다
    notification: { tag: TAG, body: '초코 · 아조딜 1캡슐', timestamp: NOW - 60_000, data: { FCM_MSG: { data: DATA } }, close: vi.fn(), ...over },
    stopImmediatePropagation: vi.fn(),
    waitUntil: (p) => void done.push(p),
    done,
  };
}

async function click(action: string, over: Partial<FakeEvent['notification']> = {}) {
  const event = clickEvent(action, over);
  for (const l of listeners.notificationclick) l(event);
  await Promise.all(event.done);
  return event;
}

const json = (status: number, body: unknown) =>
  new Response(body === null ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const todayOk = () =>
  json(200, {
    recordDate: '2026-10-06',
    doses: [{ medicationId: 'med-1', name: '아조딜', doseText: '1캡슐', scheduledTime: '20:00', taken: false, medLogId: null, takenAt: null }],
  });

let fetchMock: ReturnType<typeof vi.fn>;
const postCalls = () => fetchMock.mock.calls.filter((c) => (c[1] as RequestInit | undefined)?.method === 'POST');
const allShown = () => showNotification.mock.calls as unknown as Array<[string, Record<string, unknown>]>;
/** 결과 알림만("기록하는 중이에요" 알림 제외) */
const shown = () => allShown().filter((c) => c[0] !== '기록하는 중이에요');

beforeAll(async () => {
  vi.stubEnv('VITE_FIREBASE_API_KEY', 'k');
  vi.stubEnv('VITE_FIREBASE_PROJECT_ID', 'p');
  vi.stubEnv('VITE_FIREBASE_MESSAGING_SENDER_ID', 's');
  vi.stubEnv('VITE_FIREBASE_APP_ID', 'a');
  vi.stubEnv('VITE_FIREBASE_VAPID_KEY', 'v');
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
  showNotification.mockImplementation(async () => {});
  openWindow.mockClear();
  fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) =>
    init?.method === 'POST' ? json(201, { id: 'log-1', takenAt: '2026-10-06T11:00:05Z' }) : todayOk(),
  );
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(Date, 'now').mockReturnValue(NOW);
  await saveSwToken('jwt-1');
});
afterEach(() => {
  vi.restoreAllMocks();
});


describe('QA: sw.ts — 동시 알림·연타·결과 알림', () => {
  const doseOf = (m: string) => ({ medicationId: m, name: m, doseText: '1정', scheduledTime: '20:00', taken: false, medLogId: null, takenAt: null });
  const dataOf = (m: string) => ({ ...DATA, medicationId: m });
  const tagOf = (m: string) => `${m}:2026-10-06:20:00`;
  const notifOf = (m: string) => ({ tag: tagOf(m), body: `초코 · ${m} 1정`, data: { FCM_MSG: { data: dataOf(m) } } });

  it('약 3개 알림의 버튼을 동시에 눌러도 각자 자기 약만 POST 하고 자기 tag 로 결과가 남는다', async () => {
    const meds = ['m1', 'm2', 'm3'];
    fetchMock.mockImplementation(async (_u: RequestInfo | URL, init?: RequestInit) =>
      init?.method === 'POST'
        ? json(201, { id: 'x', takenAt: '2026-10-06T11:00:05Z' })
        : json(200, { recordDate: '2026-10-06', doses: meds.map(doseOf) }),
    );
    await Promise.all(meds.map((m) => click('taken', notifOf(m))));
    expect(postCalls().map((c) => JSON.parse(String((c[1] as RequestInit).body)).medicationId).sort()).toEqual(meds);
    expect(shown().map((s) => s[1].tag).sort()).toEqual(meds.map(tagOf).sort());
    for (const [, o] of shown()) expect(String(o.body)).toContain(String((o.data as { medicationId: string }).medicationId));
  });

  it('같은 알림 버튼을 연달아 5번 눌러도(겹침) 요청은 한 번, 결과 알림도 한 번', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    fetchMock.mockImplementation(async (_u: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'POST') {
        await gate;
        return json(201, { id: 'x', takenAt: '2026-10-06T11:00:05Z' });
      }
      return todayOk();
    });
    const n = clickEvent('taken');
    const events = [n, clickEvent('taken'), clickEvent('taken'), clickEvent('taken'), clickEvent('taken')];
    for (const e of events) for (const l of listeners.notificationclick) l(e);
    await new Promise((r) => setTimeout(r, 30));
    release();
    await Promise.all(events.flatMap((e) => e.done));
    expect(postCalls()).toHaveLength(1);
    expect(shown()).toHaveLength(1);
  });

  it('성공·실패 어느 결과 알림도 같은 tag 라 원래 알림을 덮어쓰고, 원래 알림을 따로 닫지 않는다', async () => {
    const cases: Array<() => Response> = [() => json(201, { takenAt: '2026-10-06T11:00:05Z' }), () => json(500, {}), () => json(401, {}), () => json(404, {})];
    for (const post of cases) {
      showNotification.mockClear();
      fetchMock.mockImplementation(async (_u: RequestInfo | URL, init?: RequestInit) => (init?.method === 'POST' ? post() : todayOk()));
      await saveSwToken('jwt-1');
      const e = await click('taken');
      expect(shown()).toHaveLength(1);
      expect(shown()[0][1].tag).toBe(TAG);
      expect(e.notification.close).not.toHaveBeenCalled();
    }
  });

  it('실패 결과 알림 어디에도 "먹였어요로 기록했어요"가 없다(401·5xx·오프라인·날짜 불일치·시간 초과)', async () => {
    const scenarios: Array<() => Promise<void>> = [
      async () => void fetchMock.mockImplementation(async (_u: RequestInfo | URL, init?: RequestInit) => (init?.method === 'POST' ? json(401, {}) : todayOk())),
      async () => void fetchMock.mockImplementation(async (_u: RequestInfo | URL, init?: RequestInit) => (init?.method === 'POST' ? json(503, {}) : todayOk())),
      async () => void fetchMock.mockImplementation(async () => { throw new TypeError('Failed to fetch'); }),
      async () => void fetchMock.mockImplementation(async () => json(200, { recordDate: '2026-10-07', doses: [] })),
    ];
    for (const prep of scenarios) {
      showNotification.mockClear();
      await saveSwToken('jwt-1');
      await prep();
      await click('taken');
      expect(shown()).toHaveLength(1);
      expect(`${shown()[0][0]} ${String(shown()[0][1].body)}`).not.toMatch(/먹였어요로 기록했어요/);
    }
  });

  it('1시간 경계: 59:59·60:00 은 체크, 60:01 은 요청 없이 안내', async () => {
    await click('taken', { timestamp: NOW - 3599_000 });
    await click('taken', { timestamp: NOW - 3600_000 });
    expect(postCalls()).toHaveLength(2);
    fetchMock.mockClear();
    showNotification.mockClear();
    await click('taken', { timestamp: NOW - 3601_000 });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(shown()).toHaveLength(1);
  });

  it('결과 알림(평평한 data)의 본문 탭은 오늘 화면을 열고 체크 요청을 보내지 않는다', async () => {
    await click('taken');
    const [, options] = shown()[0];
    fetchMock.mockClear();
    const e = await click('', { tag: String(options.tag), body: String(options.body), data: options.data });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(openWindow).toHaveBeenCalledTimes(1);
    expect(e.notification.close).toHaveBeenCalled();
  });

  it('토큰 사본이 손상(숫자)됐으면 요청 없이 로그인 안내', async () => {
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open('spn-sw', 1);
      req.onsuccess = () => {
        const tx = req.result.transaction('auth', 'readwrite');
        tx.objectStore('auth').put(12345, 'accessToken');
        tx.oncomplete = () => { req.result.close(); resolve(); };
        tx.onerror = () => reject(tx.error);
      };
    });
    expect(await readSwToken()).toBeNull();
    fetchMock.mockClear();
    await click('taken');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(shown()[0][0]).toBe('다시 로그인이 필요해요');
  });
});
