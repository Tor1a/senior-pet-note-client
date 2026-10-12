// 반려동물 아바타: 이름 첫 글자 원 (설계 6-1, 8-1). 사진은 2단계에서 이 파일 안에서만 붙인다(hasPhoto 를 받아도 지금은 그리지 않는다).
// - 첫 글자는 Array.from 으로 구한다(이모지·한글이 깨지지 않게). 공백뿐이면 빈 원이 되지 않게 · 를 쓴다.
// - 이름이 옆에 있으면 스크린리더에서 숨긴다(기본). 단독으로 쓸 때만 standalone 으로 "사진 없음"을 읽게 한다.
import { StyleSheet, View } from 'react-native';
import { AppText } from '../components/ui';
import { colors } from '../theme';

export function avatarInitial(name: string): string {
  const first = Array.from(name.trim())[0];
  return first ?? '·';
}

export function PetAvatar({ name, size = 48, standalone }: { name: string; size?: number; standalone?: boolean }) {
  const hiddenProps = standalone
    ? ({ accessible: true, accessibilityRole: 'image', accessibilityLabel: '사진 없음' } as const)
    : ({ accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' } as const);
  return (
    <View testID="pet-avatar" style={[styles.circle, { width: size, height: size, borderRadius: size / 2 }]} {...hiddenProps}>
      <AppText allowFontScaling={false} style={[styles.initial, { fontSize: Math.round(size * 0.45), lineHeight: Math.round(size * 0.6) }]}>
        {avatarInitial(name)}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  circle: { backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  initial: { color: colors.onPrimary, fontWeight: '700' },
});
