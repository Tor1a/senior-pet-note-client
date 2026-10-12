import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearSwToken,
  CLEAR_RETRIES,
  JOB_TIMEOUT_MS,
  clearSwTokenIfEquals,
  readSwToken,
  saveSwToken,
  SW_TOKEN_DB,
  swTokenSettled,
} from './swTokenStore';

// 서비스워커 토큰 사본(IndexedDB). 새 가짜 IndexedDB 로 매 테스트를 시작한다.
beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

/** DB 에 들어 있는 모든 레코드(키·값)를 그대로 읽는다: 토큰 말고 다른 것이 저장되지 않았는지 보려고 */
async function dumpAll(): Promise<Array<[unknown, unknown]>> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(SW_TOKEN_DB, 1);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  const stores = Array.from(db.objectStoreNames);
  const out: Array<[unknown, unknown]> = [];
  for (const name of stores) {
    const store = db.transaction(name, 'readonly').objectStore(name);
    const keys = await new Promise<IDBValidKey[]>((r) => {
      const q = store.getAllKeys();
      q.onsuccess = () => r(q.result);
    });
    for (const k of keys) {
      const v = await new Promise<unknown>((r) => {
        const q = store.get(k);
        q.onsuccess = () => r(q.result);
      });
      out.push([k, v]);
    }
  }
  db.close();
  return out;
}

describe('swTokenStore', () => {
  it('저장하면 읽을 수 있고, 지우면 null', async () => {
    expect(await readSwToken()).toBeNull();
    await saveSwToken('jwt-a');
    expect(await readSwToken()).toBe('jwt-a');
    await clearSwToken();
    expect(await readSwToken()).toBeNull();
  });

  it('다시 저장하면 교체된다(다른 계정 로그인·비밀번호 변경 후 새 토큰)', async () => {
    await saveSwToken('jwt-a');
    await saveSwToken('jwt-b');
    expect(await readSwToken()).toBe('jwt-b');
  });

  it('토큰 문자열 하나만 저장한다(이메일 등 다른 값 없음)', async () => {
    await saveSwToken('jwt-a');
    const all = await dumpAll();
    expect(all).toEqual([['accessToken', 'jwt-a']]);
  });

  it('저장·삭제 요청은 호출 순서대로 처리된다(삭제 뒤 저장이면 남고, 저장 뒤 삭제면 지워진다)', async () => {
    void saveSwToken('old');
    void clearSwToken();
    void saveSwToken('new');
    await swTokenSettled();
    expect(await readSwToken()).toBe('new');
    void saveSwToken('x');
    void clearSwToken();
    await swTokenSettled();
    expect(await readSwToken()).toBeNull();
  });

  it('clearSwTokenIfEquals: 같은 토큰이면 지우고, 그사이 바뀌었으면(새 토큰) 지우지 않는다', async () => {
    await saveSwToken('stale');
    await clearSwTokenIfEquals('stale');
    expect(await readSwToken()).toBeNull();

    await saveSwToken('fresh');
    await clearSwTokenIfEquals('stale');
    expect(await readSwToken()).toBe('fresh');
  });

  it('IndexedDB 가 없으면 아무 일도 하지 않고 오류도 던지지 않는다', async () => {
    vi.stubGlobal('indexedDB', undefined);
    await expect(saveSwToken('a')).resolves.toBeUndefined();
    await expect(clearSwToken()).resolves.toBe('deleted'); // 지울 사본이 없다
    await expect(clearSwTokenIfEquals('a')).resolves.toBeUndefined();
    expect(await readSwToken()).toBeNull();
  });

  it('IndexedDB 열기가 실패해도 오류를 삼키고 읽기는 null', async () => {
    vi.stubGlobal('indexedDB', {
      open: () => {
        const req: Partial<IDBOpenDBRequest> = {};
        setTimeout(() => (req as { onerror: () => void }).onerror(), 0);
        return req as IDBOpenDBRequest;
      },
    });
    await expect(saveSwToken('a')).resolves.toBeUndefined();
    expect(await readSwToken()).toBeNull();
  });
});

describe('swTokenStore — 삭제 실패 대응', () => {
  /** 객체 저장소 메서드를 부수는 도우미: 부순 횟수를 센다 */
  function breakStore(method: 'delete' | 'put', times = Infinity) {
    const proto = IDBObjectStore.prototype as unknown as Record<string, (...a: unknown[]) => unknown>;
    const original = proto[method];
    let calls = 0;
    proto[method] = function (this: unknown, ...args: unknown[]) {
      calls += 1;
      if (calls <= times) throw new Error(`${method} failed`);
      return original.apply(this, args);
    };
    return {
      get calls() {
        return calls;
      },
      restore: () => {
        proto[method] = original;
      },
    };
  }

  it('삭제가 한 번 실패해도 다시 시도해 지운다(deleted)', async () => {
    await saveSwToken('jwt-a');
    const broken = breakStore('delete', 1);
    try {
      expect(await clearSwToken()).toBe('deleted');
      expect(broken.calls).toBe(2);
    } finally {
      broken.restore();
    }
    expect(await readSwToken()).toBeNull();
  });

  it('재시도(1+CLEAR_RETRIES 회)가 모두 실패하면 빈 문자열로 덮어쓰고(blanked), 서비스워커는 사본 없음으로 읽는다', async () => {
    await saveSwToken('jwt-a');
    const broken = breakStore('delete');
    try {
      expect(await clearSwToken()).toBe('blanked');
      expect(broken.calls).toBe(1 + CLEAR_RETRIES);
    } finally {
      broken.restore();
    }
    expect(await dumpAll()).toEqual([['accessToken', '']]);
    expect(await readSwToken()).toBeNull();
  });

  it('삭제도 덮어쓰기도 안 되면 데이터베이스를 통째로 지운다(database-deleted)', async () => {
    await saveSwToken('jwt-a');
    const del = breakStore('delete');
    const put = breakStore('put');
    try {
      expect(await clearSwToken()).toBe('database-deleted');
    } finally {
      del.restore();
      put.restore();
    }
    const names = await indexedDB.databases();
    expect(names.some((d) => d.name === SW_TOKEN_DB)).toBe(false);
    expect(await readSwToken()).toBeNull();
    await saveSwToken('jwt-b'); // 지운 뒤에도 다시 쓸 수 있다
    expect(await readSwToken()).toBe('jwt-b');
  });

  it('모두 실패하면 failed 를 돌려주되 오류를 던지지 않고 큐는 계속 흐른다', async () => {
    const real = globalThis.indexedDB;
    let broken = true;
    globalThis.indexedDB = {
      open: (...a: Parameters<IDBFactory['open']>) => {
        if (broken) throw new Error('quota');
        return real.open(...a);
      },
      deleteDatabase: () => {
        throw new Error('blocked');
      },
    } as unknown as IDBFactory;
    await expect(clearSwToken()).resolves.toBe('failed');
    broken = false;
    await saveSwToken('jwt-c');
    expect(await readSwToken()).toBe('jwt-c');
  });

  it('빈 문자열 사본은 읽기에서 null(요청 없이 로그인 안내)', async () => {
    await saveSwToken('');
    expect(await readSwToken()).toBeNull();
  });
});

describe('swTokenStore — 조건부 저장·삭제(탭 경합)', () => {
  it('saveSwToken: 트랜잭션 안에서 stillCurrent 가 false 면 저장하지 않는다', async () => {
    await saveSwToken('jwt-a', () => false);
    expect(await readSwToken()).toBeNull();
    await saveSwToken('jwt-a', () => true);
    expect(await readSwToken()).toBe('jwt-a');
  });

  it('clearSwToken: stillCleared 가 false 면(그사이 다른 탭이 새로 로그인) 지우지 않는다', async () => {
    await saveSwToken('jwt-new');
    expect(await clearSwToken(() => false)).toBe('deleted');
    expect(await readSwToken()).toBe('jwt-new');
    await clearSwToken(() => true);
    expect(await readSwToken()).toBeNull();
  });
});

// 응답 없는 요청이 큐를 막는 경우: 앞 테스트들에 영향이 없도록 맨 끝에 둔다
describe('swTokenStore — 멈춘 작업', () => {
  it('swTokenSettled 는 멈춘 작업이 있어도 제한 시간 뒤에 풀린다', async () => {
    vi.stubGlobal('indexedDB', { open: () => ({}) as IDBOpenDBRequest }); // 응답이 없는 요청
    void saveSwToken('a');
    const t0 = Date.now();
    await swTokenSettled(50);
    expect(Date.now() - t0).toBeLessThan(500);
  });

  it('응답 없는 작업은 제한 시간(JOB_TIMEOUT_MS) 뒤에 포기하고 뒤의 작업이 이어진다', async () => {
    vi.stubGlobal('indexedDB', { open: () => ({}) as IDBOpenDBRequest });
    void saveSwToken('stuck');
    vi.unstubAllGlobals();
    globalThis.indexedDB = new IDBFactory();
    await saveSwToken('after');
    expect(await readSwToken()).toBe('after');
  }, JOB_TIMEOUT_MS + 3000);
});
