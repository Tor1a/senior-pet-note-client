// 진료 때 물어볼 것 메모 API (계약: 백엔드 senior-pet-note-api/docs/api-visit-questions.md, 기획서 .company/plans/진료-질문-메모.md 4장)
// - 서버는 글을 해석·추천·분류하지 않는다. 클라이언트도 받은 글을 가공하지 않고 보여 준다.
// - 서버 목록은 디스크/localStorage 에 저장하지 않는다(화면 메모리에서만 쓴다).
// - 계약을 바꾸려면 비서실장에게 먼저 알린다. 여기서 임의로 필드를 바꾸지 않는다.
// - 순수 TS(모바일 사본 대상).
import type { ApiClient } from './api';

/** GET 목록 필터. 생략하면 서버는 open */
export type VisitQuestionStatus = 'open' | 'done' | 'all';

/** POST /api/pets/{petId}/visit-questions, PUT /api/visit-questions/{id} 본문 (PUT 은 전체 교체, 완료 상태는 유지) */
export interface VisitQuestionInput {
  /** 앞뒤 공백 제거 후 1~100자(코드 포인트) */
  text: string;
}

export interface VisitQuestion {
  id: string;
  petId: string;
  text: string;
  completed: boolean;
  /** ISO-8601 UTC. 미완료면 null */
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** GET 목록 응답 */
export interface VisitQuestionListResponse {
  questions: VisitQuestion[];
}

/** 한도 오류 코드(409). 문구가 아니라 code 로 분기한다 */
export const VISIT_QUESTION_LIMIT_CODE = 'VISIT_QUESTION_LIMIT_REACHED';

const enc = encodeURIComponent;

export function createVisitQuestionApi(client: ApiClient) {
  return {
    /** all = 미완료(등록 순) 먼저 + 완료(최근 완료 순) 뒤. 최대 30개라 페이징 없음 */
    listVisitQuestions: (petId: string, status: VisitQuestionStatus = 'all') =>
      client.request<VisitQuestionListResponse>(`/api/pets/${enc(petId)}/visit-questions?status=${status}`),
    createVisitQuestion: (petId: string, input: VisitQuestionInput) =>
      client.request<VisitQuestion>(`/api/pets/${enc(petId)}/visit-questions`, { method: 'POST', body: input }),
    updateVisitQuestion: (id: string, input: VisitQuestionInput) =>
      client.request<VisitQuestion>(`/api/visit-questions/${enc(id)}`, { method: 'PUT', body: input }),
    /** 멱등. 이미 완료인데 true 를 다시 보내도 최초 completedAt 이 유지된다 */
    setVisitQuestionCompleted: (id: string, completed: boolean) =>
      client.request<VisitQuestion>(`/api/visit-questions/${enc(id)}/completion`, {
        method: 'PUT',
        body: { completed },
      }),
    /** 실제 삭제(204). 남의 것·없는 것은 404 */
    deleteVisitQuestion: (id: string) => client.request<null>(`/api/visit-questions/${enc(id)}`, { method: 'DELETE' }),
  };
}

export type VisitQuestionApi = ReturnType<typeof createVisitQuestionApi>;
