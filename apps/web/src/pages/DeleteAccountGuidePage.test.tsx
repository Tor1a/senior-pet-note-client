// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import { AuthProvider } from '../auth';
import { getToken, setToken } from '../lib/tokenStorage';

// 로그인 없이 보는 계정 삭제 안내(/delete-account). 실제 라우터(App)로 열어 로그인 가드 밖인지도 본다.

function stubFetch(meStatus: number) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    if (url.pathname === '/api/me') {
      return meStatus === 200
        ? new Response(JSON.stringify({ id: 'u1', email: 'a@b.c' }), { status: 200, headers: { 'Content-Type': 'application/json' } })
        : new Response(null, { status: meStatus });
    }
    return new Response(null, { status: 404 });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function Where() {
  return <p data-testid="where">{useLocation().pathname}</p>;
}

function renderApp(path = '/delete-account') {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Where />
      <AuthProvider>
        <Routes>
          <Route path="*" element={<App />} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  localStorage.clear();
});

describe('계정 삭제 안내 페이지', () => {
  it('로그아웃 상태에서도 열리고(로그인 화면으로 보내지 않음) 제목 구조와 삭제 데이터를 보여 준다', async () => {
    stubFetch(401);
    renderApp();
    expect(await screen.findByRole('heading', { level: 1, name: '계정 삭제 안내' })).toBeTruthy();
    expect(screen.getByText('오래곁')).toBeTruthy();
    const h2s = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(h2s).toEqual(['삭제되는 데이터', '삭제 방법', '처리 기간과 보관 정보']);
    for (const item of ['계정(이메일, 비밀번호)', '반려동물 정보(이름·종류·생일·입양일·함께 지내는 상황)', '투약·알림 설정', '할 일 일정(제목·일정 메모·병원 메모)', '진료 때 물어볼 것(직접 적은 글, 물어봤어요 표시)', '푸시 기기 정보', '사진']) {
      expect(screen.getByText(item)).toBeTruthy();
    }
    expect(screen.getByText('서비스 데이터베이스에서는 즉시 삭제해요. 사진 파일은 이어서 지워요.')).toBeTruthy();
    expect(screen.getByText('그 밖에 서비스 이용 중 쌓인 데이터(이용 기록, 알림 발송 기록 등)')).toBeTruthy();
    expect(screen.getByText('한 번 삭제하면 되돌릴 수 없어요.')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: '로그인' })).toBeNull();
    // 로그아웃 상태: 계정 삭제 화면 링크 없음
    expect(screen.queryByRole('link', { name: '계정 삭제 화면으로 가기' })).toBeNull();
  });

  it('환경변수가 없으면 운영자·이메일·처리방침·보관 안내 줄이 모두 숨겨지고 "확인 필요"도 없다', async () => {
    vi.stubEnv('VITE_SUPPORT_EMAIL', '');
    vi.stubEnv('VITE_OPERATOR_NAME', '');
    vi.stubEnv('VITE_PRIVACY_POLICY_URL', '');
    vi.stubEnv('VITE_RETENTION_NOTE', '');
    stubFetch(401);
    renderApp();
    await screen.findByRole('heading', { level: 1, name: '계정 삭제 안내' });
    expect(screen.queryByText(/개발자·운영자/)).toBeNull();
    expect(screen.queryByText(/로그인할 수 없으면/)).toBeNull();
    expect(screen.queryByRole('link', { name: /개인정보 처리방침/ })).toBeNull();
    expect(screen.queryByText(/확인 필요/)).toBeNull();
    expect(document.body.querySelector('a[href^="mailto:"]')).toBeNull();
  });

  it('환경변수가 있으면 해당 줄이 보인다', async () => {
    vi.stubEnv('VITE_SUPPORT_EMAIL', 'help@example.com');
    vi.stubEnv('VITE_OPERATOR_NAME', '홍길동');
    vi.stubEnv('VITE_PRIVACY_POLICY_URL', 'https://example.com/privacy');
    vi.stubEnv('VITE_RETENTION_NOTE', '백업은 30일 뒤 지워져요.');
    stubFetch(401);
    renderApp();
    await screen.findByRole('heading', { level: 1, name: '계정 삭제 안내' });
    expect(screen.getByText(/개발자·운영자: 홍길동/)).toBeTruthy();
    const mail = screen.getByRole('link', { name: 'help@example.com' });
    expect(mail.getAttribute('href')).toBe('mailto:help@example.com');
    expect(screen.getByText(/로그인할 수 없으면/)).toBeTruthy();
    const privacy = screen.getByRole('link', { name: /개인정보 처리방침/ });
    expect(privacy.getAttribute('href')).toBe('https://example.com/privacy');
    expect(screen.getByText('백업은 30일 뒤 지워져요.')).toBeTruthy();
  });

  it('로그인해 있으면 계정 삭제 화면으로 가는 링크가 보인다', async () => {
    setToken('test-token');
    stubFetch(200);
    renderApp();
    const link = await screen.findByRole('link', { name: '계정 삭제 화면으로 가기' });
    expect(link.getAttribute('href')).toBe('/account/delete');
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: '계정 삭제 안내' })).toBeTruthy());
  });
});

describe('만료·무효 토큰이 남은 방문자', () => {
  it('/delete-account 직접 접속: /api/me 가 401 이어도 페이지를 유지하고 /login 으로 가지 않는다(토큰은 정리)', async () => {
    setToken('expired-token');
    const fetchMock = stubFetch(401);
    renderApp();
    await screen.findByRole('heading', { level: 1, name: '계정 삭제 안내' });
    await waitFor(() => expect(getToken()).toBeNull());
    expect(fetchMock).toHaveBeenCalled();
    expect(screen.getByTestId('where').textContent).toBe('/delete-account');
    expect(screen.getByRole('heading', { level: 1, name: '계정 삭제 안내' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: '계정 삭제 화면으로 가기' })).toBeNull();
  });

  it('회귀: 로그인이 필요한 경로는 같은 401 에서 기존대로 /login 으로 간다', async () => {
    setToken('expired-token');
    stubFetch(401);
    renderApp('/today');
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/login'));
    expect(getToken()).toBeNull();
  });
});
