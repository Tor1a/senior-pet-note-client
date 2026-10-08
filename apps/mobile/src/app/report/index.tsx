// 병원 방문 리포트 라우트(/report). 얇게 유지한다: 반려동물 확인(PetGate) 뒤에 화면(ReportScreen)
import { PetGate } from '../../pet/PetGate';
import ReportScreen from '../../report/ReportScreen';

export default function ReportRoute() {
  return (
    <PetGate title="병원 방문 리포트">
      <ReportScreen />
    </PetGate>
  );
}
