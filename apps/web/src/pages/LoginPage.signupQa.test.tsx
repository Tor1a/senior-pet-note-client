// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../auth';
import { PRIVACY_TEXT } from '../lib/privacyText';
import LoginPage from './LoginPage';

// QA 보강: 가입 화면 만 14세 확인의 경계 동작(Enter 제출, 체크 해제, 409 후 상태, 모드 전환, 본문 불변, 큰 글씨 CSS)

interface Call {
  method: string;
  path: string;
  body: Record<string, unknown> | null;
}

function mockServer(signupStatus: 201 | 409 = 201) {
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      calls.push({ method: init?.method ?? 'GET', path: url.pathname, body: init?.body ? JSON.parse(String(init.body)) : null });
      if (url.pathname === '/api/auth/signup') {
        if (signupStatus === 409) {
          return new Response(JSON.stringify({ code: 'EMAIL_TAKEN', message: 'taken' }), {
            status: 409,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return new Response(JSON.stringify({ accessToken: 'jwt-new', user: { id: 'n', email: 'n@b.c' } }), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.pathname === '/api/auth/login') {
        return new Response(JSON.stringify({ accessToken: 'jwt', user: { id: 'n', email: 'n@b.c' } }), {
          status: 200,
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

async function fillForm(enterAtEnd = false) {
  await userEvent.type(screen.getByLabelText('이메일'), 'n@b.c');
  await userEvent.type(screen.getByLabelText('비밀번호'), 'pw123456');
  await userEvent.type(screen.getByLabelText('비밀번호 확인'), enterAtEnd ? 'pw123456{Enter}' : 'pw123456');
}

const box = () => screen.getByRole('checkbox', { name: PRIVACY_TEXT.ageCheck }) as HTMLInputElement;
const signupCalls = (calls: Call[]) => calls.filter((c) => c.path === '/api/auth/signup');

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('가입 화면 만 14세 확인 — QA 보강', () => {
  it('체크 없이 비밀번호 확인 칸에서 Enter 를 눌러도 가입 요청이 나가지 않고 오류가 보인다', async () => {
    const calls = mockServer();
    await openSignup();
    await fillForm(true);
    expect(screen.getByText(PRIVACY_TEXT.ageError)).toBeTruthy();
    expect(signupCalls(calls)).toHaveLength(0);
  });

  it('체크한 뒤 Enter 로 제출하면 가입한다', async () => {
    const calls = mockServer();
    await openSignup();
    await userEvent.click(box());
    await fillForm(true);
    expect(signupCalls(calls)).toHaveLength(1);
  });

  it('체크했다가 해제하고 제출하면 막힌다 (해제 상태가 실제로 반영됨)', async () => {
    const calls = mockServer();
    await openSignup();
    await fillForm();
    await userEvent.click(box());
    expect(box().checked).toBe(true);
    await userEvent.click(box());
    expect(box().checked).toBe(false);
    await userEvent.click(screen.getByRole('button', { name: '가입하고 시작하기' }));
    expect(screen.getByText(PRIVACY_TEXT.ageError)).toBeTruthy();
    expect(signupCalls(calls)).toHaveLength(0);
  });

  it('오류가 난 상태에서 체크를 해제(체크→해제)해도 오류 문구는 사라진 채이고, 다시 제출하면 오류가 돌아온다', async () => {
    mockServer();
    await openSignup();
    await fillForm();
    await userEvent.click(screen.getByRole('button', { name: '가입하고 시작하기' }));
    await userEvent.click(box());
    await userEvent.click(box());
    expect(screen.queryByText(PRIVACY_TEXT.ageError)).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: '가입하고 시작하기' }));
    expect(screen.getByText(PRIVACY_TEXT.ageError)).toBeTruthy();
    expect(box().getAttribute('aria-invalid')).toBe('true');
  });

  it('가입 → 로그인 → 가입으로 오가면 체크와 오류 문구가 모두 초기화된다', async () => {
    mockServer();
    await openSignup();
    await fillForm();
    await userEvent.click(screen.getByRole('button', { name: '가입하고 시작하기' }));
    expect(screen.getByText(PRIVACY_TEXT.ageError)).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: '이미 계정이 있어요 · 로그인' }));
    expect(screen.queryByText(PRIVACY_TEXT.ageError)).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: '처음이신가요? 회원가입' }));
    expect(screen.queryByText(PRIVACY_TEXT.ageError)).toBeNull();
    expect(box().checked).toBe(false);
    expect(box().getAttribute('aria-invalid')).toBeNull();
  });

  it('로그인 모드는 체크 없이도 로그인 요청이 나가고 본문이 {email,password} 뿐이다', async () => {
    const calls = mockServer();
    render(
      <MemoryRouter initialEntries={['/login']}>
        <AuthProvider>
          <LoginPage />
        </AuthProvider>
      </MemoryRouter>,
    );
    await userEvent.type(await screen.findByLabelText('이메일'), 'n@b.c');
    await userEvent.type(screen.getByLabelText('비밀번호'), 'pw123456{Enter}');
    const logins = calls.filter((c) => c.path === '/api/auth/login');
    expect(logins).toHaveLength(1);
    expect(logins[0].body).toEqual({ email: 'n@b.c', password: 'pw123456' });
    expect(screen.queryByRole('checkbox')).toBeNull();
  });

  it('이미 가입된 이메일(409)이면 안내를 보이되 체크는 유지되고, 다시 눌러도 체크 요구 없이 재요청된다', async () => {
    const calls = mockServer(409);
    await openSignup();
    await userEvent.click(box());
    await fillForm();
    await userEvent.click(screen.getByRole('button', { name: '가입하고 시작하기' }));
    expect(await screen.findByText(/이미 가입된 이메일/)).toBeTruthy();
    expect(box().checked).toBe(true);
    expect(screen.queryByText(PRIVACY_TEXT.ageError)).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: '가입하고 시작하기' }));
    expect(signupCalls(calls)).toHaveLength(2);
    for (const c of signupCalls(calls)) expect(Object.keys(c.body ?? {}).sort()).toEqual(['email', 'password']);
  });

  it('성공한 가입 요청의 본문 키는 정확히 email, password 이고 age 관련 키가 없다', async () => {
    const calls = mockServer();
    await openSignup();
    await userEvent.click(box());
    await fillForm();
    await userEvent.click(screen.getByRole('button', { name: '가입하고 시작하기' }));
    const body = signupCalls(calls)[0].body!;
    expect(Object.keys(body).sort()).toEqual(['email', 'password']);
    expect(JSON.stringify(body)).not.toMatch(/age|14|adult|confirm/i);
  });

  it('다른 입력 오류(이메일 형식)가 있어도 14세 오류가 함께 보인다', async () => {
    const calls = mockServer();
    await openSignup();
    await userEvent.type(screen.getByLabelText('이메일'), 'bad');
    await userEvent.click(screen.getByRole('button', { name: '가입하고 시작하기' }));
    expect(screen.getByText(PRIVACY_TEXT.ageError)).toBeTruthy();
    expect(signupCalls(calls)).toHaveLength(0);
  });

  it('체크박스 줄 CSS: 최소 높이가 rem 단위라 글자 1.3/2.0배(루트 글자 크기 확대)에서 함께 커진다', () => {
    const css = readFileSync(resolve(__dirname, '../styles.css'), 'utf8');
    const rule = (sel: string) => css.match(new RegExp(`^${sel.replace(/[.[\]]/g, '\\$&')}\\s*\\{([^}]*)\\}`, 'm'))?.[1] ?? '';
    const label = rule('.check-label');
    const confirm = rule('.confirm-check');
    const minH = (s: string) => Number(s.match(/min-height:\s*([\d.]+)rem/)?.[1] ?? 0);
    // 기준 18px × rem × 배율 → 터치 영역 48px 이상
    for (const scale of [1, 1.3, 2.0]) {
      expect(18 * Math.max(minH(label), minH(confirm)) * scale).toBeGreaterThanOrEqual(48);
    }
    // 체크박스 자체도 rem (px 고정이 아님)
    expect(rule('.check-label input\\[type="checkbox"\\]') || css).toMatch(/width:\s*1\.75rem/);
  });
});
