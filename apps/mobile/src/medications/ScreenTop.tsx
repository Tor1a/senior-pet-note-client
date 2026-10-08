// 새 화면 맨 위 줄: [← 뒤로] + 제목(+ 보조 줄). 헤더를 숨긴 스택이라 화면 안에 직접 둔다(설계 2-3)
import { View } from 'react-native';
import { AppText, LinkButton } from '../components/ui';

export function ScreenTop({
  backLabel,
  backA11yLabel,
  onBack,
  title,
  lead,
}: {
  backLabel: string;
  backA11yLabel: string;
  onBack: () => void;
  title: string;
  lead?: string;
}) {
  return (
    <View style={{ gap: 4 }}>
      <LinkButton label={`← ${backLabel}`} accessibilityLabel={backA11yLabel} onPress={onBack} />
      <AppText variant="title" accessibilityRole="header">
        {title}
      </AppText>
      {lead ? <AppText variant="secondary">{lead}</AppText> : null}
    </View>
  );
}
