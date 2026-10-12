import { fireEvent, render, screen } from '@testing-library/react-native';
import { PRIVACY_TEXT } from '../lib/privacyText';
import { setFontScale } from '../testing/fontScale';
import { resetRouterMocks } from '../testing/mockRouter';
import { PushContext } from '../push/pushContext';
import { AuthForm } from './AuthForm';

// 가입 화면의 "만 14세 이상입니다" 확인. 화면에서만 확인하고 가입 요청(authenticate 인자)에는 싣지 않는다.
jest.mock('../services/client', () => ({ apiConfig: { ok: true, baseUrl: 'http://test' } }));
jest.mock('expo-router', () => ({
  ...require('../testing/mockRouter').factory(),
  Link: ({ children }: { children: React.ReactNode }) => children,
}));
const mockAuth = {
  authenticate: jest.fn(async (_mode: string, _email: string, _password: string) => {}),
  farewell: false,
  clearFarewell: jest.fn(),
};
jest.mock('../auth/AuthContext', () => ({ useAuth: () => mockAuth }));
let mockPrivacyUrl: string | null = null;
jest.mock('../account/privacy', () => ({
  get PRIVACY_POLICY_URL() {
    return mockPrivacyUrl;
  },
}));

const push = {
  state: 'unavailable' as const,
  requestPermission: async () => 'unavailable' as const,
  recheck: async () => 'unavailable' as const,
  bannerVisible: false,
  subscribe: () => () => {},
};
const renderForm = (mode: 'signup' | 'login') =>
  render(
    <PushContext.Provider value={push}>
      <AuthForm mode={mode} />
    </PushContext.Provider>,
  );

async function fill() {
  await fireEvent.changeText(screen.getByLabelText('이메일'), 'n@b.c');
  await fireEvent.changeText(screen.getByLabelText('비밀번호 (8자 이상)'), 'pw123456');
  await fireEvent.changeText(screen.getByLabelText('비밀번호 확인'), 'pw123456');
}

beforeEach(() => {
  resetRouterMocks();
  setFontScale(1);
  mockPrivacyUrl = null;
  mockAuth.authenticate.mockClear();
});

describe('가입 화면 — 만 14세 확인', () => {
  it('체크하지 않고 제출하면 칸 오류를 보이고 가입을 요청하지 않는다', async () => {
    await renderForm('signup');
    await fill();
    await fireEvent.press(screen.getByRole('button', { name: '가입하기' }));
    expect(screen.getByText(`! ${PRIVACY_TEXT.ageError}`)).toBeTruthy();
    expect(mockAuth.authenticate).not.toHaveBeenCalled();
  });

  it('체크하면 오류가 사라지고 기존과 같은 인자(모드·이메일·비밀번호)로 가입한다', async () => {
    await renderForm('signup');
    await fill();
    await fireEvent.press(screen.getByRole('button', { name: '가입하기' }));
    await fireEvent.press(screen.getByRole('checkbox', { name: PRIVACY_TEXT.ageCheck }));
    expect(screen.queryByText(`! ${PRIVACY_TEXT.ageError}`)).toBeNull();
    expect(screen.getByRole('checkbox', { name: PRIVACY_TEXT.ageCheck }).props.accessibilityState.checked).toBe(true);
    await fireEvent.press(screen.getByRole('button', { name: '가입하기' }));
    expect(mockAuth.authenticate).toHaveBeenCalledTimes(1);
    expect(mockAuth.authenticate).toHaveBeenCalledWith('signup', 'n@b.c', 'pw123456');
  });

  it('로그인 화면에는 체크박스가 없다', async () => {
    await renderForm('login');
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.queryByText(PRIVACY_TEXT.ageCheck)).toBeNull();
  });

  it('글자 2.0배에서도 체크 항목이 있고 터치 영역이 48 이상이다', async () => {
    setFontScale(2);
    await renderForm('signup');
    const box = screen.getByRole('checkbox', { name: PRIVACY_TEXT.ageCheck });
    const style = Object.assign({}, ...[box.props.style].flat(Infinity).filter(Boolean));
    expect(style.minHeight).toBeGreaterThanOrEqual(48);
  });

  it('처리방침 주소가 있으면 링크를 보이고, 없으면 숨긴다', async () => {
    await renderForm('signup');
    expect(screen.queryByText(/개인정보 처리방침/)).toBeNull();
    mockPrivacyUrl = 'https://example.com/privacy';
    await renderForm('signup');
    expect(screen.getByRole('button', { name: '개인정보 처리방침 보기, 브라우저에서 열려요' })).toBeTruthy();
  });
});
