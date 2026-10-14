// 체크리스트 체크 상태의 저장 형식과 순수 로직 (온보딩 F단계). 저장소 접근은 checklistStorage.ts.
// 근거: .company/plans/초보-견주-온보딩-F.md 4장. 웹 원본. 모바일은 그대로 복사한다.
// 저장 값은 JSON {"v":1,"p":{"<petId>":["prep.water_bowl"]}} 뿐: 체크된 항목 id 만(이름·문구·시각 없음).
import { CHECKLIST_ITEMS } from './checklistContent';

export const CHECKLIST_STORAGE_KEY = 'spn.checklist';
const VERSION = 1;

/** petId -> 체크된 항목 id 목록 */
export type ChecklistData = Record<string, string[]>;

const KNOWN_IDS: ReadonlySet<string> = new Set(CHECKLIST_ITEMS.map((item) => item.id));

/** 저장된 문자열을 읽는다. 손상·알 수 없는 버전·배열 아님이면 빈 상태, 목록에 없는 id 는 버린다. 던지지 않는다 */
export function parseChecklist(raw: string | null | undefined): ChecklistData {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const obj = parsed as { v?: unknown; p?: unknown };
    if (obj.v !== VERSION) return {};
    if (!obj.p || typeof obj.p !== 'object' || Array.isArray(obj.p)) return {};
    const out: ChecklistData = {};
    for (const [petId, ids] of Object.entries(obj.p as Record<string, unknown>)) {
      if (!Array.isArray(ids)) continue;
      const clean = Array.from(new Set(ids.filter((id): id is string => typeof id === 'string' && KNOWN_IDS.has(id))));
      if (clean.length > 0) out[petId] = clean;
    }
    return out;
  } catch {
    return {};
  }
}

export function serializeChecklist(data: ChecklistData): string {
  const p: ChecklistData = {};
  for (const [petId, ids] of Object.entries(data)) {
    if (ids.length > 0) p[petId] = ids;
  }
  return JSON.stringify({ v: VERSION, p });
}

/** 체크 토글(같은 id 가 두 번 들어가지 않음). 원본은 바꾸지 않는다 */
export function toggleChecked(data: ChecklistData, petId: string, itemId: string): ChecklistData {
  const current = data[petId] ?? [];
  const next = current.includes(itemId) ? current.filter((id) => id !== itemId) : [...current, itemId];
  return { ...data, [petId]: next };
}

export function isChecked(data: ChecklistData, petId: string, itemId: string): boolean {
  return (data[petId] ?? []).includes(itemId);
}
