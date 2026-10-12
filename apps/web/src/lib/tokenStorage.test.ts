// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readSwToken, saveSwToken, swTokenSettled } from './swTokenStore';
import { clearToken, getToken, setToken, swTokenCopySettled, syncSwTokenCopy } from './tokenStorage';

// 토큰 사본(IndexedDB)의 수명과 탭 경합 (알림-바로-체크 리뷰 권장 2~4)
//  - 사본은 localStorage 토큰보다 오래 살지 않는다: 메모리 토큰 모드(localStorage 불가)에서는 쓰지 않고 있으면 지운다
//  - 낡은 탭의 저장이 다른 탭의 로그아웃 뒤에 사본을 되살리지 않는다(쓰기 트랜잭션 안에서 그 시점 localStorage 값과 같을 때만 저장)

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  localStorage.clear();
});
afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  clearToken();
});

const copy = async () => {
  await swTokenSettled();
  return readSwToken();
};

describe('두 탭 경합', () => {
  it('낡은 탭이 시작 동기화를 하는 사이 다른 탭이 로그아웃하면 사본이 되살아나지 않는다', async () => {
    localStorage.setItem('spn.accessToken', 'jwt-old');
    await saveSwToken('jwt-old');
    // 탭 A: 시작 동기화 시작(localStorage 에서 jwt-old 를 읽고 저장을 큐에 넣는다)
    syncSwTokenCopy();
    // 탭 B: 같은 순간 로그아웃 — localStorage 를 먼저 지운 뒤 사본 삭제
    localStorage.removeItem('spn.accessToken');
    clearToken();
    expect(await copy()).toBeNull();
  });

  it('다른 탭이 로그아웃하고 사본까지 지운 "뒤에" 낡은 탭의 저장이 실행돼도 사본은 비어 있다', async () => {
    localStorage.setItem('spn.accessToken', 'jwt-old');
    syncSwTokenCopy(); // 큐에 들어간 저장(토큰 jwt-old)
    localStorage.removeItem('spn.accessToken'); // 다른 탭의 로그아웃이 localStorage 를 지움(공유 저장소)
    expect(await copy()).toBeNull(); // 저장이 실행될 때 localStorage 가 달라져 있으므로 쓰지 않는다
  });

  it('토큰이 다른 값으로 바뀌었다면(다른 탭의 새 로그인) 낡은 값은 저장하지 않는다', async () => {
    localStorage.setItem('spn.accessToken', 'jwt-old');
    syncSwTokenCopy();
    localStorage.setItem('spn.accessToken', 'jwt-new');
    expect(await copy()).toBeNull();
    syncSwTokenCopy();
    expect(await copy()).toBe('jwt-new');
  });

  it('로그인 상태가 아닌 낡은 탭의 시작 정리가 다른 탭이 방금 새로 저장한 사본을 지우지 않는다', async () => {
    syncSwTokenCopy(); // 토큰 없음 → 삭제 요청이 큐에 들어감
    localStorage.setItem('spn.accessToken', 'jwt-fresh'); // 다른 탭이 로그인
    await saveSwToken('jwt-fresh');
    expect(await copy()).toBe('jwt-fresh');
  });

  it('정상 흐름: 로그인하면 저장, 앱 시작 동기화는 같은 값 저장, 로그아웃하면 삭제', async () => {
    setToken('jwt-a');
    expect(await copy()).toBe('jwt-a');
    await saveSwToken('stale');
    syncSwTokenCopy();
    expect(await copy()).toBe('jwt-a');
    clearToken();
    expect(await copy()).toBeNull();
  });
});

describe('메모리 토큰 모드(localStorage 불가)', () => {
  const blockStorage = () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
      removeItem: () => {
        throw new Error('denied');
      },
    });
  };

  it('사본을 쓰지 않는다: 로그인해도 사본이 생기지 않고, 앱은 메모리 토큰으로 동작한다', async () => {
    blockStorage();
    setToken('jwt-mem');
    expect(getToken()).toBe('jwt-mem');
    expect(await copy()).toBeNull();
  });

  it('남아 있던 사본은 즉시 지운다(사본 수명 ≤ 토큰 수명)', async () => {
    await saveSwToken('jwt-leftover');
    blockStorage();
    setToken('jwt-mem');
    expect(await copy()).toBeNull();
    await saveSwToken('jwt-leftover-2');
    syncSwTokenCopy(); // 앱 시작 때도 같다
    expect(await copy()).toBeNull();
  });

  it('localStorage 객체 자체가 없어도 같다', async () => {
    vi.stubGlobal('localStorage', undefined);
    await saveSwToken('jwt-leftover');
    setToken('jwt-mem');
    expect(await copy()).toBeNull();
  });
});

describe('삭제 결과 알림 (swTokenCopySettled)', () => {
  it('삭제를 한 적이 없거나 성공하면 true', async () => {
    expect(await swTokenCopySettled()).toBe(true);
    setToken('jwt-a');
    clearToken();
    expect(await swTokenCopySettled()).toBe(true);
  });

  it('삭제가 끝내 실패하면 false 를 돌려주되 오류는 던지지 않는다(로그아웃은 막히지 않는다)', async () => {
    setToken('jwt-a');
    await swTokenSettled();
    const real = globalThis.indexedDB;
    globalThis.indexedDB = {
      open: () => {
        throw new Error('quota');
      },
      deleteDatabase: () => {
        throw new Error('blocked');
      },
    } as unknown as IDBFactory;
    clearToken();
    expect(getToken()).toBeNull(); // 로그아웃 자체는 이미 끝났다
    expect(await swTokenCopySettled()).toBe(false);
    globalThis.indexedDB = real;
  });
});
