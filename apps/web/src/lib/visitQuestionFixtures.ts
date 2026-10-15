// 진료 때 물어볼 것 테스트용 계약 예시 JSON (docs/api-visit-questions.md 3장 VisitQuestion 필드 1:1). 화면·로직 테스트가 함께 쓴다.
import type { VisitQuestion, VisitQuestionListResponse } from './visitQuestionApi';

export function visitQuestionExample(overrides: Partial<VisitQuestion> = {}): VisitQuestion {
  return {
    id: 'vq-1',
    petId: 'pet-1',
    text: '약을 식전에 줘도 되는지 물어보기',
    completed: false,
    completedAt: null,
    createdAt: '2026-10-15T03:02:11.781275Z',
    updatedAt: '2026-10-15T03:02:11.781275Z',
    ...overrides,
  };
}

export function visitQuestionListExample(questions: VisitQuestion[]): VisitQuestionListResponse {
  return { questions };
}
