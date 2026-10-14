// [공유 로직 테스트 사본] 원본: web/src/lib/checklistContent.test.ts (2026-10-14 복사)
// 웹 원본에서 첫 줄 `import ... from 'vitest'` 한 줄을 제거하고 expect(값, 메시지) 의 메시지 인자 3곳을 뺐다(jest 타입에 없음). 나머지 본문은 동일하다.
// 웹 원본을 고치면 이 사본도 같이 고친다. 추후 packages/shared 로 통합 예정.
import { CHECKLIST_ITEMS, checklistItemsFor, type ChecklistGroup } from './checklistContent';
import type { Species } from './petApi';

const GROUPS: ChecklistGroup[] = ['prep', 'ask'];
const SPECIES: Species[] = ['dog', 'cat'];

describe('checklistContent 항목 규칙', () => {
  it('id 는 중복이 없고 접두 + 소문자 스네이크, 25자 이내', () => {
    const ids = CHECKLIST_ITEMS.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const item of CHECKLIST_ITEMS) {
      expect(item.id).toMatch(/^(prep|ask)\.[a-z]+(_[a-z]+)*$/);
      expect(item.id.startsWith(`${item.group}.`)).toBe(true);
      expect(item.id.length).toBeLessThanOrEqual(25);
    }
  });

  it('개수 상한: 탭당 10, 합계 20, 종별 2 (한 종 기준)', () => {
    for (const species of SPECIES) {
      const total = GROUPS.map((g) => checklistItemsFor(g, species).length);
      for (const n of total) expect(n).toBeLessThanOrEqual(10);
      expect(total[0] + total[1]).toBeLessThanOrEqual(20);
    }
    for (const g of GROUPS) {
      for (const species of SPECIES) {
        expect(CHECKLIST_ITEMS.filter((i) => i.group === g && i.species === species).length).toBeLessThanOrEqual(2);
      }
    }
  });

  it('문구는 40자 이내, 숫자가 없다', () => {
    for (const item of CHECKLIST_ITEMS) {
      expect(item.text.length).toBeLessThanOrEqual(40);
      expect(item.text).not.toMatch(/\d/);
    }
  });

  it('질문 탭은 질문 문장(?)으로 끝난다', () => {
    for (const item of CHECKLIST_ITEMS.filter((i) => i.group === 'ask')) expect(item.text.endsWith('나요?')).toBe(true);
  });

  it('종별 분기: 개 목록에 고양이 항목이 없고 반대도 같다. 공통은 둘 다', () => {
    for (const g of GROUPS) {
      const dog = checklistItemsFor(g, 'dog');
      const cat = checklistItemsFor(g, 'cat');
      expect(dog.some((i) => i.species === 'cat')).toBe(false);
      expect(cat.some((i) => i.species === 'dog')).toBe(false);
      const common = CHECKLIST_ITEMS.filter((i) => i.group === g && !i.species);
      for (const c of common) {
        expect(dog).toContainEqual(c);
        expect(cat).toContainEqual(c);
      }
    }
    expect(checklistItemsFor('prep', 'dog').map((i) => i.id)).toContain('prep.dog_leash');
    expect(checklistItemsFor('prep', 'cat').map((i) => i.id)).toContain('prep.cat_litter');
  });

  it('종을 모르면 공통만, 종별 항목은 공통 뒤에 붙는다', () => {
    expect(checklistItemsFor('prep', null).every((i) => !i.species)).toBe(true);
    const dog = checklistItemsFor('prep', 'dog');
    expect(dog.slice(-2).every((i) => i.species === 'dog')).toBe(true);
  });
});
