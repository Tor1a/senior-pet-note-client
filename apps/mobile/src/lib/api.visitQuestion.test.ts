import { ApiError, toUserMessage } from './api';

// toUserMessage 의 visitQuestion 컨텍스트와 한도 코드 (웹 api.ts 사본과 같은 문구)
describe('toUserMessage — 진료 때 물어볼 것', () => {
  it('한도 코드는 컨텍스트와 관계없이 한도 문구', () => {
    const err = new ApiError('http', 409, 'VISIT_QUESTION_LIMIT_REACHED', 'x');
    expect(toUserMessage(err, 'visitQuestion')).toBe('물어볼 것은 30개까지 적어 둘 수 있어요. 지난 것을 지운 뒤 다시 시도해 주세요.');
  });

  it('검증 오류(400)는 1~100자 안내', () => {
    const err = new ApiError('http', 400, 'VALIDATION_ERROR', 'x');
    expect(toUserMessage(err, 'visitQuestion')).toBe('입력한 내용을 확인해 주세요. 물어볼 것은 1~100자까지 적을 수 있어요.');
  });
});
