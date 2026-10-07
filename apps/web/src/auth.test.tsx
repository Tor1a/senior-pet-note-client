// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from './auth';
import { UNAUTHORIZED_EVENT } from './lib/client';
import { PUSH_DEVICE_ID_KEY, PUSH_TOKEN_KEY } from './lib/pushDevice';
import { getToken, setToken } from './lib/tokenStorage';

// 로그아웃 시 이 기기 알림 해제 순서 (기획서 C5·C6, 계약 1장 4)
// Firebase 설정이 없는 테스트 환경이라 Firebase 는 불러오지 않는다.

interface Call {
  method: string;
  path: string;
  auth: string | null;
}

function mockServer(deleteDevice: () => Promise<Response> | Response) {
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      const method = init?.method ?? 'GET';
      const headers = (init?.headers ?? {}) as Record<string, string>;
      calls.push({ method, path: url.pathname, auth: headers.Authorization ?? null });
      if (url.pathname === '/api/me') return new Response(JSON.stringify({ id: 'u1', email: 'a@b.c' }), { status: 200 });
      if (method === 'DELETE' && url.pathname === '/api/devices/uuid') return deleteDevice();
      return new Response(null, { status: 404 });
    }),
  );
  return calls;
}

function Probe() {
  const { status, logout } = useAuth();
  return (
    <>
      <p data-testid="status">{status}</p>
      <button type="button" onClick={() => void logout()}>
        로그아웃
      </button>
    </>
  );
}

function renderAuth() {
  render(
    <MemoryRouter>
      <AuthProvider>
        <Probe />
      </AuthProvider>
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('로그아웃 — 이 기기 알림 해제', () => {
  it('로그인 토큰을 지우기 전에 DELETE /api/devices/{id} 를 보내고, 로컬 기기 id 도 지운다', async () => {
    setToken('test-token');
    localStorage.setItem(PUSH_DEVICE_ID_KEY, 'uuid');
    localStorage.setItem(PUSH_TOKEN_KEY, 'fcm-token');
    const calls = mockServer(() => new Response(null, { status: 204 }));
    renderAuth();
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('signedIn'));

    await userEvent.setup().click(screen.getByRole('button', { name: '로그아웃' }));
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('signedOut'));

    const del = calls.find((c) => c.method === 'DELETE');
    expect(del).toEqual({ method: 'DELETE', path: '/api/devices/uuid', auth: 'Bearer test-token' });
    expect(getToken()).toBeNull();
    expect(localStorage.getItem(PUSH_DEVICE_ID_KEY)).toBeNull();
    expect(localStorage.getItem(PUSH_TOKEN_KEY)).toBeNull();
  });

  it('DELETE 가 실패해도 로그아웃은 끝난다', async () => {
    setToken('test-token');
    localStorage.setItem(PUSH_DEVICE_ID_KEY, 'uuid');
    mockServer(() => new Response(JSON.stringify({ code: 'NOT_FOUND', message: 'x' }), { status: 404 }));
    renderAuth();
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('signedIn'));
    await userEvent.setup().click(screen.getByRole('button', { name: '로그아웃' }));
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('signedOut'));
    expect(localStorage.getItem(PUSH_DEVICE_ID_KEY)).toBeNull();
  });

  it('401 강제 로그아웃: 서버 DELETE 없이 로컬 기기 id 만 지운다', async () => {
    setToken('test-token');
    localStorage.setItem(PUSH_DEVICE_ID_KEY, 'uuid');
    const calls = mockServer(() => new Response(null, { status: 204 }));
    renderAuth();
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('signedIn'));

    window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('signedOut'));
    await waitFor(() => expect(localStorage.getItem(PUSH_DEVICE_ID_KEY)).toBeNull());
    expect(calls.some((c) => c.method === 'DELETE')).toBe(false);
  });
});
