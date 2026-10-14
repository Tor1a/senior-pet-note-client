import { companionLines } from '../lib/companionText';
import type { Companion } from '../lib/petApi';

/** 오늘 화면 헤더의 반려동물 줄 아래 사실 한 줄씩. 그릴 문장이 없으면 아무것도 그리지 않는다(빈 컨테이너 없음) */
export default function CompanionLine({
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
    <div className="companion-line">
      {lines.map((line) => (
        <p key={line} className="muted">
          {line}
        </p>
      ))}
    </div>
  );
}
