import { describe, expect, it } from 'vitest';
import { DISCLAIMER } from './constants';
import { findForbidden } from './historyText';
import {
  findPetProfileForbidden,
  PET_PROFILE_TEXT,
  PET_TYPE_CHOICES,
  petDateSummary,
  petProfileTexts,
} from './petProfileText';

describe('유형·생일·입양일 문구', () => {
  it('문구 상수 전체와 조립 출력이 금지어 검사를 통과한다', () => {
    const texts = petProfileTexts();
    expect(texts.length).toBeGreaterThan(Object.keys(PET_PROFILE_TEXT).length);
    for (const text of texts) expect({ text, hit: findPetProfileForbidden(text) }).toEqual({ text, hit: null });
  });

  it('대표님 결정 문구: 그룹 제목, 나이 든 아이예요 라벨, 선택 순서', () => {
    expect(PET_PROFILE_TEXT.typeTitle).toBe('함께 지내는 상황 (선택)');
    expect(PET_TYPE_CHOICES.map((c) => [c.value, c.label])).toEqual([
      ['first_time', '처음 키워요'],
      ['senior', '나이 든 아이예요'],
      [null, '나중에 정할게요'],
    ]);
  });

  it('질문형·권유형 없음(물음표 0)', () => {
    for (const text of petProfileTexts()) expect(text).not.toMatch(/\?|？/);
  });

  it('금지어 검사: 기본 금지어와 기획서 추가어를 모두 잡는다', () => {
    const base = ['이상', '위험', '진단', '정상', '경고', '주의', '악화', '호전', '좋아', '나빠', '늘었', '줄었', '증가', '감소', '준수', '순응', '퍼센트', '%'];
    const extra = ['노령', '노화', '초보', '권장', '적정', '해야', '하세요', '평균', '또래'];
    for (const w of [...base, ...extra]) expect({ w, hit: findPetProfileForbidden(`앞 ${w} 뒤`) !== null }).toEqual({ w, hit: true });
    // 대표님이 정한 라벨 "나이 든"은 허용
    expect(findPetProfileForbidden('나이 든 아이예요')).toBeNull();
    expect(findForbidden('노령')).toBeNull(); // 추가어는 기본 검사에는 없다
  });

  it('요약 조립: 있는 것만 · 로 잇는다', () => {
    expect(petDateSummary({ month: 10, day: 13 }, { year: 2024, month: 3, day: 2 })).toBe('생일 10월 13일 · 입양 2024년 3월 2일');
    expect(petDateSummary({ month: 10, day: 13 }, null)).toBe('생일 10월 13일');
    expect(petDateSummary(null, { year: 2024, month: 3, day: 2 })).toBe('입양 2024년 3월 2일');
    expect(petDateSummary(null, null)).toBeNull();
  });

  it('면책 문구는 그대로 있다', () => {
    expect(DISCLAIMER.length).toBeGreaterThan(0);
  });
});
