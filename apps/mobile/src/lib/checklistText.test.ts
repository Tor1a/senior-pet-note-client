// [공유 로직 테스트 사본] 원본: web/src/lib/checklistText.test.ts (2026-10-14 복사)
// 웹 원본에서 첫 줄 `import ... from 'vitest'` 한 줄을 제거하고 expect(값, 메시지) 의 메시지 인자 2곳을 뺐다(jest 타입에 없음). 나머지 본문은 동일하다.
// 웹 원본을 고치면 이 사본도 같이 고친다. 추후 packages/shared 로 통합 예정.
import { CHECKLIST_ITEMS } from './checklistContent';
import { CHECKLIST_TEXT, checklistTexts, findChecklistForbidden } from './checklistText';
import { DISCLAIMER } from './constants';

describe('findChecklistForbidden', () => {
  it('화면 문구와 항목 전체가 통과한다', () => {
    const texts = [...checklistTexts(), DISCLAIMER];
    expect(texts.length).toBeGreaterThan(CHECKLIST_ITEMS.length);
    for (const t of texts) expect(findChecklistForbidden(t)).toBeNull();
  });

  it('위반 샘플이 걸린다', () => {
    for (const bad of ['2주마다', '하루 두 번', '반드시 준비', '응급 상황', '필수 준비물', '초보 견주', '정상이에요', '한 번 갑니다', '세 마리']) {
      expect(findChecklistForbidden(bad)).not.toBeNull();
    }
  });

  it('실제 문구는 걸리지 않는다', () => {
    expect(findChecklistForbidden('목줄·하네스')).toBeNull();
    expect(findChecklistForbidden('지금 먹이는 사료와 간식은 어떻게 하면 되나요?')).toBeNull();
  });

  it('진행률·완료 의미의 문구가 없다', () => {
    for (const t of checklistTexts()) expect(t).not.toMatch(/\d+\s*\/\s*\d+|완료|달성|진행/);
  });

  it('고정 문구는 기획서 그대로', () => {
    expect(CHECKLIST_TEXT.title).toBe('처음 키워요 체크리스트');
    expect(CHECKLIST_TEXT.saveNote).toBe('체크는 이 기기에만 저장돼요.');
  });
});
