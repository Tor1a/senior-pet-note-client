import { render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { avatarInitial, PetAvatar } from './PetAvatar';

describe('avatarInitial', () => {
  it('이름 첫 글자, 이모지·한글이 깨지지 않고 공백뿐이면 ·', () => {
    expect(avatarInitial('보리')).toBe('보');
    expect(avatarInitial('Bori')).toBe('B');
    expect(avatarInitial('🐶멍멍')).toBe('🐶');
    expect(avatarInitial('  초코')).toBe('초');
    expect(avatarInitial('')).toBe('·');
    expect(avatarInitial('   ')).toBe('·');
  });
});

describe('PetAvatar', () => {
  it('원 크기와 글자(지름의 약 45%)', async () => {
    await render(<PetAvatar name="보리" size={64} />);
    const circle = screen.getByTestId('pet-avatar', { includeHiddenElements: true });
    expect(StyleSheet.flatten(circle.props.style)).toMatchObject({ width: 64, height: 64, borderRadius: 32 });
    expect(StyleSheet.flatten(screen.getByText('보', { includeHiddenElements: true }).props.style)).toMatchObject({ fontSize: 29 });
  });

  it('이름 옆에 쓸 때는 스크린리더에서 숨긴다', async () => {
    await render(<PetAvatar name="보리" />);
    expect(screen.queryByText('보')).toBeNull();
    expect(screen.getByTestId('pet-avatar', { includeHiddenElements: true }).props.accessibilityElementsHidden).toBe(true);
  });

  it('단독(standalone)이면 "사진 없음" 으로 읽힌다', async () => {
    await render(<PetAvatar name="보리" standalone />);
    expect(screen.getByLabelText('사진 없음')).toBeTruthy();
  });
});
