// 웹 checklistState.test.ts 의 '체크 상태 순수 로직' 블록 사본 (vitest import·localStorage 블록 제외, 나머지 본문 동일). 저장소 테스트는 services/checklistStorage.test.ts.
import { CHECKLIST_STORAGE_KEY, isChecked, parseChecklist, serializeChecklist, toggleChecked } from './checklistState';

describe('체크 상태 순수 로직', () => {
  it('토글 왕복, 같은 id 중복 없음, 원본 불변', () => {
    const a = toggleChecked({}, 'p1', 'prep.toy');
    expect(a).toEqual({ p1: ['prep.toy'] });
    const b = toggleChecked(a, 'p1', 'ask.food');
    expect(b.p1).toEqual(['prep.toy', 'ask.food']);
    expect(a.p1).toEqual(['prep.toy']);
    expect(toggleChecked(b, 'p1', 'prep.toy').p1).toEqual(['ask.food']);
    expect(isChecked(b, 'p1', 'ask.food')).toBe(true);
    expect(isChecked(b, 'p2', 'ask.food')).toBe(false);
  });

  it('반려동물별 분리', () => {
    const d = toggleChecked(toggleChecked({}, 'p1', 'prep.toy'), 'p2', 'prep.bed');
    expect(d).toEqual({ p1: ['prep.toy'], p2: ['prep.bed'] });
  });

  it('직렬화는 {v:1,p} 형식이고 id 만 담는다', () => {
    const raw = serializeChecklist({ p1: ['prep.toy'], p2: [] });
    expect(JSON.parse(raw)).toEqual({ v: 1, p: { p1: ['prep.toy'] } });
    expect(raw).not.toMatch(/장난감/);
    expect(parseChecklist(raw)).toEqual({ p1: ['prep.toy'] });
  });

  it('손상·버전 불일치·배열 아님은 빈 상태, 알 수 없는 id 는 버림', () => {
    expect(parseChecklist(null)).toEqual({});
    expect(parseChecklist('{깨짐')).toEqual({});
    expect(parseChecklist('[]')).toEqual({});
    expect(parseChecklist('"x"')).toEqual({});
    expect(parseChecklist('{"v":2,"p":{"p1":["prep.toy"]}}')).toEqual({});
    expect(parseChecklist('{"v":1,"p":[]}')).toEqual({});
    expect(parseChecklist('{"v":1,"p":{"p1":"prep.toy","p2":["nope",3,"prep.toy","prep.toy"]}}')).toEqual({ p2: ['prep.toy'] });
  });

  it('저장 키는 spn.checklist 하나', () => {
    expect(CHECKLIST_STORAGE_KEY).toBe('spn.checklist');
  });
});
