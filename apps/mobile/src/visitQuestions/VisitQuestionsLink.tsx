// 진료 때 물어볼 것으로 가는 링크 행 (오늘 화면 · 할 일 목록 · 체크리스트 질문 탭). 개수·배지·진행 문구 없음, API 호출 없음.
// 높이 56 이상. 글자가 길어져도 줄바꿈한다(글자는 줄이지 않는다).
import { useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';
import { AppText } from '../components/ui';
import { VISIT_QUESTION_TEXT as T } from '../lib/visitQuestionText';
import { colors, spacing, touch } from '../theme';
import { visitQuestionsHref, type VisitQuestionsFrom } from './routes';

export function VisitQuestionsLink({ from, variant = 'default' }: { from?: VisitQuestionsFrom; variant?: 'default' | 'checklist' }) {
  const router = useRouter();
  const label = variant === 'checklist' ? T.checklistTitle : T.title;
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={label}
      onPress={() => router.push(visitQuestionsHref(from) as never)}
      style={({ pressed }) => [
        {
          minHeight: touch.primaryHeight,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: spacing.sm,
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.sm,
          borderWidth: 2,
          borderColor: colors.border,
          borderRadius: 12,
          backgroundColor: colors.surface,
        },
        pressed && { opacity: 0.6 },
      ]}
    >
      <View style={{ flex: 1, flexShrink: 1 }}>
        <AppText style={{ fontWeight: '700' }}>{label}</AppText>
      </View>
      <AppText importantForAccessibility="no" accessibilityElementsHidden style={{ fontWeight: '700' }}>
        ›
      </AppText>
    </Pressable>
  );
}
