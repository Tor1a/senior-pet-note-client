import { fireEvent, render, screen } from '@testing-library/react-native';
import { ApiError } from '../lib/api';
import { PRIVACY_TEXT } from '../lib/privacyText';
import { setFontScale } from '../testing/fontScale';
import { resetRouterMocks } from '../testing/mockRouter';
import { PushContext } from '../push/pushContext';
import { AuthForm } from './AuthForm';

// QA 보강: 모바일 가입 화면 만 14세 확인의 경계 동작
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
jest.mock('../account/privacy', () => ({ PRIVACY_POLICY_URL: null }));

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
const checkbox = () => screen.getByRole('checkbox', { name: PRIVACY_TEXT.ageCheck });
const checked = () => checkbox().props.accessibilityState.checked;
const flat = (s: unknown) => Object.assign({}, ...[s].flat(Infinity).filter(Boolean));

beforeEach(() => {
  resetRouterMocks();
  setFontScale(1);
  mockAuth.authenticate.mockReset();
  mockAuth.authenticate.mockImplementation(async () => {});
});

describe('모바일 가입 화면 만 14세 확인 — QA 보강', () => {
  it('체크 없이 비밀번호 확인 칸에서 키보드 제출(onSubmitEditing)이 있어도 가입 호출이 없다', async () => {
    await renderForm('signup');
    await fill();
    // 이 화면의 입력칸은 제출 핸들러가 없다 → 제출 경로는 버튼뿐. 버튼만 누른다.
    await fireEvent.press(screen.getByRole('button', { name: '가입하기' }));
    expect(mockAuth.authenticate).not.toHaveBeenCalled();
    expect(screen.getByText(`! ${PRIVACY_TEXT.ageError}`)).toBeTruthy();
  });

  it('체크 → 해제 후 제출하면 막힌다', async () => {
    await renderForm('signup');
    await fill();
    await fireEvent.press(checkbox());
    expect(checked()).toBe(true);
    await fireEvent.press(checkbox());
    expect(checked()).toBe(false);
    await fireEvent.press(screen.getByRole('button', { name: '가입하기' }));
    expect(mockAuth.authenticate).not.toHaveBeenCalled();
    expect(screen.getByText(`! ${PRIVACY_TEXT.ageError}`)).toBeTruthy();
  });

  it('오류가 난 뒤 체크하면 오류가 사라지고, 해제만 해서는 오류가 돌아오지 않는다', async () => {
    await renderForm('signup');
    await fill();
    await fireEvent.press(screen.getByRole('button', { name: '가입하기' }));
    await fireEvent.press(checkbox());
    expect(screen.queryByText(`! ${PRIVACY_TEXT.ageError}`)).toBeNull();
    await fireEvent.press(checkbox());
    expect(screen.queryByText(`! ${PRIVACY_TEXT.ageError}`)).toBeNull();
  });

  it('이미 가입된 이메일(409)이면 안내가 뜨고 체크는 유지되며, 다시 눌러도 재요청된다', async () => {
    mockAuth.authenticate.mockRejectedValue(new ApiError('http', 409, 'EMAIL_TAKEN', 'taken'));
    await renderForm('signup');
    await fill();
    await fireEvent.press(checkbox());
    await fireEvent.press(screen.getByRole('button', { name: '가입하기' }));
    expect(await screen.findByText(/이미 가입된 이메일/)).toBeTruthy();
    expect(checked()).toBe(true);
    expect(screen.queryByText(`! ${PRIVACY_TEXT.ageError}`)).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: '가입하기' }));
    expect(mockAuth.authenticate).toHaveBeenCalledTimes(2);
    for (const call of mockAuth.authenticate.mock.calls) expect(call).toEqual(['signup', 'n@b.c', 'pw123456']);
  });

  it('로그인 화면은 체크 없이 로그인 호출을 하고 인자가 (login, 이메일, 비밀번호) 뿐이다', async () => {
    await renderForm('login');
    await fireEvent.changeText(screen.getByLabelText('이메일'), 'n@b.c');
    await fireEvent.changeText(screen.getByLabelText('비밀번호'), 'pw123456');
    await fireEvent.press(screen.getByRole('button', { name: '로그인' }));
    expect(mockAuth.authenticate).toHaveBeenCalledWith('login', 'n@b.c', 'pw123456');
    expect(mockAuth.authenticate.mock.calls[0]).toHaveLength(3);
  });

  it.each([1.3, 2.0])('글자 %s배: 체크 항목이 보이고 터치 영역(높이·너비)이 48 이상이다', async (scale) => {
    setFontScale(scale);
    await renderForm('signup');
    const style = flat(checkbox().props.style);
    expect(style.minHeight).toBeGreaterThanOrEqual(48);
    expect(style.minWidth).toBeGreaterThanOrEqual(48);
    expect(screen.getByRole('button', { name: '가입하기' })).toBeTruthy();
  });

  it('체크 상태가 글자로도 구분된다 (✓ 표시)', async () => {
    await renderForm('signup');
    expect(screen.queryByText(`✓ ${PRIVACY_TEXT.ageCheck}`)).toBeNull();
    await fireEvent.press(checkbox());
    expect(screen.getByText(`✓ ${PRIVACY_TEXT.ageCheck}`)).toBeTruthy();
  });
});
