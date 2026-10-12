// 서비스워커용 로그인 토큰 사본 (IndexedDB) — 기획서 알림-바로-체크 4-3, 6장
// 서비스워커는 localStorage 를 읽을 수 없어서, 알림 버튼([먹였어요])으로 체크 요청을 보내려면 토큰 사본이 필요하다.
// 규칙(리뷰어 필수 검토)
//  - 사본에는 토큰 문자열 하나만 둔다(이메일 등 다른 정보 금지). 토큰·본문을 로그나 알림에 남기지 않는다.
//  - 쓰기(save)·전체 삭제(clear)는 "페이지" 쪽(tokenStorage.ts)만 한다. 서비스워커는 읽기(read)만 하고 갱신하지 않는다.
//    단 서버가 401 을 알려 준 "그 토큰"만 지울 수 있다(clearIfEquals). 그사이 새 토큰으로 바뀌었다면 지우지 않는다.
//  - 로그아웃·401 강제 로그아웃·탈퇴·토큰 교체는 모두 tokenStorage.setToken/clearToken 을 지나므로 사본도 함께 바뀐다.
//  - IndexedDB 를 못 쓰는 환경(시크릿 모드 등)에서는 조용히 건너뛴다(그 환경에서는 알림 버튼이 로그인 만료 안내로 끝난다).
//  - 삭제는 보안상 중요하다(로그아웃 뒤에도 토큰이 남으면 안 된다): 실패하면 재시도 → 빈 문자열 덮어쓰기 → deleteDatabase 순으로 없애고,
//    결과를 돌려줘 호출한 쪽이 알 수 있게 한다(로그아웃 자체는 막지 않는다). 서비스워커는 빈 문자열을 "사본 없음"으로 본다.
// 쓰기 순서가 뒤바뀌지 않도록 변경 작업은 한 줄(큐)로 처리한다.

export const SW_TOKEN_DB = 'spn-sw';
const STORE = 'auth';
const KEY = 'accessToken';

function factory(): IDBFactory | null {
  try {
    return typeof indexedDB === 'undefined' ? null : indexedDB;
  } catch {
    return null;
  }
}

function openDb(idb: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = idb.open(SW_TOKEN_DB, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => {
      const db = req.result;
      // 다른 탭·워커가 버전을 올리려 하면 연결을 닫아 막지 않는다
      db.onversionchange = () => db.close();
      resolve(db);
    };
    req.onerror = () => reject(req.error ?? new Error('indexeddb open failed'));
    req.onblocked = () => reject(new Error('indexeddb blocked'));
  });
}

/** 한 번의 트랜잭션을 실행하고 완료될 때까지 기다린다. 연결은 항상 닫는다 */
async function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore, done: (value: T) => void) => void,
): Promise<T | null> {
  const idb = factory();
  if (!idb) return null;
  const db = await openDb(idb);
  try {
    return await new Promise<T | null>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      let value: T | null = null;
      tx.oncomplete = () => resolve(value);
      tx.onerror = () => reject(tx.error ?? new Error('indexeddb transaction failed'));
      tx.onabort = () => reject(tx.error ?? new Error('indexeddb transaction aborted'));
      run(tx.objectStore(STORE), (v) => {
        value = v;
      });
    });
  } finally {
    db.close();
  }
}

// ── 쓰기 큐 (페이지 쪽) ────────────────────────────────────────────────

let chain: Promise<unknown> = Promise.resolve();

/** 작업 하나의 대기 한도. 응답 없는 IndexedDB 요청 하나가 뒤의 삭제까지 영영 막지 않게 한다 */
export const JOB_TIMEOUT_MS = 2500;

/** 변경 작업을 앞 작업이 끝난 뒤에 실행한다. 실패·시간 초과해도 큐는 계속 흐르고 오류는 삼킨다(토큰 값은 로그에 남기지 않는다) */
function enqueue<T>(job: () => Promise<T>, onError: T): Promise<T> {
  const limited = () =>
    new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('indexeddb job timed out')), JOB_TIMEOUT_MS);
      job().then(
        (v) => {
          clearTimeout(timer);
          resolve(v);
        },
        (e) => {
          clearTimeout(timer);
          reject(e);
        },
      );
    });
  const next = chain.then(limited).then(
    (v) => v,
    () => onError,
  );
  chain = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

/**
 * 토큰 사본을 저장(교체)한다. 토큰 문자열만 저장한다.
 * stillCurrent 를 주면 "쓰기 트랜잭션 안에서" 그 시점에 true 일 때만 저장한다: 다른 탭이 그사이 로그아웃·토큰 교체를 했다면
 * (localStorage 가 바뀌었다면) 낡은 토큰으로 사본을 되살리지 않는다. localStorage 읽기는 동기라 확인과 put 사이에 끼어들 틈이 없고,
 * 다른 탭의 로그아웃은 localStorage 를 먼저 지운 뒤에 삭제 트랜잭션을 만들므로 순서가 항상 맞는다.
 */
export function saveSwToken(token: string, stillCurrent?: () => boolean): Promise<void> {
  return enqueue(
    () =>
      withStore<void>('readwrite', (store) => {
        if (stillCurrent && !stillCurrent()) return;
        store.put(token, KEY);
      }),
    undefined,
  ).then(() => undefined);
}

/**
 * 사본 삭제 결과
 *  deleted          : 레코드를 지웠다(또는 저장소가 없어 지울 것이 없다)
 *  blanked          : 지우지 못해 빈 문자열로 덮어썼다(서비스워커는 빈 값을 "사본 없음"으로 본다)
 *  database-deleted : 덮어쓰기도 못 해 데이터베이스 통째로 지웠다
 *  failed           : 모두 실패했다(사본이 남아 있을 수 있다)
 */
export type SwTokenClearResult = 'deleted' | 'blanked' | 'database-deleted' | 'failed';

/** 삭제 실패 시 다시 시도하는 횟수와 간격 */
export const CLEAR_RETRIES = 2;
const CLEAR_RETRY_DELAY_MS = 50;
const DELETE_DATABASE_TIMEOUT_MS = 1500;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function deleteDatabase(idb: IDBFactory): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => resolve(false), DELETE_DATABASE_TIMEOUT_MS);
    const done = (ok: boolean) => {
      clearTimeout(timer);
      resolve(ok);
    };
    try {
      const req = idb.deleteDatabase(SW_TOKEN_DB);
      req.onsuccess = () => done(true);
      req.onerror = () => done(false);
      req.onblocked = () => {
        // 다른 연결이 닫히길 기다린다(제한 시간 안에 풀리면 onsuccess)
      };
    } catch {
      done(false);
    }
  });
}

/**
 * 토큰 사본을 지운다(로그아웃·401·탈퇴). 로그아웃을 막지 않도록 오류를 던지지 않고 결과만 돌려준다.
 * 삭제가 실패하면 1) 다시 시도(CLEAR_RETRIES 회) 2) 빈 문자열로 덮어쓰기 3) deleteDatabase 순서로 사본을 없앤다.
 * stillCleared 를 주면 트랜잭션 안에서 그 시점에 true 일 때만 지운다(앱 시작 때의 정리가 그사이 다른 탭이 새로 로그인해 둔 사본을 지우지 않게).
 */
export function clearSwToken(stillCleared?: () => boolean): Promise<SwTokenClearResult> {
  return enqueue<SwTokenClearResult>(async () => {
    const idb = factory();
    if (!idb) return 'deleted';
    for (let attempt = 0; attempt <= CLEAR_RETRIES; attempt += 1) {
      if (attempt > 0) await sleep(CLEAR_RETRY_DELAY_MS);
      try {
        await withStore<void>('readwrite', (store) => {
          if (stillCleared && !stillCleared()) return;
          store.delete(KEY);
        });
        return 'deleted';
      } catch {
        // 다시 시도
      }
    }
    try {
      await withStore<void>('readwrite', (store) => {
        if (stillCleared && !stillCleared()) return;
        store.put('', KEY);
      });
      return 'blanked';
    } catch {
      // 데이터베이스 통째로 삭제
    }
    return (await deleteDatabase(idb)) ? 'database-deleted' : 'failed';
  }, 'failed');
}

/** 저장된 사본이 `token` 과 같을 때만 지운다(서비스워커가 401 을 받았을 때, 그사이 새 토큰으로 바뀐 경우를 지키려고) */
export function clearSwTokenIfEquals(token: string): Promise<void> {
  return enqueue(
    () =>
      withStore<void>('readwrite', (store) => {
        const get = store.get(KEY);
        get.onsuccess = () => {
          if (get.result === token) store.delete(KEY);
        };
      }),
    undefined,
  ).then(() => undefined);
}

/** 지금까지 요청한 사본 변경이 끝나길 기다린다(최대 timeoutMs). 로그아웃 직후 화면을 넘기기 전에 쓴다 */
export function swTokenSettled(timeoutMs = 1000): Promise<void> {
  return new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, timeoutMs);
    void chain.then(
      () => {
        clearTimeout(timer);
        resolve();
      },
      () => {
        clearTimeout(timer);
        resolve();
      },
    );
  });
}

// ── 읽기 (서비스워커) ──────────────────────────────────────────────────

/** 저장된 토큰 사본. 없거나 읽을 수 없으면 null */
export async function readSwToken(): Promise<string | null> {
  try {
    const value = await withStore<unknown>('readonly', (store, done) => {
      const get = store.get(KEY);
      get.onsuccess = () => done(get.result);
    });
    return typeof value === 'string' && value ? value : null;
  } catch {
    return null;
  }
}
