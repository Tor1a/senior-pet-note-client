// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from './auth';
import { api } from './lib/client';
import { readSwToken, saveSwToken, swTokenSettled } from './lib/swTokenStore';
import { clearToken, getToken, setToken } from './lib/tokenStorage';

// 알림 버튼용 서비스워커 토큰 사본(IndexedDB)이 로그인 토큰(localStorage)과 어긋나지 않는지:
// 로그인·가입·토큰 교체(비밀번호 변경)·다른 계정 로그인 때는 새 토큰으로 바뀌고,
// 로그아웃·401 강제 로그아웃·회원 탈퇴·clearToken 에서는 반드시 지워진다. (기획서 알림-바로-체크 6장, 리뷰어 필수 검토)

const json = (status: number, body: unknown) =>
  new Response(body === null ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

let meStatus = 200;
beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  meStatus = 200;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      const method = init?.method ?? 'GET';
      if (url.pathname === '/api/me') return meStatus === 200 ? json(200, { id: 'u1', email: 'a@b.c' }) : json(meStatus, { code: 'UNAUTHORIZED' });
      if (url.pathname === '/api/auth/login') {
        const { email } = JSON.parse(String(init?.body)) as { email: string };
        return json(200, { accessToken: `jwt-${email}`, user: { id: email, email } });
      }
      if (url.pathname === '/api/auth/signup') return json(201, { accessToken: 'jwt-new', user: { id: 'n', email: 'n@b.c' } });
      if (method === 'GET' && url.pathname === '/api/pets') return json(401, { code: 'UNAUTHORIZED' });
      return json(404, { code: 'NOT_FOUND' });
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
  clearToken();
});

function Probe() {
  const { status, login, signup, logout, replaceToken, finishWithdrawal } = useAuth();
  return (
    <>
      <p data-testid="status">{status}</p>
      <button type="button" onClick={() => void login('a@b.c', 'pw123456')}>로그인A</button>
      <button type="button" onClick={() => void login('c@d.e', 'pw123456')}>로그인C</button>
      <button type="button" onClick={() => void signup('n@b.c', 'pw123456')}>가입</button>
      <button type="button" onClick={() => void logout()}>로그아웃</button>
      <button type="button" onClick={() => replaceToken('jwt-after-password-change')}>토큰교체</button>
      <button type="button" onClick={() => void finishWithdrawal()}>탈퇴완료</button>
      <button type="button" onClick={() => void api.request('/api/pets').catch(() => null)}>요청</button>
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

async function copy() {
  await swTokenSettled();
  return readSwToken();
}

describe('서비스워커 토큰 사본 — 저장·교체', () => {
  it('로그인하면 사본이 생긴다', async () => {
    renderAuth();
    await userEvent.click(screen.getByText('로그인A'));
    await waitFor(() => expect(getToken()).toBe('jwt-a@b.c'));
    expect(await copy()).toBe('jwt-a@b.c');
  });

  it('회원가입해도 사본이 생긴다', async () => {
    renderAuth();
    await userEvent.click(screen.getByText('가입'));
    await waitFor(() => expect(getToken()).toBe('jwt-new'));
    expect(await copy()).toBe('jwt-new');
  });

  it('다른 계정으로 로그인하면 이전 계정의 사본이 새 토큰으로 교체된다', async () => {
    renderAuth();
    await userEvent.click(screen.getByText('로그인A'));
    await waitFor(() => expect(getToken()).toBe('jwt-a@b.c'));
    await userEvent.click(screen.getByText('로그인C'));
    await waitFor(() => expect(getToken()).toBe('jwt-c@d.e'));
    expect(await copy()).toBe('jwt-c@d.e');
  });

  it('비밀번호 변경 후 새 토큰으로 교체(replaceToken)하면 사본도 새 토큰이다', async () => {
    setToken('jwt-old');
    renderAuth();
    await userEvent.click(screen.getByText('토큰교체'));
    expect(getToken()).toBe('jwt-after-password-change');
    expect(await copy()).toBe('jwt-after-password-change');
  });

  it('앱 시작 때 로그인 상태면 사본을 맞춘다(옛 버전에서 로그인한 기기), 로그아웃 상태면 남은 사본을 지운다', async () => {
    localStorage.setItem('spn.accessToken', 'jwt-existing');
    renderAuth();
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('signedIn'));
    expect(await copy()).toBe('jwt-existing');
    cleanup();

    clearToken(); // 메모리 값까지 비운다
    await swTokenSettled();
    await saveSwToken('leftover'); // 어떤 이유로 남은 사본
    renderAuth();
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('signedOut'));
    expect(await copy()).toBeNull();
  });
});

describe('서비스워커 토큰 사본 — 삭제 경로', () => {
  it('로그아웃하면 사본이 지워진다(화면이 넘어가기 전에 삭제까지 마친다)', async () => {
    renderAuth();
    await userEvent.click(screen.getByText('로그인A'));
    await waitFor(() => expect(getToken()).toBe('jwt-a@b.c'));
    await swTokenSettled();
    expect(await readSwToken()).toBe('jwt-a@b.c');

    await userEvent.click(screen.getByText('로그아웃'));
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('signedOut'));
    expect(getToken()).toBeNull();
    expect(await readSwToken()).toBeNull(); // 기다리지 않고도 이미 지워져 있다
  });

  it('401 강제 로그아웃(토큰을 붙인 요청이 401)이면 사본이 지워진다', async () => {
    renderAuth();
    await userEvent.click(screen.getByText('로그인A'));
    await waitFor(() => expect(getToken()).toBe('jwt-a@b.c'));
    await swTokenSettled();

    await userEvent.click(screen.getByText('요청')); // GET /api/pets → 401
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('signedOut'));
    expect(await copy()).toBeNull();
    expect(getToken()).toBeNull();
  });

  it('앱 시작 세션 확인(/api/me)이 401 이면 사본이 지워진다', async () => {
    localStorage.setItem('spn.accessToken', 'jwt-expired');
    meStatus = 401;
    renderAuth();
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('signedOut'));
    expect(await copy()).toBeNull();
  });

  it('회원 탈퇴 완료(finishWithdrawal)면 사본이 지워진다', async () => {
    renderAuth();
    await userEvent.click(screen.getByText('로그인A'));
    await waitFor(() => expect(getToken()).toBe('jwt-a@b.c'));
    await swTokenSettled();

    await userEvent.click(screen.getByText('탈퇴완료'));
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('signedOut'));
    expect(await readSwToken()).toBeNull();
    expect(getToken()).toBeNull();
  });

  it('clearToken 을 직접 불러도(어느 경로든) 사본이 지워진다', async () => {
    setToken('jwt-x');
    expect(await copy()).toBe('jwt-x');
    clearToken();
    expect(await copy()).toBeNull();
  });

  it('IndexedDB 를 쓸 수 없어도 로그인·로그아웃은 막히지 않는다', async () => {
    vi.stubGlobal('indexedDB', undefined);
    renderAuth();
    await userEvent.click(screen.getByText('로그인A'));
    await waitFor(() => expect(getToken()).toBe('jwt-a@b.c'));
    await userEvent.click(screen.getByText('로그아웃'));
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('signedOut'));
  });
});
