// 하루 상세 라우트(/history/[recordDate], 읽기 전용)
import { useLocalSearchParams } from 'expo-router';
import HistoryDayScreen from '../../history/HistoryDayScreen';
import { PetGate } from '../../pet/PetGate';

export default function HistoryDayRoute() {
  const { recordDate } = useLocalSearchParams<{ recordDate: string }>();
  return (
    <PetGate title="지난 기록">
      <HistoryDayScreen key={recordDate} recordDate={recordDate} />
    </PetGate>
  );
}
