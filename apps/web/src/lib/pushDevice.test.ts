import { describe, expect, it, vi } from 'vitest';
import type { Device } from './reminderApi';
import {
  PUSH_DEVICE_ID_KEY,
  PUSH_TOKEN_KEY,
  RegistrationSupersededError,
  registerThisDevice,
  releaseThisDevice,
  type PushDeviceDeps,
} from './pushDevice';

// 계약서 3장 Device 응답 예시
const DEVICE: Device = { id: 'uuid', platform: 'web', createdAt: '2026-10-06T00:00:00Z', lastSeenAt: '2026-10-06T00:00:00Z' };

function fakeDeps(overrides: Partial<PushDeviceDeps> = {}) {
  const order: string[] = [];
  const data = new Map<string, string>();
  const deps: PushDeviceDeps = {
    platform: 'web',
    getFcmToken: vi.fn(async () => 'fcm-token'),
    deleteFcmToken: vi.fn(async () => {
      order.push('deleteToken');
    }),
    registerDevice: vi.fn(async () => DEVICE),
    deleteDevice: vi.fn(async () => {
      order.push('DELETE');
      return null;
    }),
    store: {
      getItem: (k) => data.get(k) ?? null,
      setItem: (k, v) => void data.set(k, v),
      removeItem: (k) => {
        order.push(`remove ${k}`);
        data.delete(k);
      },
    },
    ...overrides,
  };
  return { deps, order, data };
}

describe('기기 등록', () => {
  it('FCM 토큰으로 PUT /api/devices {token, platform} 후 기기 id·토큰을 저장한다', async () => {
    const { deps, data } = fakeDeps();
    await expect(registerThisDevice(deps)).resolves.toEqual(DEVICE);
    expect(deps.registerDevice).toHaveBeenCalledWith({ token: 'fcm-token', platform: 'web' });
    expect(data.get(PUSH_DEVICE_ID_KEY)).toBe('uuid');
    expect(data.get(PUSH_TOKEN_KEY)).toBe('fcm-token');
  });

  it('서버 등록이 실패하면 오류를 던지고 아무것도 저장하지 않는다', async () => {
    const { deps, data } = fakeDeps({ registerDevice: vi.fn(async () => Promise.reject(new Error('500'))) });
    await expect(registerThisDevice(deps)).rejects.toThrow();
    expect(data.size).toBe(0);
  });
});

describe('기기 해제 (로그아웃·401)', () => {
  it('로그아웃: DELETE → deleteToken → 로컬 삭제 순서', async () => {
    const { deps, order, data } = fakeDeps();
    data.set(PUSH_DEVICE_ID_KEY, 'uuid');
    data.set(PUSH_TOKEN_KEY, 'fcm-token');
    await releaseThisDevice(deps, { server: true });
    expect(deps.deleteDevice).toHaveBeenCalledWith('uuid');
    expect(order).toEqual(['DELETE', 'deleteToken', `remove ${PUSH_DEVICE_ID_KEY}`, `remove ${PUSH_TOKEN_KEY}`]);
    expect(data.size).toBe(0);
  });

  it('DELETE 가 실패해도, 3초를 넘겨도 나머지 정리는 끝까지 한다', async () => {
    const failing = fakeDeps({ deleteDevice: vi.fn(async () => Promise.reject(new Error('404'))) });
    failing.data.set(PUSH_DEVICE_ID_KEY, 'uuid');
    await expect(releaseThisDevice(failing.deps, { server: true })).resolves.toBeUndefined();
    expect(failing.deps.deleteFcmToken).toHaveBeenCalled();
    expect(failing.data.size).toBe(0);

    vi.useFakeTimers();
    try {
      const slow = fakeDeps({ deleteDevice: vi.fn(() => new Promise(() => {})) });
      slow.data.set(PUSH_DEVICE_ID_KEY, 'uuid');
      const done = releaseThisDevice(slow.deps, { server: true });
      await vi.advanceTimersByTimeAsync(3000);
      await done;
      expect(slow.deps.deleteFcmToken).toHaveBeenCalled();
      expect(slow.data.size).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('401 강제 로그아웃: 서버 DELETE 없이 deleteToken + 로컬 삭제만', async () => {
    const { deps, data } = fakeDeps();
    data.set(PUSH_DEVICE_ID_KEY, 'uuid');
    await releaseThisDevice(deps, { server: false });
    expect(deps.deleteDevice).not.toHaveBeenCalled();
    expect(deps.deleteFcmToken).toHaveBeenCalled();
    expect(data.size).toBe(0);
  });

  it('저장된 기기 id 가 없으면 DELETE 를 부르지 않는다', async () => {
    const { deps } = fakeDeps();
    await releaseThisDevice(deps, { server: true });
    expect(deps.deleteDevice).not.toHaveBeenCalled();
  });
});

describe('QA 추가: 토큰 갱신·재등록', () => {
  it('토큰이 바뀌어 다시 등록하면 새 토큰이 저장된다', async () => {
    const tokens = ['old', 'new'];
    const { deps, data } = fakeDeps({ getFcmToken: vi.fn(async () => tokens.shift()!) });
    await registerThisDevice(deps);
    await registerThisDevice(deps);
    expect(deps.registerDevice).toHaveBeenNthCalledWith(2, { token: 'new', platform: 'web' });
    expect(data.get(PUSH_TOKEN_KEY)).toBe('new');
  });

  it('빈 토큰이면 서버 호출 없이 오류', async () => {
    const { deps } = fakeDeps({ getFcmToken: vi.fn(async () => '') });
    await expect(registerThisDevice(deps)).rejects.toThrow();
    expect(deps.registerDevice).not.toHaveBeenCalled();
  });

  it('deleteToken 이 실패해도 로컬 id·토큰은 지운다', async () => {
    const { deps, data } = fakeDeps({ deleteFcmToken: vi.fn(async () => Promise.reject(new Error('x'))) });
    data.set(PUSH_DEVICE_ID_KEY, 'uuid');
    data.set(PUSH_TOKEN_KEY, 't');
    await expect(releaseThisDevice(deps, { server: true })).resolves.toBeUndefined();
    expect(data.size).toBe(0);
  });
});

describe('해제 상한·등록 경쟁', () => {
  it('deleteToken 이 멈춰도 3초 뒤 로컬 삭제를 끝내고 반환한다(지연 작업은 백그라운드)', async () => {
    vi.useFakeTimers();
    try {
      const { deps, data } = fakeDeps({ deleteFcmToken: vi.fn(() => new Promise<void>(() => {})) });
      data.set(PUSH_DEVICE_ID_KEY, 'uuid');
      data.set(PUSH_TOKEN_KEY, 't');
      let finished = false;
      const done = releaseThisDevice(deps, { server: true }).then(() => (finished = true));
      await vi.advanceTimersByTimeAsync(2900);
      expect(finished).toBe(false);
      await vi.advanceTimersByTimeAsync(100);
      await done;
      expect(data.size).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('동시에 등록을 부르면 한 번만 돈다', async () => {
    const { deps } = fakeDeps();
    const [a, b] = await Promise.all([registerThisDevice(deps), registerThisDevice(deps)]);
    expect(a).toBe(b);
    expect(deps.registerDevice).toHaveBeenCalledTimes(1);
  });

  it('등록 중 해제되면 방금 만든 기기를 DELETE 하고 저장하지 않는다', async () => {
    let finish!: (d: Device) => void;
    const { deps, data } = fakeDeps({ registerDevice: vi.fn(() => new Promise<Device>((r) => (finish = r))) });
    const reg = registerThisDevice(deps);
    const caught = reg.catch((e) => e);
    await vi.waitFor(() => expect(deps.registerDevice).toHaveBeenCalled());
    const rel = releaseThisDevice(deps, { server: true });
    finish(DEVICE);
    await rel;
    expect(await caught).toBeInstanceOf(RegistrationSupersededError);
    expect(deps.deleteDevice).toHaveBeenCalledWith('uuid');
    expect(data.size).toBe(0);
  });
});
