// 약 등록·수정 폼의 입력 상태 ↔ API 본문 변환과 1차 검증
// (계약: docs/api-today.md 3장 약 API, 화면 설계: .company/design/모바일-약-관리.md 4장)
// - 웹 MedicationsPage 에서 추출했다. 동작은 그대로(위치만 이동).
import type { Medication, MedicationInput } from './petApi';

export const NAME_MAX = 50;
export const DOSE_MAX = 50;
export const MAX_TIMES = 3;
/** 시각을 추가할 때 처음 들어가는 값 */
export const ADDED_TIME_DEFAULT = '20:00';

export interface MedicationDraft {
  id: string | null; // null 이면 새 약
  name: string;
  doseText: string;
  times: string[];
}

export const EMPTY_MEDICATION_DRAFT: MedicationDraft = { id: null, name: '', doseText: '', times: ['08:00'] };

/** 입력 확인. 문제가 있으면 안내 문구 */
export function validateMedicationDraft(d: MedicationDraft): string | null {
  if (!d.name.trim()) return '약 이름을 적어 주세요.';
  if (d.name.trim().length > NAME_MAX) return `약 이름은 ${NAME_MAX}자까지 적을 수 있어요.`;
  if (d.doseText.trim().length > DOSE_MAX) return `용량은 ${DOSE_MAX}자까지 적을 수 있어요.`;
  if (d.times.length < 1 || d.times.length > MAX_TIMES) return '먹이는 시각을 1~3개 정해 주세요.';
  if (d.times.some((t) => !/^\d{2}:\d{2}$/.test(t))) return '먹이는 시각을 모두 골라 주세요.';
  if (new Set(d.times).size !== d.times.length) return '같은 시각이 두 번 들어갔어요. 서로 다른 시각으로 골라 주세요.';
  return null;
}

/** 고치기 폼의 처음 값 */
export function draftFromMedication(m: Medication): MedicationDraft {
  return { id: m.id, name: m.name, doseText: m.doseText ?? '', times: [...m.times] };
}

/** 화면 입력 → API 본문. 이름·용량 앞뒤 공백 제거, 용량이 비면 null, 시각은 오름차순 */
export function toMedicationInput(d: MedicationDraft): MedicationInput {
  return {
    name: d.name.trim(),
    doseText: d.doseText.trim() ? d.doseText.trim() : null,
    times: [...d.times].sort(),
  };
}

/** [+ 시각 추가]: 20:00 을 덧붙인다(최대 3개) */
export function addTime(times: string[]): string[] {
  return [...times, ADDED_TIME_DEFAULT].slice(0, MAX_TIMES);
}

/** [이 시각 빼기] */
export function removeTime(times: string[], index: number): string[] {
  return times.filter((_, i) => i !== index);
}

/** i번째 시각만 바꾼다 */
export function setTimeAt(times: string[], index: number, value: string): string[] {
  return times.map((t, i) => (i === index ? value : t));
}
