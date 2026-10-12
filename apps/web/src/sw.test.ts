import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { readSwToken, saveSwToken } from './lib/swTokenStore';

// 서비스워커(sw.ts) 알림 클릭 처리 테스트 — 가짜 self·fetch·IndexedDB 로 import 해서 등록된 처리기를 직접 부른다.
// 실제 브라우저·실제 FCM 발송이 필요한 end-to-end 는 이 테스트 범위 밖이다.

type Listener = (event: unknown) => void;
const listeners: Record<string, Listener[]> = {};
let listenersWhenFirebaseInit: number | null = null;
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
    // Firebase 초기화 시점에 notificationclick 처리기가 이미 등록돼 있어야 한다(Firebase 의 클릭 처리기보다 먼저)
    listenersWhenFirebaseInit = (listeners.notificationclick ?? []).length;
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
/** 결과 알림만("기록하는 중이에요" 알림은 recordingShown 으로 따로 본다) */
const shown = () => allShown().filter((c) => c[0] !== '기록하는 중이에요');
const recordingShown = () => allShown().filter((c) => c[0] === '기록하는 중이에요');

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

describe('sw.ts — 등록 순서', () => {
  it('notificationclick 처리기는 Firebase 초기화보다 먼저 등록된다', () => {
    expect(listeners.notificationclick).toHaveLength(1);
    expect(listenersWhenFirebaseInit).toBe(1);
  });
});

describe('sw.ts — 본문 탭(기존 동작)', () => {
  it('알림을 닫고 앱의 오늘 화면을 열며, Firebase 기본 처리기로 넘기지 않는다(stopImmediatePropagation)', async () => {
    const e = await click('');
    expect(e.stopImmediatePropagation).toHaveBeenCalled();
    expect(e.notification.close).toHaveBeenCalled();
    expect(openWindow).toHaveBeenCalledTimes(1);
    const url = new URL((openWindow.mock.calls[0] as unknown as [string])[0]);
    expect(url.origin).toBe('https://app.example.test');
    expect(url.pathname).toBe('/today');
    expect(url.searchParams.get('source')).toBe('push');
    expect(url.searchParams.get('med')).toBe('med-1');
    // 알림이 가리킨 회차(시각·기록 날짜)를 싣는다: 같은 약의 다른 회차에 큰 버튼이 붙지 않게
    expect(url.searchParams.get('t')).toBe('20:00');
    expect(url.searchParams.get('d')).toBe('2026-10-06');
    expect(url.searchParams.get('n')).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('투약 알림이 아니면 첫 화면만 연다', async () => {
    await click('', { data: { x: 1 } });
    expect((openWindow.mock.calls[0] as unknown as [string])[0]).toBe('https://app.example.test/');
  });

  it('결과 알림(평평한 data)을 눌러도 같은 오늘 화면을 연다', async () => {
    await click('', { data: { ...DATA, result: 'failed' } });
    expect(new URL((openWindow.mock.calls[0] as unknown as [string])[0]).searchParams.get('med')).toBe('med-1');
  });

  it('알 수 없는 다른 액션 id 도 본문 탭처럼 앱을 연다(체크하지 않는다)', async () => {
    await click('snooze');
    expect(openWindow).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('sw.ts — [먹였어요] 액션', () => {
  it('성공: 앱을 열지 않고 체크한 뒤 같은 tag 로 "먹였어요로 기록했어요" 알림을 덮어쓴다', async () => {
    const e = await click('taken');
    expect(e.stopImmediatePropagation).toHaveBeenCalled();
    expect(openWindow).not.toHaveBeenCalled();
    expect(postCalls()).toHaveLength(1);
    const [url, init] = postCalls()[0] as [string, RequestInit];
    expect(url).toBe('https://api.example.test/api/med-logs');
    expect(JSON.parse(String(init.body))).toEqual({ medicationId: 'med-1', scheduledTime: '20:00' });
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer jwt-1');
    expect(shown()).toHaveLength(1);
    expect(shown()[0][0]).toBe('먹였어요로 기록했어요');
    expect(shown()[0][1]).toMatchObject({ tag: TAG, body: '초코 · 아조딜 1캡슐 · 20:00', silent: true });
    expect(shown()[0][1]).not.toHaveProperty('actions');
  });

  it('409 ALREADY_CHECKED 는 성공으로 처리("이미 먹였다고 기록돼 있어요")', async () => {
    fetchMock.mockImplementation(async (_i: RequestInfo | URL, init?: RequestInit) =>
      init?.method === 'POST' ? json(409, { code: 'ALREADY_CHECKED' }) : todayOk(),
    );
    await click('taken');
    expect(shown()[0][0]).toBe('이미 먹였다고 기록돼 있어요');
    expect(openWindow).not.toHaveBeenCalled();
  });

  it('401: 사본을 지우고 "다시 로그인이 필요해요" 알림(기록했다는 말 없음), 이후 버튼은 요청 없이 같은 안내', async () => {
    fetchMock.mockImplementation(async () => json(401, { code: 'UNAUTHORIZED' }));
    await click('taken');
    expect(shown()[0][0]).toBe('다시 로그인이 필요해요');
    expect(JSON.stringify(shown()[0])).not.toContain('기록했어요');
    expect(shown()[0][1]).toMatchObject({ tag: TAG, requireInteraction: true });
    expect(await readSwToken()).toBeNull();
    fetchMock.mockClear();
    await click('taken');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(shown()[1][0]).toBe('다시 로그인이 필요해요');
  });

  it('401 이어도 그사이 새 토큰으로 바뀌었다면 새 사본은 지우지 않는다', async () => {
    fetchMock.mockImplementation(async () => {
      await saveSwToken('jwt-new'); // 응답 오는 사이 페이지가 새 토큰으로 교체
      await new Promise((r) => setTimeout(r, 20));
      return json(401, { code: 'UNAUTHORIZED' });
    });
    await click('taken');
    expect(await readSwToken()).toBe('jwt-new');
  });

  it('토큰 사본이 없으면(로그아웃 뒤·옛 버전) 요청 없이 로그인 안내', async () => {
    globalThis.indexedDB = new IDBFactory();
    await click('taken');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(shown()[0][0]).toBe('다시 로그인이 필요해요');
  });

  it('오프라인: "기록하지 못했어요 / 인터넷에 연결되지 않았어요…" 알림, 앱을 열지 않는다', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await click('taken');
    expect(shown()[0][0]).toBe('기록하지 못했어요');
    expect(shown()[0][1].body).toBe('인터넷에 연결되지 않았어요. 눌러서 앱에서 확인해 주세요.');
    expect(openWindow).not.toHaveBeenCalled();
  });

  it('서버 오류(500): "서버에 잠시 문제가 있어요…"', async () => {
    fetchMock.mockImplementation(async (_i: RequestInfo | URL, init?: RequestInit) =>
      init?.method === 'POST' ? json(500, { code: 'X' }) : todayOk(),
    );
    await click('taken');
    expect(shown()[0][1].body).toBe('서버에 잠시 문제가 있어요. 눌러서 앱에서 확인해 주세요.');
  });

  it('약 없음(404)·일정에 없는 시각(400): "이 약은 이제 목록에 없어요…"', async () => {
    for (const status of [404, 400]) {
      showNotification.mockClear();
      fetchMock.mockImplementation(async (_i: RequestInfo | URL, init?: RequestInit) =>
        init?.method === 'POST' ? json(status, { code: 'X' }) : todayOk(),
      );
      await click('taken');
      expect(shown()[0][1].body).toBe('이 약은 이제 목록에 없어요. 눌러서 앱에서 확인해 주세요.');
    }
  });

  it('날짜 불일치(밤새 남은 알림): 체크하지 않고 "시간이 지난 알림이에요…"', async () => {
    fetchMock.mockImplementation(async () =>
      json(200, { recordDate: '2026-10-07', doses: [{ medicationId: 'med-1', scheduledTime: '20:00', taken: false }] }),
    );
    await click('taken');
    expect(postCalls()).toHaveLength(0);
    expect(shown()[0][0]).toBe('기록하지 못했어요');
    expect(shown()[0][1].body).toBe('시간이 지난 알림이에요. 눌러서 앱에서 확인해 주세요.');
  });

  it('1시간 초과 알림: 요청 없이 "시간이 지난 알림이에요…"', async () => {
    await click('taken', { timestamp: NOW - 60 * 60 * 1000 - 1 });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(shown()[0][1].body).toBe('시간이 지난 알림이에요. 눌러서 앱에서 확인해 주세요.');
  });

  it('알림 시각을 모르면 보수적으로 알림을 닫고 앱을 연다(요청 없음)', async () => {
    const e = await click('taken', { timestamp: undefined });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(showNotification).not.toHaveBeenCalled();
    expect(e.notification.close).toHaveBeenCalled();
    expect(openWindow).toHaveBeenCalledTimes(1);
  });

  it('알림 data 를 읽을 수 없으면 앱 첫 화면을 연다', async () => {
    await click('taken', { data: { nothing: true } });
    expect(fetchMock).not.toHaveBeenCalled();
    expect((openWindow.mock.calls[0] as unknown as [string])[0]).toBe('https://app.example.test/');
  });

  it('결과 알림을 못 띄우면(권한 회수 등) 침묵하지 않고 앱을 연다', async () => {
    showNotification.mockRejectedValue(new Error('denied'));
    await click('taken');
    expect(openWindow).toHaveBeenCalledTimes(1);
  });

  it('같은 알림의 버튼이 겹쳐 눌려도 체크 요청은 한 번만 보낸다', async () => {
    const a = clickEvent('taken');
    const b = clickEvent('taken');
    for (const l of listeners.notificationclick) l(a);
    for (const l of listeners.notificationclick) l(b);
    await Promise.all([...a.done, ...b.done]);
    expect(postCalls()).toHaveLength(1);
    expect(shown()).toHaveLength(1);
    expect(recordingShown()).toHaveLength(1); // 겹쳐 눌러도 "기록하는 중이에요"도 한 번
  });

  it('서비스워커는 토큰 사본을 바꾸지 않는다(성공해도 그대로)', async () => {
    await click('taken');
    expect(await readSwToken()).toBe('jwt-1');
  });
});

describe('sw.ts — "기록하는 중이에요" 알림 (설계 2-6)', () => {
  it('요청을 보내기 전에 같은 tag 로 조용히 먼저 띄우고, 결과가 같은 tag 로 덮어쓴다(소리 없음, 버튼 없음)', async () => {
    const order: string[] = [];
    showNotification.mockImplementation(async (title: string) => void order.push(`show:${title}`));
    fetchMock.mockImplementation(async (_i: RequestInfo | URL, init?: RequestInit) => {
      order.push(`fetch:${init?.method ?? 'GET'}`);
      return init?.method === 'POST' ? json(201, { id: 'l', takenAt: '2026-10-06T11:00:05Z' }) : todayOk();
    });
    await click('taken');
    expect(order).toEqual(['show:기록하는 중이에요', 'fetch:GET', 'fetch:POST', 'show:먹였어요로 기록했어요']);
    expect(recordingShown()).toHaveLength(1);
    expect(recordingShown()[0][1]).toMatchObject({ tag: TAG, body: '초코 · 아조딜 1캡슐', silent: true, renotify: false });
    expect(recordingShown()[0][1]).not.toHaveProperty('actions');
    expect(recordingShown()[0][1].data).toEqual({ FCM_MSG: { data: DATA } }); // 눌러도 같은 오늘 화면이 열린다
    expect(shown()[0][1].tag).toBe(TAG);
    expect(JSON.stringify(recordingShown())).not.toContain('기록했어요');
  });

  it('요청이 느려도 결과가 오기 전까지 알림 자리는 "기록하는 중이에요"로 남아 있다', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    fetchMock.mockImplementation(async (_i: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'POST') await gate;
      return init?.method === 'POST' ? json(201, { id: 'l', takenAt: '2026-10-06T11:00:05Z' }) : todayOk();
    });
    const e = clickEvent('taken');
    for (const l of listeners.notificationclick) l(e);
    await vi.waitFor(() => expect(postCalls()).toHaveLength(1));
    expect(allShown().map((c) => c[0])).toEqual(['기록하는 중이에요']);
    release();
    await Promise.all(e.done);
    expect(allShown().map((c) => c[0])).toEqual(['기록하는 중이에요', '먹였어요로 기록했어요']);
  });

  it('요청을 보내지 않는 경우(알림 시각 없음·오래됨·읽을 수 없는 data)에는 띄우지 않는다', async () => {
    await click('taken', { timestamp: undefined });
    await click('taken', { timestamp: NOW - 2 * 60 * 60 * 1000 });
    await click('taken', { data: { nothing: true } });
    expect(recordingShown()).toHaveLength(0);
  });

  it('앱을 열어 알리는 폴백이면 남은 "기록하는 중이에요" 알림을 같은 tag 로 닫는다', async () => {
    const closeOne = vi.fn();
    const getNotifications = vi.fn(async () => [{ close: closeOne }]);
    (globalThis as unknown as { self: { registration: { getNotifications: unknown } } }).self.registration.getNotifications = getNotifications;
    showNotification.mockImplementation(async (title: string) => {
      if (title !== '기록하는 중이에요') throw new Error('denied'); // 결과 알림만 실패
    });
    await click('taken');
    expect(getNotifications).toHaveBeenCalledWith({ tag: TAG });
    expect(closeOne).toHaveBeenCalled();
    expect(openWindow).toHaveBeenCalledTimes(1);
  });

  it('창을 열지 못해도(openWindow 거절) 처리기가 오류로 끝나지 않는다', async () => {
    showNotification.mockRejectedValue(new Error('denied'));
    openWindow.mockRejectedValueOnce(new Error('not allowed'));
    await expect(click('taken')).resolves.toBeDefined();
  });
});

describe('sw.ts — 소스 점검', () => {
  const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');
  it('서비스워커는 사본을 읽기만 한다: 저장·전체삭제 함수를 가져오지 않고, 토큰·응답을 console 로 남기지 않는다', () => {
    const sw = read('./sw.ts');
    expect(sw).not.toMatch(/saveSwToken|clearSwToken\b/);
    for (const file of ['./sw.ts', './lib/pushAction.ts', './lib/swTokenStore.ts']) {
      expect(read(file)).not.toMatch(/console\./);
    }
  });
  it('/api 는 캐시하지 않는다: 런타임 캐시 라우트·caches 사용이 없다', () => {
    const sw = read('./sw.ts');
    expect(sw).not.toMatch(/caches\.|runtimeCaching|StaleWhileRevalidate|NetworkFirst|CacheFirst/);
    expect(sw).toMatch(/denylist: \[\/\^\\\/api/);
  });
});
