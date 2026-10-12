import { fireEvent, render, screen } from '@testing-library/react-native';
import { MEMO_MAX_LENGTH } from '../lib/constants';
import { PRIVACY_TEXT } from '../lib/privacyText';
import { PET, json } from '../testing/fixtures';
import { setFontScale } from '../testing/fontScale';
import { resetRouterMocks } from '../testing/mockRouter';
import { PetContext } from '../pet/PetProvider';
import PetFormScreen from '../pet/PetFormScreen';
import { MemoSection } from './sections/MemoSection';

// QA 보강: 모바일 메모 도움말 — 글자 수 표시와 동시에 렌더, 큰 글씨, 입력 중 유지
jest.mock('../services/client', () => require('../testing/mockClient'));
jest.mock('expo-router', () => require('../testing/mockRouter').factory());

beforeEach(() => {
  resetRouterMocks();
  setFontScale(1);
  global.fetch = jest.fn(async () => json(404, { code: 'NOT_FOUND', message: 'x' })) as never;
});

describe('모바일 메모 도움말 — QA 보강', () => {
  it('오늘 메모: 도움말과 글자 수 표시가 함께 보이고, 입력해도 둘 다 유지된다', async () => {
    await render(<MemoSection value="" onChange={() => {}} />);
    expect(screen.getByText(PRIVACY_TEXT.memoHelp)).toBeTruthy();
    expect(screen.getByText(`0 / ${MEMO_MAX_LENGTH}`)).toBeTruthy();
    await render(<MemoSection value="밥 잘 먹음" onChange={() => {}} />);
    expect(screen.getAllByText(PRIVACY_TEXT.memoHelp).length).toBeGreaterThan(0);
    expect(screen.getByText(`6 / ${MEMO_MAX_LENGTH}`)).toBeTruthy();
  });

  it.each([1.3, 2.0])('오늘 메모 글자 %s배: 도움말·글자 수가 모두 있다', async (scale) => {
    setFontScale(scale);
    await render(<MemoSection value="" onChange={() => {}} />);
    expect(screen.getByText(PRIVACY_TEXT.memoHelp)).toBeTruthy();
    expect(screen.getByLabelText('메모 (선택)').props.accessibilityHint).toBeUndefined();
    expect(screen.getByText(`0 / ${MEMO_MAX_LENGTH}`)).toBeTruthy();
  });

  it('도움말 글은 placeholder/label 에 섞이지 않는다 (보이는 글자로만 읽힘)', async () => {
    await render(<MemoSection value="" onChange={() => {}} />);
    const input = screen.getByLabelText('메모 (선택)');
    expect(input.props.placeholder).not.toContain('보호자');
    expect(input.props.accessibilityLabel).toBe('메모 (선택)');
  });

  it.each(['new', 'edit'] as const)('질환 칸(%s) 글자 2.0배에서 입력 중에도 도움말이 하나만 보인다', async (mode) => {
    setFontScale(2);
    await render(
      <PetContext.Provider
        value={{ status: mode === 'edit' ? 'ready' : 'none', pet: mode === 'edit' ? PET : null, reload: jest.fn(async () => true), setPet: jest.fn() }}
      >
        <PetFormScreen mode={mode} />
      </PetContext.Provider>,
    );
    const input = screen.getByLabelText('앓고 있는 질환 (선택)');
    await fireEvent.changeText(input, '신부전, 심장병');
    expect(screen.getAllByText(PRIVACY_TEXT.memoHelp)).toHaveLength(1);
    expect(screen.getByLabelText('앓고 있는 질환 (선택)').props.accessibilityHint).toBeUndefined();
  });
});
