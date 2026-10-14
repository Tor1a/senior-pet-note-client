// 체크리스트 체크 상태를 이 기기(localStorage)에 읽고 쓴다 (온보딩 F단계). 서버 전송 없음.
// 접근이 막혀도(사파리 프라이빗 모드 등) 던지지 않는다: 읽기는 빈 상태, 쓰기는 조용히 무시(화면의 상태는 유지).
import { CHECKLIST_STORAGE_KEY, parseChecklist, serializeChecklist, type ChecklistData } from './checklistState';

export function loadChecklist(): ChecklistData {
  try {
    if (typeof localStorage === 'undefined') return {};
    return parseChecklist(localStorage.getItem(CHECKLIST_STORAGE_KEY));
  } catch {
    return {};
  }
}

export function saveChecklist(data: ChecklistData): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(CHECKLIST_STORAGE_KEY, serializeChecklist(data));
  } catch {
    // 저장하지 못해도 화면은 계속 쓴다
  }
}
