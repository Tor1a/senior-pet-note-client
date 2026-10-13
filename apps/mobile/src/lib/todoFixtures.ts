// [공유 로직 사본] 원본: web/src/lib/todoFixtures.ts (2026-10-13 복사)
// web/src/lib 과 동기화 필요. 추후 packages/shared 로 통합 예정 (mobile/README.md 참고).
// 이 파일만 고치지 말고 웹 원본과 함께 수정하세요.
// 할 일 테스트용 계약 예시 JSON (기획서 5장 Todo 필드 1:1). 화면·로직 테스트가 함께 쓴다.
import type { Todo, TodoListResponse } from './todoApi';

export function todoExample(overrides: Partial<Todo> = {}): Todo {
  return {
    id: 'todo-1',
    petId: 'pet-1',
    title: '광견병 접종',
    dueDate: '2026-10-20',
    dueTime: '15:00',
    memo: '수첩 챙기기',
    hospitalNote: null,
    remind: true,
    completed: false,
    completedAt: null,
    dateStatus: 'future',
    createdAt: '2026-10-13T00:00:00Z',
    updatedAt: '2026-10-13T00:00:00Z',
    ...overrides,
  };
}

export function todoListExample(todos: Todo[], recordDate = '2026-10-13'): TodoListResponse {
  return { recordDate, todos };
}
