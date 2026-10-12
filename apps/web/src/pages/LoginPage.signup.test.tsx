// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../auth';
import { PRIVACY_TEXT } from '../lib/privacyText';
import LoginPage from './LoginPage';

// 가입 화면의 "만 14세 이상입니다" 확인. 화면에서만 확인하고 요청 본문에는 싣지 않는다.

interface Call {
  method: string;
  path: string;
  body: unknown;
}

function mockServer() {
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      calls.push({
        method: init?.method ?? 'GET',
        path: url.pathname,
        body: init?.body ? JSON.parse(String(init.body)) : null,
      });
      if (url.pathname === '/api/auth/signup') {
        return new Response(JSON.stringify({ accessToken: 'jwt-new', user: { id: 'n', email: 'n@b.c' } }), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(null, { status: 401 });
    }),
  );
  return calls;
}

async function openSignup() {
  render(
    <MemoryRouter initialEntries={['/login']}>
      <AuthProvider>
        <LoginPage />
      </AuthProvider>
    </MemoryRouter>,
  );
  await userEvent.click(await screen.findByRole('button', { name: '처음이신가요? 회원가입' }));
}

async function fillForm() {
  await userEvent.type(screen.getByLabelText('이메일'), 'n@b.c');
  await userEvent.type(screen.getByLabelText('비밀번호'), 'pw123456');
  await userEvent.type(screen.getByLabelText('비밀번호 확인'), 'pw123456');
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  localStorage.clear();
});

describe('가입 화면 — 만 14세 확인', () => {
  it('체크하지 않고 제출하면 칸 오류를 보이고 가입 요청을 보내지 않는다', async () => {
    const calls = mockServer();
    await openSignup();
    await fillForm();
    await userEvent.click(screen.getByRole('button', { name: '가입하고 시작하기' }));
    const box = screen.getByRole('checkbox', { name: PRIVACY_TEXT.ageCheck });
    expect(screen.getByText(PRIVACY_TEXT.ageError)).toBeTruthy();
    expect(box.getAttribute('aria-invalid')).toBe('true');
    expect(box.getAttribute('aria-describedby')).toBe('age-confirm-error');
    expect(calls.filter((c) => c.path === '/api/auth/signup')).toHaveLength(0);
  });

  it('체크하면 오류가 사라지고, 기존과 같은 본문(이메일·비밀번호만)으로 가입한다', async () => {
    const calls = mockServer();
    await openSignup();
    await fillForm();
    await userEvent.click(screen.getByRole('button', { name: '가입하고 시작하기' }));
    await userEvent.click(screen.getByRole('checkbox', { name: PRIVACY_TEXT.ageCheck }));
    expect(screen.queryByText(PRIVACY_TEXT.ageError)).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: '가입하고 시작하기' }));
    const signups = calls.filter((c) => c.path === '/api/auth/signup');
    expect(signups).toHaveLength(1);
    expect(signups[0].body).toEqual({ email: 'n@b.c', password: 'pw123456' });
  });

  it('체크박스는 필수 표시가 있고 큰 글씨 규칙(체크 영역 48 이상)을 쓰는 클래스다', async () => {
    mockServer();
    await openSignup();
    const box = screen.getByRole('checkbox', { name: PRIVACY_TEXT.ageCheck });
    expect(box.getAttribute('aria-required')).toBe('true');
    expect(box.closest('label')?.className).toContain('check-label');
  });

  it('로그인 화면에는 체크박스가 없다. 모드를 바꾸면 체크가 풀린다', async () => {
    mockServer();
    await openSignup();
    await userEvent.click(screen.getByRole('checkbox', { name: PRIVACY_TEXT.ageCheck }));
    await userEvent.click(screen.getByRole('button', { name: '이미 계정이 있어요 · 로그인' }));
    expect(screen.queryByRole('checkbox')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: '처음이신가요? 회원가입' }));
    expect((screen.getByRole('checkbox', { name: PRIVACY_TEXT.ageCheck }) as HTMLInputElement).checked).toBe(false);
  });

  it('처리방침 주소가 있으면 가입 화면에 링크를 두고, 없으면 숨긴다', async () => {
    vi.stubEnv('VITE_PRIVACY_POLICY_URL', '');
    mockServer();
    await openSignup();
    expect(screen.queryByRole('link', { name: /개인정보 처리방침/ })).toBeNull();
    cleanup();
    vi.stubEnv('VITE_PRIVACY_POLICY_URL', 'https://example.com/privacy');
    await openSignup();
    expect(screen.getByRole('link', { name: /개인정보 처리방침/ }).getAttribute('href')).toBe('https://example.com/privacy');
  });
});
