// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../auth';
import { PUSH_DEVICE_ID_KEY } from '../lib/pushDevice';
import { getToken, setToken } from '../lib/tokenStorage';
import LoginPage from './LoginPage';
import AccountPage from './AccountPage';
import PasswordChangePage from './PasswordChangePage';
import AccountDeletePage from './AccountDeletePage';

// 계정 화면 테스트. 실제 서버 없이 fetch 를 가짜로 바꾸고, 응답은 계약서(docs/api-account.md) 예시를 쓴다.

interface Call {
  method: string;
  path: string;
  auth: string | null;
  body: unknown;
}

function json(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers });
}

function mockServer(handler: (call: Call) => Response | null) {
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      const headers = (init?.headers ?? {}) as Record<string, string>;
      const call: Call = {
        method: init?.method ?? 'GET',
        path: url.pathname,
        auth: headers.Authorization ?? null,
        body: init?.body ? JSON.parse(String(init.body)) : null,
      };
      calls.push(call);
      if (call.path === '/api/me' && call.method === 'GET') return json(200, { id: 'u1', email: 'owner@example.com' });
      return handler(call) ?? new Response(null, { status: 404 });
    }),
  );
  return calls;
}

function Where() {
  const loc = useLocation();
  return <p data-testid="where">{loc.pathname}</p>;
}

function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <Where />
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/account" element={<AccountPage />} />
          <Route path="/account/password" element={<PasswordChangePage />} />
          <Route path="/account/delete" element={<AccountDeletePage />} />
          <Route path="/pet" element={<p>프로필</p>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});

const where = () => screen.getByTestId('where').textContent;

describe('계정 화면', () => {
  it('이메일과 진입 버튼, 면책 문구를 보여 준다. 처리방침 주소가 없으면 링크 줄이 없다', async () => {
    setToken('t0');
    mockServer(() => null);
    renderAt('/account');
    expect(await screen.findByText('owner@example.com')).toBeTruthy();
    expect(screen.getByRole('link', { name: /비밀번호 바꾸기/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: '로그아웃' })).toBeTruthy();
    expect(screen.getByRole('link', { name: /회원 탈퇴/ })).toBeTruthy();
    expect(screen.getByText('본 기록은 의료적 판단을 대신하지 않습니다.')).toBeTruthy();
    expect(screen.queryByText(/개인정보 처리방침/)).toBeNull();
  });
});

describe('비밀번호 바꾸기', () => {
  async function fill(user: ReturnType<typeof userEvent.setup>, cur: string, nw: string, conf: string) {
    await user.type(await screen.findByLabelText('현재 비밀번호'), cur);
    await user.type(screen.getByLabelText(/^새 비밀번호 \(/), nw);
    await user.type(screen.getByLabelText('새 비밀번호 확인'), conf);
  }

  it('성공하면 응답의 새 토큰으로 즉시 교체하고 로그인을 유지한다', async () => {
    setToken('old-token');
    const calls = mockServer((c) => (c.path === '/api/me/password' ? json(200, { accessToken: 'new-token' }) : null));
    renderAt('/account/password');
    const user = userEvent.setup();
    await fill(user, 'password123', 'brandNewPass1', 'brandNewPass1');
    await user.click(screen.getByRole('button', { name: '비밀번호 바꾸기' }));

    expect(await screen.findByText('비밀번호를 바꿨어요.')).toBeTruthy();
    const put = calls.find((c) => c.path === '/api/me/password');
    expect(put?.method).toBe('PUT');
    expect(put?.auth).toBe('Bearer old-token');
    expect(put?.body).toEqual({ currentPassword: 'password123', newPassword: 'brandNewPass1' });
    expect(getToken()).toBe('new-token');
    expect(where()).toBe('/account/password');
  });

  it('현재 비밀번호가 틀리면(400) 칸에 알리고 로그아웃하지 않는다', async () => {
    setToken('old-token');
    mockServer((c) =>
      c.path === '/api/me/password' ? json(400, { code: 'CURRENT_PASSWORD_MISMATCH', message: 'x' }) : null,
    );
    renderAt('/account/password');
    const user = userEvent.setup();
    await fill(user, 'wrong-pass', 'brandNewPass1', 'brandNewPass1');
    await user.click(screen.getByRole('button', { name: '비밀번호 바꾸기' }));

    expect(await screen.findByText('현재 비밀번호가 맞지 않아요. 다시 확인해 주세요.')).toBeTruthy();
    expect((screen.getByLabelText('현재 비밀번호') as HTMLInputElement).value).toBe('');
    expect(getToken()).toBe('old-token');
    expect(where()).toBe('/account/password');
  });

  it('429 면 안내하고 버튼을 잠근다', async () => {
    setToken('old-token');
    mockServer((c) =>
      c.path === '/api/me/password'
        ? json(429, { code: 'TOO_MANY_ATTEMPTS', message: 'x' }, { 'Retry-After': '900' })
        : null,
    );
    renderAt('/account/password');
    const user = userEvent.setup();
    await fill(user, 'wrong-pass', 'brandNewPass1', 'brandNewPass1');
    await user.click(screen.getByRole('button', { name: '비밀번호 바꾸기' }));
    expect(await screen.findByText('비밀번호를 여러 번 틀렸어요. 15분 뒤에 다시 시도해 주세요.')).toBeTruthy();
    await waitFor(() => expect((screen.getByRole('button', { name: '비밀번호 바꾸기' }) as HTMLButtonElement).disabled).toBe(true));
    expect(getToken()).toBe('old-token');
  });

  it('72바이트를 넘는 한글 비밀번호는 요청 없이 거절한다', async () => {
    setToken('old-token');
    const calls = mockServer(() => null);
    renderAt('/account/password');
    const user = userEvent.setup();
    const k25 = '가'.repeat(25);
    await fill(user, 'password123', k25, k25);
    await user.click(screen.getByRole('button', { name: '비밀번호 바꾸기' }));
    expect(await screen.findByText(/한글은 24자까지/)).toBeTruthy();
    expect(calls.some((c) => c.path === '/api/me/password')).toBe(false);
  });

  it('보기 토글이 세 칸을 한 번에 드러낸다', async () => {
    setToken('old-token');
    mockServer(() => null);
    renderAt('/account/password');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('checkbox', { name: '비밀번호 보기' }));
    expect((screen.getByLabelText('현재 비밀번호') as HTMLInputElement).type).toBe('text');
    expect((screen.getByLabelText('새 비밀번호 확인') as HTMLInputElement).type).toBe('text');
    expect(screen.getByText('비밀번호가 화면에 보이고 있어요.')).toBeTruthy();
  });

  it('입력이 있으면 취소할 때 확인을 묻는다', async () => {
    setToken('old-token');
    mockServer(() => null);
    renderAt('/account/password');
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('현재 비밀번호'), 'abc');
    await user.click(screen.getByRole('button', { name: '취소' }));
    expect(screen.getByText('저장하지 않고 나갈까요?')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '나가기' }));
    expect(where()).toBe('/account');
  });
});

describe('회원 탈퇴', () => {
  async function toConfirm(user: ReturnType<typeof userEvent.setup>) {
    await user.click(await screen.findByRole('button', { name: /탈퇴 계속하기/ }));
    await screen.findByRole('heading', { name: '탈퇴 확인' });
  }

  it('단계 1 은 지워지는 내용 6개를 목록으로 보여 주고 [그대로 두기]가 먼저 나온다', async () => {
    setToken('t0');
    mockServer(() => null);
    renderAt('/account/delete');
    await screen.findByRole('heading', { name: '회원 탈퇴' });
    expect(screen.getAllByRole('listitem')).toHaveLength(6);
    const buttons = screen.getAllByRole('button').map((b) => b.textContent ?? '');
    expect(buttons[0]).toBe('그대로 두기');
    expect(buttons[1]).toContain('탈퇴 계속하기');
  });

  it('[그대로 두기]는 요청 없이 계정으로 돌아간다', async () => {
    setToken('t0');
    const calls = mockServer(() => null);
    renderAt('/account/delete');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: '그대로 두기' }));
    expect(where()).toBe('/account');
    expect(calls.some((c) => c.path === '/api/me/withdraw')).toBe(false);
  });

  it('비밀번호와 체크가 없으면 요청하지 않고 둘 다 알린다', async () => {
    setToken('t0');
    const calls = mockServer(() => null);
    renderAt('/account/delete');
    const user = userEvent.setup();
    await toConfirm(user);
    await user.click(screen.getByRole('button', { name: '탈퇴하기' }));
    expect(screen.getByText('비밀번호를 입력해 주세요.')).toBeTruthy();
    expect(screen.getByText('내용을 읽었다면 체크해 주세요.')).toBeTruthy();
    expect(calls.some((c) => c.path === '/api/me/withdraw')).toBe(false);
  });

  it('204 면 서버 기기 해제 없이 정리하고 로그인 화면에서 완료 안내를 보인다', async () => {
    setToken('t0');
    localStorage.setItem(PUSH_DEVICE_ID_KEY, 'dev-1');
    localStorage.setItem('spn.historyRange', '30');
    const calls = mockServer((c) => (c.path === '/api/me/withdraw' ? new Response(null, { status: 204 }) : null));
    renderAt('/account/delete');
    const user = userEvent.setup();
    await toConfirm(user);
    await user.type(screen.getByLabelText('비밀번호'), 'password123');
    await user.click(screen.getByRole('checkbox', { name: /지워지는 내용을 읽었고/ }));
    await user.click(screen.getByRole('button', { name: '탈퇴하기' }));

    expect(await screen.findByText('탈퇴가 끝났어요.')).toBeTruthy();
    expect(where()).toBe('/login');
    const w = calls.find((c) => c.path === '/api/me/withdraw');
    expect(w?.method).toBe('POST');
    expect(w?.body).toEqual({ password: 'password123', confirm: true });
    expect(calls.some((c) => c.path.startsWith('/api/devices'))).toBe(false);
    expect(getToken()).toBeNull();
    expect(localStorage.getItem(PUSH_DEVICE_ID_KEY)).toBeNull();
    expect(localStorage.getItem('spn.historyRange')).toBeNull();
    expect((screen.getByLabelText('이메일') as HTMLInputElement).value).toBe('');
    // 가입/로그인 모드를 바꾸면 안내가 사라진다
    await user.click(screen.getByRole('button', { name: '처음이신가요? 회원가입' }));
    expect(screen.queryByText('탈퇴가 끝났어요.')).toBeNull();
  });

  it('비밀번호가 틀리면(400) 로그아웃 없이 입력 화면에 머물고 비밀번호만 비운다', async () => {
    setToken('t0');
    mockServer((c) =>
      c.path === '/api/me/withdraw' ? json(400, { code: 'CURRENT_PASSWORD_MISMATCH', message: 'x' }) : null,
    );
    renderAt('/account/delete');
    const user = userEvent.setup();
    await toConfirm(user);
    await user.type(screen.getByLabelText('비밀번호'), 'wrong-pass');
    await user.click(screen.getByRole('checkbox', { name: /지워지는 내용을 읽었고/ }));
    await user.click(screen.getByRole('button', { name: '탈퇴하기' }));

    expect(await screen.findByText('비밀번호가 맞지 않아요. 다시 확인해 주세요.')).toBeTruthy();
    expect(getToken()).toBe('t0');
    expect(where()).toBe('/account/delete');
    expect((screen.getByLabelText('비밀번호') as HTMLInputElement).value).toBe('');
    expect((screen.getByRole('checkbox', { name: /지워지는 내용을 읽었고/ }) as HTMLInputElement).checked).toBe(true);
  });

  it('연결 실패면 "끝났는지 확인하지 못했어요"를 알리고 입력을 유지한다', async () => {
    setToken('t0');
    mockServer((c) => {
      if (c.path === '/api/me/withdraw') throw new TypeError('Failed to fetch');
      return null;
    });
    renderAt('/account/delete');
    const user = userEvent.setup();
    await toConfirm(user);
    await user.type(screen.getByLabelText('비밀번호'), 'password123');
    await user.click(screen.getByRole('checkbox', { name: /지워지는 내용을 읽었고/ }));
    await user.click(screen.getByRole('button', { name: '탈퇴하기' }));

    expect(await screen.findByText('탈퇴가 끝났는지 확인하지 못했어요. 계정은 아직 그대로일 수 있어요.')).toBeTruthy();
    expect((screen.getByLabelText('비밀번호') as HTMLInputElement).value).toBe('password123');
    expect((screen.getByRole('button', { name: '탈퇴하기' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('삭제 중에는 입력과 [그대로 두기]가 잠기고 요청은 한 번만 나간다', async () => {
    setToken('t0');
    let release: (r: Response) => void = () => {};
    const calls = mockServer((c) => {
      if (c.path !== '/api/me/withdraw') return null;
      return new Promise<Response>((resolve) => (release = resolve)) as unknown as Response;
    });
    renderAt('/account/delete');
    const user = userEvent.setup();
    await toConfirm(user);
    await user.type(screen.getByLabelText('비밀번호'), 'password123');
    await user.click(screen.getByRole('checkbox', { name: /지워지는 내용을 읽었고/ }));
    await user.click(screen.getByRole('button', { name: '탈퇴하기' }));

    expect(await screen.findByText('계정과 기록을 지우는 중이에요.')).toBeTruthy();
    expect((screen.getByLabelText('비밀번호') as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: '그대로 두기' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: /처음으로/ }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: '탈퇴하는 중…' }) as HTMLButtonElement).disabled).toBe(true);
    expect(calls.filter((c) => c.path === '/api/me/withdraw')).toHaveLength(1);
    release(new Response(null, { status: 204 }));
    expect(await screen.findByText('탈퇴가 끝났어요.')).toBeTruthy();
  });
});
