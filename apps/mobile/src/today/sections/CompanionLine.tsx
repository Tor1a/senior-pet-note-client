// 헤더 반려동물 줄 아래 사실 줄(온보딩 E단계): 카드·아이콘·강조 없음. 그릴 문장이 없으면 아무것도 그리지 않는다.
// 두 줄을 한 묶음으로 보이는 글자와 같은 문장으로 읽게 한다(라이브 영역·알림 없음).
import { StyleSheet, View } from 'react-native';
import { AppText } from '../../components/ui';
import { companionLines } from '../../lib/companionText';
import type { Companion } from '../../lib/petApi';

export function CompanionLine({
  companion,
  name,
  profileType,
}: {
  companion: Companion | null | undefined;
  name: string;
  profileType: string | null | undefined;
}) {
  const lines = companionLines(companion, name, profileType);
  if (lines.length === 0) return null;
  return (
    <View style={styles.box} accessible accessibilityLabel={lines.join(', ')}>
      {lines.map((line) => (
        <AppText key={line} variant="secondary" style={styles.line}>
          {line}
        </AppText>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: 2 },
  line: { flexShrink: 1 },
});
