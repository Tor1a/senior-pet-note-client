import type { ReactNode } from 'react';
import { CHECKLIST_TEXT } from '../lib/checklistText';

/**
 * 오늘 화면 진입 카드 (온보딩 F단계). profileType 이 first_time 일 때만 그린다: senior·null·로딩 중이면 아무것도(빈 컨테이너 포함) 없다.
 * 체크 상태는 읽지 않는다(진행 상태·개수·배지 없음). children 은 버튼 모양 링크(이탈 가드를 쓰는 쪽에서 넘긴다).
 */
export default function ChecklistEntryCard({
  profileType,
  children,
}: {
  profileType: string | null | undefined;
  children: ReactNode;
}) {
  if (profileType !== 'first_time') return null;
  return (
    <section className="card" aria-labelledby="checklist-entry-title">
      <h2 id="checklist-entry-title">{CHECKLIST_TEXT.title}</h2>
      {children}
    </section>
  );
}
