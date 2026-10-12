import { render, screen } from '@testing-library/react-native';
import { findPrivacyForbidden, PRIVACY_TEXT } from '../lib/privacyText';
import { json, PET } from '../testing/fixtures';
import { resetRouterMocks } from '../testing/mockRouter';
import { setFontScale } from '../testing/fontScale';
import { PetContext } from '../pet/PetProvider';
import PetFormScreen from '../pet/PetFormScreen';
import { MemoSection } from './sections/MemoSection';

// 메모 입력칸(오늘 메모, 반려동물 질환 메모) 아래 보호자 건강 정보 안내가 항상 보이고 화면에 보이고 힌트로 중복 낭독되지 않는지 본다.
jest.mock('../services/client', () => require('../testing/mockClient'));
jest.mock('expo-router', () => require('../testing/mockRouter').factory());

beforeEach(() => {
  resetRouterMocks();
  setFontScale(1);
  global.fetch = jest.fn(async () => json(404, { code: 'NOT_FOUND', message: 'x' })) as never;
});

describe('메모 입력칸 안내 문구', () => {
  it('문구에 금지 표현이 없다', () => {
    expect(findPrivacyForbidden(PRIVACY_TEXT.memoHelp)).toBeNull();
  });

  it('오늘 메모: 보이는 문구이고 힌트로 중복 낭독되지 않는다', async () => {
    await render(<MemoSection value="" onChange={() => {}} />);
    expect(screen.getByText(PRIVACY_TEXT.memoHelp)).toBeTruthy();
    expect(screen.getByLabelText('메모 (선택)').props.accessibilityHint).toBeUndefined();
  });

  it.each(['new', 'edit'] as const)('반려동물 폼(%s): 질환 입력칸 도움말이 보이고 힌트로 중복 낭독되지 않는다', async (mode) => {
    await render(
      <PetContext.Provider
        value={{
          status: mode === 'edit' ? 'ready' : 'none',
          pet: mode === 'edit' ? PET : null,
          reload: jest.fn(async () => true),
          setPet: jest.fn(),
        }}
      >
        <PetFormScreen mode={mode} />
      </PetContext.Provider>,
    );
    expect(screen.getByText(PRIVACY_TEXT.memoHelp)).toBeTruthy();
    expect(screen.getByLabelText('앓고 있는 질환 (선택)').props.accessibilityHint).toBeUndefined();
  });

  it('글자 2.0배에서도 도움말이 보인다', async () => {
    setFontScale(2);
    await render(<MemoSection value="" onChange={() => {}} />);
    expect(screen.getByText(PRIVACY_TEXT.memoHelp)).toBeTruthy();
  });
});
