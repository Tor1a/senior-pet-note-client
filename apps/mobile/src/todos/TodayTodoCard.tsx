// 오늘 화면 맨 아래 "내 할 일 일정" 진입 카드 (기획서 Q3, 설계 2-2). 새 API 를 부르지 않는다(요약 줄 없음).
import { useRouter } from 'expo-router';
import { AppButton, AppText, Card } from '../components/ui';
import { TODO_TEXT } from '../lib/todoText';
import { TODOS_HREF } from './routes';
import { TODO_MOBILE_TEXT } from './todoMobileText';

export function TodayTodoCard() {
  const router = useRouter();
  return (
    <Card>
      <AppText variant="title" accessibilityRole="header">
        {TODO_TEXT.entryTitle}
      </AppText>
      <AppText>{TODO_TEXT.entryBody}</AppText>
      <AppButton
        label={TODO_TEXT.entryButton}
        accessibilityLabel={TODO_MOBILE_TEXT.entryA11y}
        variant="secondary"
        onPress={() => router.push(TODOS_HREF as never)}
      />
    </Card>
  );
}
