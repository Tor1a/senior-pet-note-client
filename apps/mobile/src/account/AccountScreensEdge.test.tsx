import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { setFontScale } from '../testing/fontScale';
import { json } from '../testing/fixtures';
import { resetRouterMocks } from '../testing/mockRouter';
import { PushContext } from '../push/pushContext';
import AccountDeleteScreen from './AccountDeleteScreen';
import PasswordChangeScreen from './PasswordChangeScreen';

// QA 보강: 429 잠금 해제, 탈퇴 실패 뒤 재시도, 500 문구, 큰 글씨 배율
jest.mock('../services/client', () => require('../testing/mockClient'));
jest.mock('expo-router', () => require('../testing/mockRouter').factory());
const mockAuth = {
  user: { id: 'u1', email: 'owner@example.com' },
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
const wrap = (n: React.ReactElement) => <PushContext.Provider value={push}>{n}</PushContext.Provider>;

type Req = { url: string; method: string; body: any };
let calls: Req[] = [];
function setup(handler: (r: Req, n: number) => Response | undefined) {
  global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
    const req = { url: String(url).replace('http://test', ''), method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : undefined };
    calls.push(req);
    return handler(req, calls.length) ?? json(404, { code: 'NOT_FOUND', message: 'x' });
  }) as never;
}
const tooMany = () =>
  new Response(JSON.stringify({ code: 'TOO_MANY_ATTEMPTS', message: 'x' }), {
    status: 429,
    headers: { 'Content-Type': 'application/json', 'Retry-After': '30' },
  });

beforeEach(() => {
  resetRouterMocks();
  setFontScale(1);
  calls = [];
  mockAuth.signOut.mockReset();
  mockAuth.replaceToken.mockClear();
  mockAuth.finishWithdrawal.mockClear();
});
afterEach(() => jest.useRealTimers());

async function fillPw(cur: string, nw: string) {
  await fireEvent.changeText(screen.getByLabelText('현재 비밀번호'), cur);
  await fireEvent.changeText(screen.getByLabelText(/^새 비밀번호 \(/), nw);
  await fireEvent.changeText(screen.getByLabelText('새 비밀번호 확인'), nw);
}
async function fillWithdraw(pw: string) {
  await fireEvent.press(screen.getByRole('button', { name: '탈퇴 계속하기' }));
  await screen.findByText('탈퇴 확인');
  await fireEvent.changeText(screen.getByLabelText('비밀번호'), pw);
  await fireEvent.press(screen.getByRole('checkbox', { name: /지워지는 내용을 읽었고/ }));
}

describe('비밀번호 변경 QA', () => {
  it('429 잠금은 Retry-After 가 지나면 풀리고 다시 요청할 수 있다', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
    let n = 0;
    setup((r) => (r.url === '/api/me/password' ? (++n === 1 ? tooMany() : json(200, { accessToken: 't2' })) : undefined));
    await render(wrap(<PasswordChangeScreen />));
    await fillPw('password123', 'brandNewPass1');
    await fireEvent.press(screen.getByRole('button', { name: '비밀번호 바꾸기' }));
    await waitFor(() => expect(screen.getByRole('button', { name: '비밀번호 바꾸기' }).props.accessibilityState.disabled).toBe(true));
    await act(async () => {
      jest.advanceTimersByTime(29_000);
    });
    expect(screen.getByRole('button', { name: '비밀번호 바꾸기' }).props.accessibilityState.disabled).toBe(true);
    await act(async () => {
      jest.advanceTimersByTime(2_000);
    });
    await waitFor(() => expect(screen.getByRole('button', { name: '비밀번호 바꾸기' }).props.accessibilityState.disabled).toBeFalsy());
    await fireEvent.press(screen.getByRole('button', { name: '비밀번호 바꾸기' }));
    await waitFor(() => expect(mockAuth.replaceToken).toHaveBeenCalledWith('t2'));
  });

  it('500 이면 "바뀌지 않았어요" 를 알리고 토큰을 바꾸지 않으며 재시도하면 성공한다', async () => {
    let n = 0;
    setup((r) => (r.url === '/api/me/password' ? (++n === 1 ? json(500, { code: 'INTERNAL_ERROR', message: 'x' }) : json(200, { accessToken: 't3' })) : undefined));
    await render(wrap(<PasswordChangeScreen />));
    await fillPw('password123', 'brandNewPass1');
    await fireEvent.press(screen.getByRole('button', { name: '비밀번호 바꾸기' }));
    await screen.findByText('비밀번호는 바뀌지 않았어요.');
    expect(mockAuth.replaceToken).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('button', { name: '비밀번호 바꾸기' }));
    await waitFor(() => expect(mockAuth.replaceToken).toHaveBeenCalledWith('t3'));
    expect(calls).toHaveLength(2);
  });

  it('새 토큰을 기기에 저장하지 못해도 성공 화면과 다시 로그인 안내를 보인다', async () => {
    mockAuth.replaceToken.mockResolvedValueOnce(false);
    setup((r) => (r.url === '/api/me/password' ? json(200, { accessToken: 't4' }) : undefined));
    await render(wrap(<PasswordChangeScreen />));
    await fillPw('password123', 'brandNewPass1');
    await fireEvent.press(screen.getByRole('button', { name: '비밀번호 바꾸기' }));
    await screen.findByText(/비밀번호를 바꿨어요/);
    expect(screen.getByText(/로그인 정보를 저장하지 못했어요/)).toBeTruthy();
  });

  it('401 이면 토큰을 바꾸지 않는다', async () => {
    setup((r) => (r.url === '/api/me/password' ? json(401, { code: 'UNAUTHORIZED', message: 'x' }) : undefined));
    await render(wrap(<PasswordChangeScreen />));
    await fillPw('password123', 'brandNewPass1');
    await fireEvent.press(screen.getByRole('button', { name: '비밀번호 바꾸기' }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(mockAuth.replaceToken).not.toHaveBeenCalled();
  });

  it('글자 2.0배에서도 세 칸과 버튼이 모두 있다', async () => {
    setFontScale(2);
    await render(wrap(<PasswordChangeScreen />));
    expect(screen.getByLabelText('현재 비밀번호')).toBeTruthy();
    expect(screen.getByLabelText(/^새 비밀번호 \(/)).toBeTruthy();
    expect(screen.getByLabelText('새 비밀번호 확인')).toBeTruthy();
    expect(screen.getByRole('button', { name: '비밀번호 바꾸기' })).toBeTruthy();
  });
});

describe('탈퇴 QA', () => {
  it('실패(500) 뒤 같은 입력으로 다시 눌러 성공한다', async () => {
    let n = 0;
    setup((r) => (r.url === '/api/me/withdraw' ? (++n === 1 ? json(500, { code: 'INTERNAL_ERROR', message: 'x' }) : new Response(null, { status: 204 })) : undefined));
    await render(wrap(<AccountDeleteScreen />));
    await fillWithdraw('password123');
    await fireEvent.press(screen.getByRole('button', { name: '탈퇴하기' }));
    await screen.findByText('탈퇴가 끝나지 않았어요. 계정과 기록은 그대로 있어요.');
    expect(mockAuth.finishWithdrawal).not.toHaveBeenCalled();
    expect(screen.getByLabelText('비밀번호').props.editable).not.toBe(false);
    await fireEvent.press(screen.getByRole('button', { name: '탈퇴하기' }));
    await waitFor(() => expect(mockAuth.finishWithdrawal).toHaveBeenCalledTimes(1));
    expect(calls).toHaveLength(2);
  });

  it('429 면 잠기고 지나면 풀린다', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
    setup((r) => (r.url === '/api/me/withdraw' ? tooMany() : undefined));
    await render(wrap(<AccountDeleteScreen />));
    await fillWithdraw('password123');
    await fireEvent.press(screen.getByRole('button', { name: '탈퇴하기' }));
    await screen.findByText(/비밀번호를 여러 번 틀렸어요/);
    await waitFor(() => expect(screen.getByRole('button', { name: '탈퇴하기' }).props.accessibilityState.disabled).toBe(true));
    await act(async () => {
      jest.advanceTimersByTime(31_000);
    });
    await waitFor(() => expect(screen.getByRole('button', { name: '탈퇴하기' }).props.accessibilityState.disabled).toBeFalsy());
  });

  it('401 이면 finishWithdrawal 을 부르지 않는다', async () => {
    setup((r) => (r.url === '/api/me/withdraw' ? json(401, { code: 'UNAUTHORIZED', message: 'x' }) : undefined));
    await render(wrap(<AccountDeleteScreen />));
    await fillWithdraw('password123');
    await fireEvent.press(screen.getByRole('button', { name: '탈퇴하기' }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(mockAuth.finishWithdrawal).not.toHaveBeenCalled();
  });

  it('글자 2.0배에서 단계 2 입력·체크·버튼이 모두 있다', async () => {
    setFontScale(2);
    await render(wrap(<AccountDeleteScreen />));
    await fireEvent.press(screen.getByRole('button', { name: '탈퇴 계속하기' }));
    await screen.findByText('탈퇴 확인');
    expect(screen.getByLabelText('비밀번호')).toBeTruthy();
    expect(screen.getByRole('checkbox', { name: /지워지는 내용을 읽었고/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: '탈퇴하기' })).toBeTruthy();
  });
});
