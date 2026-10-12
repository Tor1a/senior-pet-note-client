import { describe, expect, it, vi } from 'vitest';
import {
  ACTION_MAX_AGE_MS,
  buildRecordingNotification,
  buildResultNotification,
  checkNotificationAge,
  isHeaderSafeToken,
  runTakenAction,
  type ActionDeps,
  type ActionOutcome,
} from './pushAction';
import { PUSH_ACTION_TEXT } from './pushActionText';
import type { MedReminderData } from './reminderApi';

// 알림 [먹였어요] 처리: 가짜 fetch·가짜 토큰 사본으로 모든 분기를 검사한다.
const NOW = Date.UTC(2026, 9, 6, 11, 0, 0); // 2026-10-06 20:00 KST
const DATA: MedReminderData = {
  type: 'med_reminder',
  medicationId: 'med-1',
  petId: 'pet-1',
  recordDate: '2026-10-06',
  scheduledTime: '20:00',
};
const FRESH = NOW - 60_000;

const json = (status: number, body: unknown) =>
  new Response(body === null ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const todayBody = (over: Record<string, unknown> = {}, taken = false) => ({
  recordDate: '2026-10-06',
  doses: [
    { medicationId: 'med-1', name: '아조딜', doseText: '1캡슐', scheduledTime: '20:00', taken, medLogId: taken ? 'l1' : null, takenAt: null },
  ],
  ...over,
});

interface Call {
  method: string;
  url: string;
  auth: string | null;
  body: unknown;
}

function setup(opts: {
  token?: string | null;
  today?: () => Response | Promise<Response>;
  post?: () => Response | Promise<Response>;
}) {
  const calls: Call[] = [];
  const forgetToken = vi.fn(async () => {});
  const readToken = vi.fn(async () => (opts.token === undefined ? 'jwt-1' : opts.token));
  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    const headers = (init?.headers ?? {}) as Record<string, string>;
    calls.push({
      method,
      url: String(input),
      auth: headers.Authorization ?? null,
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
    });
    if (method === 'GET') return (opts.today ?? (() => json(200, todayBody())))();
    return (opts.post ?? (() => json(201, { id: 'log-1', takenAt: '2026-10-06T11:00:05Z' })))();
  });
  const deps: ActionDeps = {
    baseUrl: 'https://api.example.test',
    readToken,
    forgetToken,
    fetchImpl: fetchImpl as unknown as typeof fetch,
    now: () => NOW,
    timeoutMs: 200,
  };
  return { calls, forgetToken, readToken, fetchImpl, deps };
}

const posts = (calls: Call[]) => calls.filter((c) => c.method === 'POST');

describe('checkNotificationAge', () => {
  it('1시간 이내는 ok, 정확히 1시간까지 ok, 넘으면 stale', () => {
    expect(checkNotificationAge(NOW - 1000, NOW)).toBe('ok');
    expect(checkNotificationAge(NOW - ACTION_MAX_AGE_MS, NOW)).toBe('ok');
    expect(checkNotificationAge(NOW - ACTION_MAX_AGE_MS - 1, NOW)).toBe('stale');
  });
  it('시각이 없거나 이상하면 unknown(앱 열기), 미래로 크게 어긋나도 unknown', () => {
    for (const bad of [undefined, null, 0, -5, NaN, '1700000000000']) expect(checkNotificationAge(bad, NOW)).toBe('unknown');
    expect(checkNotificationAge(NOW + 60_000, NOW)).toBe('ok'); // 작은 시계 오차는 허용
    expect(checkNotificationAge(NOW + 10 * 60_000, NOW)).toBe('unknown');
  });
});

describe('runTakenAction — 성공', () => {
  it('오늘 화면의 recordDate 가 같고 아직 안 먹였으면 POST 하고 201 이면 recorded(서버 기록 시각 포함)', async () => {
    const { calls, deps, readToken } = setup({});
    const out = await runTakenAction(DATA, FRESH, deps);
    expect(out).toEqual({ kind: 'recorded', takenAt: '2026-10-06T11:00:05Z' });
    expect(readToken).toHaveBeenCalledTimes(1);
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      'GET https://api.example.test/api/pets/pet-1/today',
      'POST https://api.example.test/api/med-logs',
    ]);
    expect(calls.every((c) => c.auth === 'Bearer jwt-1')).toBe(true);
    // 날짜는 보내지 않는다(서버가 정한다)
    expect(calls[1].body).toEqual({ medicationId: 'med-1', scheduledTime: '20:00' });
  });

  it('201 본문이 비어 있어도 기록으로 본다(takenAt 만 없음)', async () => {
    const { deps } = setup({ post: () => json(201, null) });
    expect(await runTakenAction(DATA, FRESH, deps)).toEqual({ kind: 'recorded', takenAt: null });
  });

  it('POST 가 409 ALREADY_CHECKED 면 성공(already)으로 취급', async () => {
    const { deps, forgetToken } = setup({ post: () => json(409, { code: 'ALREADY_CHECKED', message: 'x' }) });
    expect(await runTakenAction(DATA, FRESH, deps)).toEqual({ kind: 'already' });
    expect(forgetToken).not.toHaveBeenCalled();
  });

  it('오늘 목록에서 이미 먹인 회차면 POST 없이 already', async () => {
    const { calls, deps } = setup({ today: () => json(200, todayBody({}, true)) });
    expect(await runTakenAction(DATA, FRESH, deps)).toEqual({ kind: 'already' });
    expect(posts(calls)).toHaveLength(0);
  });
});

describe('runTakenAction — 체크하지 않는 경우(안전장치)', () => {
  it('날짜 불일치: 서버의 recordDate 가 알림의 recordDate 와 다르면 POST 하지 않고 stale', async () => {
    const { calls, deps } = setup({ today: () => json(200, todayBody({ recordDate: '2026-10-07' })) });
    expect(await runTakenAction(DATA, FRESH, deps)).toEqual({ kind: 'stale' });
    expect(posts(calls)).toHaveLength(0);
  });

  it('1시간 초과: 아무 요청도 보내지 않고 stale', async () => {
    const { calls, deps, readToken } = setup({});
    expect(await runTakenAction(DATA, NOW - ACTION_MAX_AGE_MS - 1, deps)).toEqual({ kind: 'stale' });
    expect(calls).toHaveLength(0);
    expect(readToken).not.toHaveBeenCalled();
  });

  it('알림 시각이 없으면 보수적으로 앱 열기(요청 없음)', async () => {
    const { calls, deps } = setup({});
    expect(await runTakenAction(DATA, undefined, deps)).toEqual({ kind: 'open-app' });
    expect(calls).toHaveLength(0);
  });

  it('알림 data 를 읽을 수 없으면 앱 열기(요청 없음)', async () => {
    const { calls, deps } = setup({});
    expect(await runTakenAction(null, FRESH, deps)).toEqual({ kind: 'open-app' });
    expect(calls).toHaveLength(0);
  });

  it('토큰 사본이 없으면 요청 없이 unauthorized(로그인 안내)', async () => {
    for (const token of [null, '']) {
      const { calls, deps, forgetToken } = setup({ token });
      expect(await runTakenAction(DATA, FRESH, deps)).toEqual({ kind: 'unauthorized' });
      expect(calls).toHaveLength(0);
      expect(forgetToken).not.toHaveBeenCalled();
    }
  });

  it('오늘 목록에 그 회차가 없으면(약을 뺐거나 시각이 바뀜) POST 없이 gone', async () => {
    const { calls, deps } = setup({ today: () => json(200, todayBody({ doses: [] })) });
    expect(await runTakenAction(DATA, FRESH, deps)).toEqual({ kind: 'gone' });
    expect(posts(calls)).toHaveLength(0);
  });
});

describe('runTakenAction — 실패 분류', () => {
  it('GET /today 가 401 이면 사본을 지우고(그 토큰만) unauthorized, POST 안 함', async () => {
    const { calls, deps, forgetToken } = setup({ today: () => json(401, { code: 'UNAUTHORIZED' }) });
    expect(await runTakenAction(DATA, FRESH, deps)).toEqual({ kind: 'unauthorized' });
    expect(forgetToken).toHaveBeenCalledWith('jwt-1');
    expect(posts(calls)).toHaveLength(0);
  });

  it('POST 가 401 이어도 사본을 지우고 unauthorized', async () => {
    const { deps, forgetToken } = setup({ post: () => json(401, { code: 'UNAUTHORIZED' }) });
    expect(await runTakenAction(DATA, FRESH, deps)).toEqual({ kind: 'unauthorized' });
    expect(forgetToken).toHaveBeenCalledWith('jwt-1');
  });

  it('오프라인: GET 이든 POST 든 fetch 가 실패하면 network (재시도·대기열 없음)', async () => {
    const a = setup({});
    a.fetchImpl.mockRejectedValue(new TypeError('Failed to fetch'));
    expect(await runTakenAction(DATA, FRESH, a.deps)).toEqual({ kind: 'network' });
    expect(a.calls).toHaveLength(0);
    expect(a.fetchImpl).toHaveBeenCalledTimes(1);

    const b = setup({ post: () => Promise.reject(new TypeError('Failed to fetch')) });
    expect(await runTakenAction(DATA, FRESH, b.deps)).toEqual({ kind: 'network' });
    expect(posts(b.calls)).toHaveLength(1);
  });

  it('응답이 한도 시간 안에 오지 않으면 network', async () => {
    const { deps, fetchImpl } = setup({});
    fetchImpl.mockImplementation(
      (_i: RequestInfo | URL, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
        }),
    );
    expect(await runTakenAction(DATA, FRESH, deps)).toEqual({ kind: 'network' });
  });

  it('400(일정에 없는 시각)·404(삭제된 약/반려동물)는 gone', async () => {
    for (const status of [400, 404]) {
      const p = setup({ post: () => json(status, { code: 'VALIDATION_ERROR' }) });
      expect(await runTakenAction(DATA, FRESH, p.deps)).toEqual({ kind: 'gone' });
      const g = setup({ today: () => json(status, { code: 'NOT_FOUND' }) });
      expect(await runTakenAction(DATA, FRESH, g.deps)).toEqual({ kind: 'gone' });
    }
  });

  it('5xx·알 수 없는 409·이상한 응답은 server (기록했다고 하지 않는다)', async () => {
    expect(await runTakenAction(DATA, FRESH, setup({ post: () => json(500, { code: 'X' }) }).deps)).toEqual({ kind: 'server' });
    expect(await runTakenAction(DATA, FRESH, setup({ post: () => json(409, { code: 'OTHER' }) }).deps)).toEqual({ kind: 'server' });
    expect(await runTakenAction(DATA, FRESH, setup({ post: () => json(200, { id: 'x' }) }).deps)).toEqual({ kind: 'server' });
    expect(await runTakenAction(DATA, FRESH, setup({ today: () => json(503, null) }).deps)).toEqual({ kind: 'server' });
    expect(await runTakenAction(DATA, FRESH, setup({ today: () => json(200, { doses: [] }) }).deps)).toEqual({ kind: 'server' });
    expect(await runTakenAction(DATA, FRESH, setup({ today: () => new Response('<html>', { status: 200 }) }).deps)).toEqual({ kind: 'server' });
  });
});

describe('buildResultNotification', () => {
  const BODY = '초코 · 아조딜 1캡슐';
  const TAG = 'med-1:2026-10-06:20:00';
  const build = (o: ActionOutcome) => buildResultNotification(o, DATA, BODY, TAG);

  it('기록됨: 같은 tag 로 덮어쓰고 소리 없이, 버튼 없이, 서버 기록 시각을 본문에 붙인다', () => {
    const r = build({ kind: 'recorded', takenAt: '2026-10-06T11:00:05Z' })!;
    expect(r.title).toBe('먹였어요로 기록했어요');
    expect(r.options.body).toBe('초코 · 아조딜 1캡슐 · 20:00');
    expect(r.options.tag).toBe(TAG);
    expect(r.options.silent).toBe(true);
    expect(r.options.renotify).toBe(false);
    expect(r.options.requireInteraction).toBe(false);
    expect('actions' in r.options).toBe(false);
    expect(r.options.data).toEqual({ ...DATA, result: 'recorded' });
  });

  it('이미 기록됨(409)은 기록된 것처럼 말하지 않고 사실대로', () => {
    const r = build({ kind: 'already' })!;
    expect(r.title).toBe('이미 먹였다고 기록돼 있어요');
    expect(r.options.body).toBe(BODY);
    expect(r.options.data.result).toBe('recorded');
  });

  it.each([
    ['unauthorized', '다시 로그인이 필요해요', PUSH_ACTION_TEXT.loginBody],
    ['network', '기록하지 못했어요', PUSH_ACTION_TEXT.failNetwork],
    ['server', '기록하지 못했어요', PUSH_ACTION_TEXT.failServer],
    ['gone', '기록하지 못했어요', PUSH_ACTION_TEXT.failGone],
    ['stale', '기록하지 못했어요', PUSH_ACTION_TEXT.failStale],
  ] as const)('실패(%s): "기록했어요"가 없고 눌러서 앱에서 확인하게 하며 사라지지 않는다', (kind, title, body) => {
    const r = build({ kind })!;
    expect(r.title).toBe(title);
    expect(r.options.body).toBe(body);
    expect(`${r.title} ${r.options.body}`).not.toContain('기록했어요');
    expect(r.options.requireInteraction).toBe(true);
    expect(r.options.tag).toBe(TAG);
    expect(r.options.data).toEqual({ ...DATA, result: 'failed' });
    expect('actions' in r.options).toBe(false);
  });

  it('open-app 은 알림을 만들지 않는다', () => {
    expect(build({ kind: 'open-app' })).toBeNull();
  });

  it('원래 알림 tag 가 비어 있으면 회차 키로 tag 를 만든다', () => {
    expect(buildResultNotification({ kind: 'server' }, DATA, BODY, '')!.options.tag).toBe(TAG);
  });
});

describe('isHeaderSafeToken', () => {
  it('JWT 같은 눈에 보이는 ASCII 는 통과, 공백·줄바꿈·한글·빈 값은 거절', () => {
    expect(isHeaderSafeToken('eyJhbGciOi.eyJzdWIiOiIx.c2ln-_')).toBe(true);
    expect(isHeaderSafeToken('jwt-1')).toBe(true);
    for (const bad of ['', ' ', 'a b', 'a\nb', 'a\r\nb', '토큰', 'a\tb', 'a\u007fb']) expect(isHeaderSafeToken(bad)).toBe(false);
  });
});

describe('buildRecordingNotification ("기록하는 중이에요")', () => {
  const raw = { FCM_MSG: { data: { medicationId: 'med-1' } } };

  it('원래 알림과 같은 tag·본문, 소리 없음, 버튼 없음, 원래 data 유지', () => {
    const r = buildRecordingNotification(DATA, '초코 · 아조딜 1캡슐', 'tag-1', raw);
    expect(r.title).toBe(PUSH_ACTION_TEXT.recordingTitle);
    expect(r.options).toMatchObject({ body: '초코 · 아조딜 1캡슐', tag: 'tag-1', silent: true, renotify: false });
    expect(r.options.data).toBe(raw);
    expect('actions' in r.options).toBe(false);
    expect('requireInteraction' in r.options).toBe(false);
  });

  it('원래 tag 가 비어 있으면 collapse key 형식으로 만든다(결과 알림과 같은 규칙)', () => {
    const r = buildRecordingNotification(DATA, '', '', raw);
    const result = buildResultNotification({ kind: 'already' }, DATA, '', '')!;
    expect(r.options.tag).toBe(result.options.tag);
  });
});
