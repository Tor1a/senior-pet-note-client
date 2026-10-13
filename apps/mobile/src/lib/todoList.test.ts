// [공유 로직 테스트 사본] 원본: web/src/lib/todoList.test.ts (2026-10-13 복사)
// 웹 원본에서 첫 줄 `import ... from 'vitest'` 한 줄만 제거했고(describe/it/expect 는 jest 전역 사용) 나머지 본문은 동일하다.
// 웹 원본을 고치면 이 사본도 같이 고친다. 추후 packages/shared 로 통합 예정.
import { todoExample } from './todoFixtures';
import { groupByDateStatus, removeTodo, replaceTodo } from './todoList';

describe('todoList', () => {
  const past = todoExample({ id: 'a', dateStatus: 'past' });
  const today = todoExample({ id: 'b', dateStatus: 'today' });
  const tomorrow = todoExample({ id: 'c', dateStatus: 'tomorrow' });
  const future1 = todoExample({ id: 'd', dateStatus: 'future' });
  const future2 = todoExample({ id: 'e', dateStatus: 'future' });

  it('dateStatus 순서(지난→오늘→내일→그 이후)로 묶고 빈 묶음은 뺀다. 묶음 안 순서는 입력 그대로', () => {
    const groups = groupByDateStatus([future1, past, future2, tomorrow]);
    expect(groups.map((g) => g.status)).toEqual(['past', 'tomorrow', 'future']);
    expect(groups[2].todos.map((t) => t.id)).toEqual(['d', 'e']);
    expect(groupByDateStatus([])).toEqual([]);
    expect(groupByDateStatus([today]).map((g) => g.status)).toEqual(['today']);
  });
  it('날짜를 직접 비교하지 않는다: dueDate 가 달라도 서버의 dateStatus 만 따른다', () => {
    const odd = todoExample({ id: 'x', dueDate: '1999-01-01', dateStatus: 'future' });
    expect(groupByDateStatus([odd])[0].status).toBe('future');
  });
  it('replaceTodo / removeTodo', () => {
    const done = { ...past, completed: true };
    expect(replaceTodo([past, today], done)[0].completed).toBe(true);
    expect(replaceTodo([past], todoExample({ id: 'zzz' }))).toEqual([past]);
    expect(removeTodo([past, today], 'a').map((t) => t.id)).toEqual(['b']);
  });
});
