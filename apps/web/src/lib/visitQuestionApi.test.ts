import { describe, expect, it, vi } from 'vitest';
import { ApiError, createApiClient, toUserMessage } from './api';
import { createVisitQuestionApi, VISIT_QUESTION_LIMIT_CODE } from './visitQuestionApi';
import { visitQuestionExample, visitQuestionListExample } from './visitQuestionFixtures';
import { VISIT_QUESTION_TEXT } from './visitQuestionText';

function setup(respond: (url: string, init: RequestInit) => Response) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init: init ?? {} });
    return respond(String(input), init ?? {});
  }) as unknown as typeof fetch;
  const api = createVisitQuestionApi(createApiClient({ baseUrl: 'https://api.test', getToken: () => 'tok', fetchImpl }));
  return { api, calls };
}
const json = (status: number, body: unknown) =>
  new Response(body === null ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('visitQuestionApi — docs/api-visit-questions.md 계약', () => {
  it('목록: 기본 status=all, open 은 리포트용. Bearer 토큰을 붙인다', async () => {
    const { api, calls } = setup(() => json(200, visitQuestionListExample([visitQuestionExample()])));
    const res = await api.listVisitQuestions('pet-1');
    expect(res.questions[0].text).toBe('약을 식전에 줘도 되는지 물어보기');
    await api.listVisitQuestions('pet-1', 'open');
    expect(calls.map((c) => c.url)).toEqual([
      'https://api.test/api/pets/pet-1/visit-questions?status=all',
      'https://api.test/api/pets/pet-1/visit-questions?status=open',
    ]);
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe('Bearer tok');
  });

  it('등록·수정은 {text} 만 보낸다(PUT 은 전체 교체)', async () => {
    const { api, calls } = setup(() => json(200, visitQuestionExample()));
    await api.createVisitQuestion('pet-1', { text: '글' });
    await api.updateVisitQuestion('vq-1', { text: '고친 글' });
    expect(calls[0].url).toBe('https://api.test/api/pets/pet-1/visit-questions');
    expect(calls[0].init.method).toBe('POST');
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ text: '글' });
    expect(calls[1].url).toBe('https://api.test/api/visit-questions/vq-1');
    expect(calls[1].init.method).toBe('PUT');
    expect(JSON.parse(String(calls[1].init.body))).toEqual({ text: '고친 글' });
  });

  it('완료/되돌리기는 completion 으로 {completed} 를 보낸다', async () => {
    const { api, calls } = setup(() => json(200, visitQuestionExample({ completed: true })));
    await api.setVisitQuestionCompleted('vq-1', true);
    await api.setVisitQuestionCompleted('vq-1', false);
    expect(calls.map((c) => [c.init.method, c.url])).toEqual([
      ['PUT', 'https://api.test/api/visit-questions/vq-1/completion'],
      ['PUT', 'https://api.test/api/visit-questions/vq-1/completion'],
    ]);
    expect(calls.map((c) => JSON.parse(String(c.init.body)))).toEqual([{ completed: true }, { completed: false }]);
  });

  it('삭제는 204 를 받는다. id 는 URL 인코딩한다', async () => {
    const { api, calls } = setup(() => new Response(null, { status: 204 }));
    expect(await api.deleteVisitQuestion('a/b')).toBeNull();
    expect(calls[0].init.method).toBe('DELETE');
    expect(calls[0].url).toBe('https://api.test/api/visit-questions/a%2Fb');
  });

  it('409 VISIT_QUESTION_LIMIT_REACHED 는 code 로 구분하고, 오류 문구는 서버 message 가 아니라 앱 문구', async () => {
    const { api } = setup(() => json(409, { code: VISIT_QUESTION_LIMIT_CODE, message: '서버가 바꾼 문장' }));
    const err = await api.createVisitQuestion('pet-1', { text: '글' }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).code).toBe('VISIT_QUESTION_LIMIT_REACHED');
    expect(toUserMessage(err, 'visitQuestion')).toBe(VISIT_QUESTION_TEXT.limitReached);
  });

  it('400 은 입력 확인 문구(1~100자), 네트워크 오류는 공통 문구', () => {
    expect(toUserMessage(new ApiError('http', 400, 'VALIDATION_ERROR', 'x'), 'visitQuestion')).toContain('1~100자');
    expect(toUserMessage(new ApiError('network', 0, null, 'x'), 'visitQuestion')).toContain('서버에 연결할 수 없어요');
  });
});
