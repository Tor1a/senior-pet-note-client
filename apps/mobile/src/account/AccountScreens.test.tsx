import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { setFontScale } from '../testing/fontScale';
import { json } from '../testing/fixtures';
import { mockRouter, resetRouterMocks } from '../testing/mockRouter';
import { PushContext } from '../push/pushContext';
import AccountScreen from './AccountScreen';
import AccountDeleteScreen from './AccountDeleteScreen';
import PasswordChangeScreen from './PasswordChangeScreen';
import { PrivacyLink } from './AccountParts';

// 계정 화면 테스트. 서버는 가짜 fetch(계약서 docs/api-account.md 예시)로 대신한다.
jest.mock('../services/client', () => require('../testing/mockClient'));
jest.mock('expo-router', () => require('../testing/mockRouter').factory());
const mockAuth = {
  user: { id: 'u1', email: 'owner@example.com' } as { id: string; email: string } | null,
  signOut: jest.fn(),
  replaceToken: jest.fn(async (_t: string) => true),
  finishWithdrawal: jest.fn(async () => {}),
};
jest.mock('../auth/AuthContext', () => ({ useAuth: () => mockAuth }));

const push = {
  state: 'unavailable' as const,
  requestPermission: async () => 'unavailable' as const,
  recheck: async () => 'unavailable' as const,
  bannerVisible: false,
  subscribe: () => () => {},
};
const wrap = (node: React.ReactElement) => <PushContext.Provider value={push}>{node}</PushContext.Provider>;

type Req = { url: string; method: string; body: any };
let calls: Req[] = [];
function setup(handler: (r: Req) => Response | Promise<Response> | undefined) {
  global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
    const req = { url: String(url).replace('http://test', ''), method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : undefined };
    calls.push(req);
    return (await handler(req)) ?? json(404, { code: 'NOT_FOUND', message: 'x' });
  }) as never;
}

beforeEach(() => {
  resetRouterMocks();
  setFontScale(1);
  calls = [];
  mockAuth.user = { id: 'u1', email: 'owner@example.com' };
  mockAuth.signOut.mockReset();
  mockAuth.replaceToken.mockClear();
  mockAuth.finishWithdrawal.mockClear();
});

describe('계정 화면', () => {
  it('이메일·비밀번호 바꾸기·로그아웃·회원 탈퇴·면책 문구를 보여 주고 처리방침 주소가 없으면 링크가 없다', async () => {
    await render(wrap(<AccountScreen />));
    expect(screen.getByText('owner@example.com')).toBeTruthy();
    expect(screen.getByRole('button', { name: '로그아웃' })).toBeTruthy();
    expect(screen.getByText('본 기록은 의료적 판단을 대신하지 않습니다.')).toBeTruthy();
    expect(screen.queryByText(/개인정보 처리방침/)).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: '비밀번호 바꾸기' }));
    expect(mockRouter.push).toHaveBeenCalledWith('/account/password');
    await fireEvent.press(screen.getByRole('button', { name: '회원 탈퇴' }));
    expect(mockRouter.push).toHaveBeenCalledWith('/account/delete');
  });

  it('이메일을 못 읽으면 안내 문구, 나머지 버튼은 그대로', async () => {
    mockAuth.user = null;
    await render(wrap(<AccountScreen />));
    expect(screen.getByText('이메일을 불러오지 못했어요.')).toBeTruthy();
    expect(screen.getByRole('button', { name: '회원 탈퇴' })).toBeTruthy();
  });

  it('처리방침 주소가 있으면 링크 줄을 보인다', async () => {
    await render(<PrivacyLink url="https://example.com/privacy" />);
    expect(screen.getByRole('button', { name: '개인정보 처리방침 보기, 브라우저에서 열려요' })).toBeTruthy();
  });

  it('글자 2.0배에서도 같은 요소가 모두 있다(하단 고정 영역 없음)', async () => {
    setFontScale(2);
    await render(wrap(<AccountScreen />));
    expect(screen.getByRole('button', { name: '회원 탈퇴' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '로그아웃' })).toBeTruthy();
  });
});

describe('비밀번호 바꾸기', () => {
  async function fill(cur: string, nw: string, conf: string) {
    await fireEvent.changeText(screen.getByLabelText('현재 비밀번호'), cur);
    await fireEvent.changeText(screen.getByLabelText(/^새 비밀번호 \(/), nw);
    await fireEvent.changeText(screen.getByLabelText('새 비밀번호 확인'), conf);
  }

  it('성공하면 응답의 새 토큰으로 교체하고 성공 카드를 보인다', async () => {
    setup((r) => (r.url === '/api/me/password' ? json(200, { accessToken: 'new-token' }) : undefined));
    await render(wrap(<PasswordChangeScreen />));
    await fill('password123', 'brandNewPass1', 'brandNewPass1');
    await fireEvent.press(screen.getByRole('button', { name: '비밀번호 바꾸기' }));
    await screen.findByText('다음에 로그인할 때부터 새 비밀번호를 써 주세요.');
    expect(calls[0]).toMatchObject({ method: 'PUT', url: '/api/me/password', body: { currentPassword: 'password123', newPassword: 'brandNewPass1' } });
    expect(mockAuth.replaceToken).toHaveBeenCalledWith('new-token');
    // 위쪽 뒤로 링크와 아래 큰 버튼, 둘 다 같은 곳으로 간다
    const backs = screen.getAllByRole('button', { name: '계정으로 돌아가기' });
    expect(backs).toHaveLength(2);
    await fireEvent.press(backs[1]);
    expect(mockRouter.dismissTo).toHaveBeenCalledWith({ pathname: '/account', params: { notice: 'password' } });
  });

  it('현재 비밀번호가 틀리면(400) 칸 오류만 보이고 로그아웃·토큰 교체가 없다', async () => {
    setup((r) => (r.url === '/api/me/password' ? json(400, { code: 'CURRENT_PASSWORD_MISMATCH', message: 'x' }) : undefined));
    await render(wrap(<PasswordChangeScreen />));
    await fill('wrong-pass', 'brandNewPass1', 'brandNewPass1');
    await fireEvent.press(screen.getByRole('button', { name: '비밀번호 바꾸기' }));
    await screen.findByText('! 현재 비밀번호가 맞지 않아요. 다시 확인해 주세요.');
    expect(mockAuth.replaceToken).not.toHaveBeenCalled();
    expect(mockAuth.signOut).not.toHaveBeenCalled();
    expect(screen.getByLabelText('현재 비밀번호').props.value).toBe('');
  });

  it('429 면 안내하고 버튼을 잠근다', async () => {
    setup((r) => (r.url === '/api/me/password' ? json(429, { code: 'TOO_MANY_ATTEMPTS', message: 'x' }) : undefined));
    await render(wrap(<PasswordChangeScreen />));
    await fill('wrong-pass', 'brandNewPass1', 'brandNewPass1');
    await fireEvent.press(screen.getByRole('button', { name: '비밀번호 바꾸기' }));
    await screen.findByText(/비밀번호를 여러 번 틀렸어요/);
    await waitFor(() => expect(screen.getByRole('button', { name: '비밀번호 바꾸기' }).props.accessibilityState.disabled).toBe(true));
  });

  it('한글 25자(75바이트)는 요청 없이 거절한다', async () => {
    setup(() => undefined);
    await render(wrap(<PasswordChangeScreen />));
    const k = '가'.repeat(25);
    await fill('password123', k, k);
    await fireEvent.press(screen.getByRole('button', { name: '비밀번호 바꾸기' }));
    await screen.findByText(/한글은 24자까지/);
    expect(calls).toHaveLength(0);
  });

  it('보기 토글이 세 칸의 가림을 한 번에 푼다', async () => {
    await render(wrap(<PasswordChangeScreen />));
    expect(screen.getByLabelText('현재 비밀번호').props.secureTextEntry).toBe(true);
    await fireEvent.press(screen.getByRole('checkbox', { name: '비밀번호 보기' }));
    expect(screen.getByLabelText('현재 비밀번호').props.secureTextEntry).toBe(false);
    expect(screen.getByLabelText('새 비밀번호 확인').props.secureTextEntry).toBe(false);
    expect(screen.getByText('비밀번호가 화면에 보이고 있어요.')).toBeTruthy();
  });

  it('입력이 있으면 [취소]에서 먼저 확인을 묻는다', async () => {
    await render(wrap(<PasswordChangeScreen />));
    await fireEvent.changeText(screen.getByLabelText('현재 비밀번호'), 'abc');
    await fireEvent.press(screen.getByRole('button', { name: '취소' }));
    expect(screen.getByText('저장하지 않고 나갈까요?')).toBeTruthy();
    expect(mockRouter.back).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('button', { name: '나가기' }));
    expect(mockRouter.back).toHaveBeenCalled();
  });
});

describe('회원 탈퇴', () => {
  async function toConfirm() {
    await fireEvent.press(screen.getByRole('button', { name: '탈퇴 계속하기' }));
    await screen.findByText('탈퇴 확인');
  }
  const checkbox = () => screen.getByRole('checkbox', { name: /지워지는 내용을 읽었고/ });

  it('단계 1: 지워지는 내용 6개와 [그대로 두기](먼저), [탈퇴 계속하기]', async () => {
    await render(wrap(<AccountDeleteScreen />));
    expect(screen.getByText('한 번 지우면 되돌릴 수 없어요.')).toBeTruthy();
    expect(screen.getByText('・ 반려동물 프로필과 사진')).toBeTruthy();
    expect(screen.getAllByText(/^・ /)).toHaveLength(6);
    const names = screen.getAllByRole('button').map((b) => b.props.accessibilityLabel);
    expect(names.indexOf('그대로 두기')).toBeLessThan(names.indexOf('탈퇴 계속하기'));
    await fireEvent.press(screen.getByRole('button', { name: '그대로 두기' }));
    expect(mockRouter.back).toHaveBeenCalled();
  });

  it('단계 2: 비밀번호·체크가 없으면 요청 없이 둘 다 알린다', async () => {
    setup(() => undefined);
    await render(wrap(<AccountDeleteScreen />));
    await toConfirm();
    await fireEvent.press(screen.getByRole('button', { name: '탈퇴하기' }));
    expect(screen.getByText('! 비밀번호를 입력해 주세요.')).toBeTruthy();
    expect(screen.getByText('! 내용을 읽었다면 체크해 주세요.')).toBeTruthy();
    expect(calls).toHaveLength(0);
  });

  it('204 면 withdraw 본문 {password, confirm:true} 를 보내고 정리 함수를 부른다', async () => {
    setup((r) => (r.url === '/api/me/withdraw' ? new Response(null, { status: 204 }) : undefined));
    await render(wrap(<AccountDeleteScreen />));
    await toConfirm();
    await fireEvent.changeText(screen.getByLabelText('비밀번호'), 'password123');
    await fireEvent.press(checkbox());
    await fireEvent.press(screen.getByRole('button', { name: '탈퇴하기' }));
    await waitFor(() => expect(mockAuth.finishWithdrawal).toHaveBeenCalledTimes(1));
    expect(calls).toEqual([{ url: '/api/me/withdraw', method: 'POST', body: { password: 'password123', confirm: true } }]);
  });

  it('비밀번호가 틀리면(400) 로그아웃 없이 머물고 비밀번호만 비운다', async () => {
    setup((r) => (r.url === '/api/me/withdraw' ? json(400, { code: 'CURRENT_PASSWORD_MISMATCH', message: 'x' }) : undefined));
    await render(wrap(<AccountDeleteScreen />));
    await toConfirm();
    await fireEvent.changeText(screen.getByLabelText('비밀번호'), 'wrong-pass');
    await fireEvent.press(checkbox());
    await fireEvent.press(screen.getByRole('button', { name: '탈퇴하기' }));
    await screen.findByText('! 비밀번호가 맞지 않아요. 다시 확인해 주세요.');
    expect(mockAuth.finishWithdrawal).not.toHaveBeenCalled();
    expect(mockAuth.signOut).not.toHaveBeenCalled();
    expect(screen.getByLabelText('비밀번호').props.value).toBe('');
    expect(checkbox().props.accessibilityState.checked).toBe(true);
  });

  it('연결 실패면 "끝났는지 확인하지 못했어요"를 알리고 입력을 유지한다', async () => {
    global.fetch = jest.fn(async () => {
      throw new TypeError('Network request failed');
    }) as never;
    await render(wrap(<AccountDeleteScreen />));
    await toConfirm();
    await fireEvent.changeText(screen.getByLabelText('비밀번호'), 'password123');
    await fireEvent.press(checkbox());
    await fireEvent.press(screen.getByRole('button', { name: '탈퇴하기' }));
    await screen.findByText('탈퇴가 끝났는지 확인하지 못했어요. 계정은 아직 그대로일 수 있어요.');
    expect(screen.getByLabelText('비밀번호').props.value).toBe('password123');
    expect(mockAuth.finishWithdrawal).not.toHaveBeenCalled();
  });

  it('삭제 중에는 입력과 [그대로 두기]가 잠기고 요청은 한 번만 나간다', async () => {
    let release: (r: Response) => void = () => {};
    setup((r) => (r.url === '/api/me/withdraw' ? new Promise<Response>((res) => (release = res)) : undefined));
    await render(wrap(<AccountDeleteScreen />));
    await toConfirm();
    await fireEvent.changeText(screen.getByLabelText('비밀번호'), 'password123');
    await fireEvent.press(checkbox());
    await fireEvent.press(screen.getByRole('button', { name: '탈퇴하기' }));
    await screen.findByText('계정과 기록을 지우는 중이에요.');
    await fireEvent.press(screen.getByRole('button', { name: '탈퇴하는 중' }));
    expect(screen.getByLabelText('비밀번호').props.editable).toBe(false);
    expect(screen.getByRole('button', { name: '그대로 두기' }).props.accessibilityState.disabled).toBe(true);
    expect(calls.filter((c) => c.url === '/api/me/withdraw')).toHaveLength(1);
    await act(async () => release(new Response(null, { status: 204 })));
    await waitFor(() => expect(mockAuth.finishWithdrawal).toHaveBeenCalled());
  });

  it('삭제 중 시스템 뒤로가기는 막는다', async () => {
    const { systemBack } = require('../testing/mockRouter');
    let release: (r: Response) => void = () => {};
    setup((r) => (r.url === '/api/me/withdraw' ? new Promise<Response>((res) => (release = res)) : undefined));
    await render(wrap(<AccountDeleteScreen />));
    await toConfirm();
    await fireEvent.changeText(screen.getByLabelText('비밀번호'), 'password123');
    await fireEvent.press(checkbox());
    await fireEvent.press(screen.getByRole('button', { name: '탈퇴하기' }));
    await screen.findByText('계정과 기록을 지우는 중이에요.');
    let blocked = false;
    await act(async () => {
      blocked = systemBack();
    });
    expect(blocked).toBe(true);
    await screen.findByText('지우는 중이라 화면을 닫을 수 없어요.');
    await act(async () => release(new Response(null, { status: 204 }))); // 요청 타이머를 남기지 않는다
  });

  it('글자 2.0배에서도 단계 1 목록과 두 버튼이 모두 있다', async () => {
    setFontScale(2);
    await render(wrap(<AccountDeleteScreen />));
    expect(screen.getAllByText(/^・ /)).toHaveLength(6);
    expect(screen.getByRole('button', { name: '탈퇴 계속하기' })).toBeTruthy();
  });
});
