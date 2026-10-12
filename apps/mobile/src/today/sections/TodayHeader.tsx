// 날짜 · 반려동물 줄. 사진 표시는 아직 없어 이름 첫 글자 아바타(PetAvatar)를 쓴다(사진은 2단계). 누르는 요소로 만들지 않는다.
import { StyleSheet, View } from 'react-native';
import { AppText } from '../../components/ui';
import { PetAvatar } from '../../pet/PetAvatar';
import { spacing } from '../../theme';

export function TodayHeader({ dateText, petName, info }: { dateText: string; petName: string; info: string }) {
  return (
    <View style={styles.header}>
      <AppText variant="title" accessibilityRole="header">
        {dateText}
      </AppText>
      <View style={styles.petLine}>
        <PetAvatar name={petName} size={48} />
        <AppText style={styles.info}>{info}</AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { gap: spacing.sm },
  petLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  info: { flexShrink: 1 },
});
