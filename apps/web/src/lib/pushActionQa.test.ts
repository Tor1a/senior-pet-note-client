import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { findForbidden } from './historyText';
import {
  ACTION_MAX_AGE_MS,
  buildResultNotification,
  runTakenAction,
  type ActionDeps,
  type ActionOutcome,
} from './pushAction';
import { bigDoseButtonLabel, PUSH_ACTION_TEXT, recordedBodyText } from './pushActionText';
import type { MedReminderData } from './reminderApi';
import { clearSwToken, clearSwTokenIfEquals, readSwToken, saveSwToken, swTokenSettled } from './swTokenStore';

// QA 추가(알림-바로-체크): 기존 pushAction.test.ts·sw.test.ts 가 덮지 않은 경계값·금지어·사본 오류 시나리오.
const NOW = Date.UTC(2026, 9, 6, 11, 0, 0);
const DATA: MedReminderData = { type: 'med_reminder', medicationId: 'med-1', petId: 'pet-1', recordDate: '2026-10-06', scheduledTime: '20:00' };
const json = (status: number, body: unknown) =>
  new Response(body === null ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const todayBody = (recordDate = '2026-10-06', taken = false) => ({
  recordDate,
  doses: [{ medicationId: 'med-1', name: '아조딜', doseText: '1캡슐', scheduledTime: '20:00', taken, medLogId: null, takenAt: null }],
});

function deps(over: Partial<ActionDeps> & { post?: () => Response; today?: () => Response } = {}) {
  const fetchImpl = vi.fn(async (_u: RequestInfo | URL, init?: RequestInit) =>
    init?.method === 'POST' ? (over.post ?? (() => json(201, { id: 'l', takenAt: '2026-10-06T11:00:05Z' })))() : (over.today ?? (() => json(200, todayBody())))(),
  );
  const d: ActionDeps = {
    baseUrl: 'https://api.test',
    readToken: async () => 'jwt-1',
    forgetToken: vi.fn(async () => {}),
    fetchImpl: fetchImpl as unknown as typeof fetch,
    now: () => NOW,
    ...over,
  };
  return { d, fetchImpl };
}

describe('QA: 1시간 경계(알림 timestamp 기준)', () => {
  for (const [label, ageMs, posts] of [
    ['59분 59초', 3599_000, 1],
    ['정확히 60분 00초', ACTION_MAX_AGE_MS, 1],
    ['60분 00.001초', ACTION_MAX_AGE_MS + 1, 0],
    ['60분 01초', 3601_000, 0],
  ] as const) {
    it(`${label} 지난 알림: 체크 요청 ${posts}회`, async () => {
      const { d, fetchImpl } = deps();
      const out = await runTakenAction(DATA, NOW - ageMs, d);
      const postCalls = fetchImpl.mock.calls.filter((c) => (c[1] as RequestInit).method === 'POST').length;
      expect(postCalls).toBe(posts);
      expect(out.kind).toBe(posts ? 'recorded' : 'stale');
      if (!posts) expect(fetchImpl).not.toHaveBeenCalled(); // 오래된 알림은 토큰·네트워크도 쓰지 않는다
    });
  }
});

describe('QA: 기록 날짜(새벽 4시) 경계', () => {
  const d0311: MedReminderData = { ...DATA, recordDate: '2026-10-11', scheduledTime: '03:30' };
  const today = (recordDate: string) => () =>
    json(200, { recordDate, doses: [{ medicationId: 'med-1', scheduledTime: '03:30', taken: false }] });
  it('04:00 이후에 누른 03:30 회차(알림 recordDate=전날, 서버 recordDate=오늘)는 체크하지 않는다', async () => {
    const { d, fetchImpl } = deps({ today: today('2026-10-12') });
    expect((await runTakenAction(d0311, NOW - 1000, d)).kind).toBe('stale');
    expect(fetchImpl.mock.calls.filter((c) => (c[1] as RequestInit).method === 'POST')).toHaveLength(0);
  });
  it('04:00 전(서버 recordDate 도 전날)이면 체크한다', async () => {
    const { d } = deps({ today: today('2026-10-11') });
    expect((await runTakenAction(d0311, NOW - 1000, d)).kind).toBe('recorded');
  });
  it('서버 recordDate 가 알림보다 "과거"여도(알림이 미래 날짜) 체크하지 않는다', async () => {
    const { d } = deps({ today: () => json(200, todayBody('2026-10-05')) });
    expect((await runTakenAction(DATA, NOW - 1000, d)).kind).toBe('stale');
  });
  it('recordDate 가 숫자·null 같은 이상한 값이면 server(기록했다고 하지 않음)', async () => {
    for (const bad of [20261006, null, '', undefined]) {
      const { d } = deps({ today: () => json(200, { recordDate: bad, doses: [] }) });
      const out = await runTakenAction(DATA, NOW - 1000, d);
      expect(['server', 'stale']).toContain(out.kind);
    }
  });
});

describe('QA: 토큰 사본 값', () => {
  it('공백만 있는 사본은 헤더에 못 쓰므로 요청 없이 로그인 안내, 그 값만 지운다', async () => {
    const { d, fetchImpl } = deps({ readToken: async () => '   ', today: () => json(401, { code: 'UNAUTHORIZED' }) });
    expect((await runTakenAction(DATA, NOW - 1000, d)).kind).toBe('unauthorized');
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(d.forgetToken).toHaveBeenCalledWith('   ');
  });

  // QA 보고(낮음) 수정: 사본이 헤더에 못 쓰는 문자열(줄바꿈·한글 등)로 손상되면 fetch 가 요청 전에 TypeError 를 던져 "인터넷 문제"로 오분류됐고
  // 사본도 지워지지 않았다. 이제 요청 전에 헤더로 쓸 수 있는 형식인지 검사해 로그인 안내로 처리하고 사본을 지운다.
  it('손상된 사본(헤더에 못 쓰는 문자)은 "인터넷 문제"가 아니라 로그인 안내로 처리하고 사본을 지운다', async () => {
    const fetchImpl = vi.fn(async (_u: RequestInfo | URL, init?: RequestInit) => {
      new Headers(init?.headers); // 실제 fetch 처럼 잘못된 헤더 값이면 TypeError
      return json(200, todayBody());
    });
    const { d } = deps({ readToken: async () => 'abc\ndef', fetchImpl: fetchImpl as unknown as typeof fetch });
    expect((await runTakenAction(DATA, NOW - 1000, d)).kind).toBe('unauthorized');
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(d.forgetToken).toHaveBeenCalledWith('abc\ndef');
  });

  it('줄바꿈·한글·공백이 든 사본은 모두 요청 없이 로그인 안내', async () => {
    for (const bad of ['abc\r\ndef', '토큰', 'a b', ' jwt', 'jwt\t', 'a\u0000b']) {
      const fetchImpl = vi.fn(async () => json(200, todayBody()));
      const { d } = deps({ readToken: async () => bad, fetchImpl: fetchImpl as unknown as typeof fetch });
      expect((await runTakenAction(DATA, NOW - 1000, d)).kind).toBe('unauthorized');
      expect(fetchImpl).not.toHaveBeenCalled();
    }
  });
});

describe('QA: 결과 알림 — 같은 tag 덮어쓰기와 문구', () => {
  const outcomes: ActionOutcome[] = [
    { kind: 'recorded', takenAt: '2026-10-06T11:00:05Z' },
    { kind: 'recorded', takenAt: null },
    { kind: 'already' },
    { kind: 'unauthorized' },
    { kind: 'network' },
    { kind: 'server' },
    { kind: 'gone' },
    { kind: 'stale' },
  ];
  const successKinds = new Set(['recorded', 'already']);

  it('모든 결과가 원래 알림과 같은 tag 를 쓰고(쌓이지 않음) 버튼이 없고 silent 이다', () => {
    for (const o of outcomes) {
      const r = buildResultNotification(o, DATA, '초코 · 아조딜 1캡슐', 'med-1:2026-10-06:20:00')!;
      expect(r.options.tag).toBe('med-1:2026-10-06:20:00');
      expect(r.options.silent).toBe(true);
      expect(r.options.renotify).toBe(false);
      expect('actions' in r.options).toBe(false);
      expect(r.options.data).toMatchObject(DATA);
    }
  });

  it('실패 결과의 제목·본문에는 "기록했어요"가 없고, 성공 결과만 "기록"을 말한다', () => {
    for (const o of outcomes) {
      const r = buildResultNotification(o, DATA, '초코 · 아조딜 1캡슐', 'tag')!;
      const text = `${r.title} ${r.options.body}`;
      if (successKinds.has(o.kind)) continue;
      expect(text).not.toMatch(/기록했어요/);
      expect(text).not.toMatch(/먹였어요로/);
      expect(r.options.requireInteraction).toBe(true); // 실패는 저절로 사라지지 않는다
    }
    expect(buildResultNotification({ kind: 'already' }, DATA, 'b', 't')!.title).not.toMatch(/^먹였어요로 기록했어요$/);
  });

  it('로그인 만료 안내는 "아직 기록되지 않았어요"를 분명히 말한다', () => {
    expect(buildResultNotification({ kind: 'unauthorized' }, DATA, 'b', 't')!.options.body).toMatch(/기록되지 않았어요/);
  });

  it('금지어(findForbidden) 검사: 알림·큰 버튼의 모든 새 문구', () => {
    const texts = [
      ...Object.values(PUSH_ACTION_TEXT),
      recordedBodyText('초코 · 아조딜 1캡슐', '2026-10-06T11:00:05Z'),
      recordedBodyText('', null),
      bigDoseButtonLabel('아조딜 1캡슐', '오후 8:00'),
      ...outcomes.flatMap((o) => {
        const r = buildResultNotification(o, DATA, '초코 · 아조딜 1캡슐', 't')!;
        return [r.title, r.options.body];
      }),
    ];
    for (const t of texts) expect({ t, hit: findForbidden(t) }).toEqual({ t, hit: null });
  });

  it('원래 본문이 비어 있어도 성공 본문이 어색하지 않다(시각만)', () => {
    const r = buildResultNotification({ kind: 'recorded', takenAt: '2026-10-06T11:00:05Z' }, DATA, '', 't')!;
    expect(r.options.body).not.toMatch(/^ ?· /);
  });
});

describe('QA: 토큰 사본 저장소 — 손상·오류', () => {
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory();
  });
  const rawPut = (value: unknown) =>
    new Promise<void>((resolve, reject) => {
      const req = indexedDB.open('spn-sw', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('auth');
      req.onsuccess = () => {
        const tx = req.result.transaction('auth', 'readwrite');
        tx.objectStore('auth').put(value, 'accessToken');
        tx.oncomplete = () => {
          req.result.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
    });

  it('문자열이 아니거나 빈 값이면 읽기는 null(요청 보내지 않고 로그인 안내)', async () => {
    for (const bad of [123, '', { a: 1 }, null, ['x'], true]) {
      await rawPut(bad);
      expect(await readSwToken()).toBeNull();
    }
  });

  it('삭제·교체 중 IndexedDB 열기가 실패해도 예외 없이 끝나고 이후 작업은 계속된다', async () => {
    await saveSwToken('jwt-1');
    const real = globalThis.indexedDB;
    let broken = true;
    globalThis.indexedDB = { open: (...a: Parameters<IDBFactory['open']>) => { if (broken) throw new Error('quota'); return real.open(...a); } } as unknown as IDBFactory;
    await expect(clearSwToken()).resolves.toBe('failed'); // 열기가 계속 실패하면 재시도·덮어쓰기·deleteDatabase 도 못 한다
    await expect(saveSwToken('jwt-2')).resolves.toBeUndefined();
    await expect(clearSwTokenIfEquals('jwt-1')).resolves.toBeUndefined();
    await expect(swTokenSettled(200)).resolves.toBeUndefined();
    broken = false;
    expect(await readSwToken()).toBe('jwt-1'); // 실패한 삭제는 반영되지 않았다(사본이 남음 — 보고 참고)
    await saveSwToken('jwt-3'); // 큐가 막히지 않는다
    expect(await readSwToken()).toBe('jwt-3');
  });

  it('로그아웃(삭제) 직후 곧바로 다른 계정 로그인(저장)해도 순서대로 처리돼 새 토큰이 남는다', async () => {
    await saveSwToken('old');
    void clearSwToken();
    void saveSwToken('new');
    await swTokenSettled();
    expect(await readSwToken()).toBe('new');
  });

  it('저장 직후 삭제를 연달아 해도 마지막이 삭제면 사본이 없다', async () => {
    void saveSwToken('a');
    void saveSwToken('b');
    void clearSwToken();
    await swTokenSettled();
    expect(await readSwToken()).toBeNull();
  });
});
