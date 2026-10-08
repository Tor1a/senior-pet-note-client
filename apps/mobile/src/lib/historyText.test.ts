// [공유 로직 테스트 사본] 원본: web/src/lib/historyText.test.ts (2026-10-08 복사)
// 웹 원본에서 첫 줄 `import ... from 'vitest'` 한 줄만 제거했고(describe/it/expect 는 jest 전역 사용) 나머지 본문은 동일하다.
// 웹 원본을 고치면 이 사본도 같이 고친다. 추후 packages/shared 로 통합 예정.
import { DISCLAIMER } from './constants';
import { daysFixture } from './historyFixtures';
import { levelCounts, medicationTotals, waterMlAverage } from './historyStats';
import {
  chartDescription,
  dayDetailValues,
  dayRowSummary,
  findForbidden,
  HISTORY_TEXT,
  levelCountsText,
  medicationText,
  rangeSummary,
  selectedWeightText,
  staleNotice,
  symptomNames,
  symptomNoneText,
  waterMlText,
  weightFactLines,
} from './historyText';

const END = '2026-10-08';

describe('findForbidden', () => {
  it('금지 표현을 찾는다', () => {
    for (const bad of ['이상 없음', '위험해요', '진단', '정상 범위', '체중이 늘었어요', '줄었어요', '10%', '증가', '감소', '좋아졌어요']) {
      expect({ bad, hit: findForbidden(bad) === null }).toEqual({ bad, hit: false });
    }
    expect(findForbidden('체중 4.1kg · 식사 보통')).toBeNull();
    expect(findForbidden(DISCLAIMER)).toBeNull();
  });
});

describe('문구 조립', () => {
  const days = daysFixture(
    END,
    14,
    {
      '2026-10-02': { weightKg: 4.4, foodLevel: 2, symptoms: ['vomit', 'other'], symptomOther: '절뚝', waterMl: 300 },
      '2026-10-05': { weightKg: 4.5, waterLevel: 1, symptomsNone: true },
      '2026-10-08': { weightKg: 4.1 },
    },
    { '2026-10-02': { scheduledCount: 2, takenCount: 1 } },
    { scheduledCount: 2, takenCount: 0 },
  );

  it('기간 요약', () => {
    expect(rangeSummary(days.slice(-7))).toBe('10월 2일 ~ 10월 8일 · 기록한 날 3일 / 7일');
    expect(rangeSummary([])).toBe('');
  });

  it('체중 사실 문장: 비교가 있을 때와 없을 때', () => {
    expect(weightFactLines(days)).toEqual([
      '이 기간 체중 기록 3번',
      '마지막 체중 4.1kg (10월 8일) · 직전 7일 평균 4.45kg보다 0.35kg 적어요',
    ]);
    expect(weightFactLines(daysFixture(END, 7))).toEqual(['이 기간 체중 기록 0번']);
    const same = daysFixture(END, 10, { '2026-10-05': { weightKg: 4 }, '2026-10-08': { weightKg: 4 } });
    expect(weightFactLines(same)[1]).toContain('4kg과 같아요');
    const more = daysFixture(END, 10, { '2026-10-05': { weightKg: 4 }, '2026-10-08': { weightKg: 4.3 } });
    expect(weightFactLines(more)[1]).toContain('0.3kg 많아요');
  });

  it('그래프 대체 문장', () => {
    expect(chartDescription(days)).toBe('지난 14일 체중 기록 3번. 첫 기록 4.4kg(10월 2일), 마지막 기록 4.1kg(10월 8일)');
    expect(chartDescription(daysFixture(END, 7))).toBe('지난 7일 체중 기록 0번.');
    expect(chartDescription(daysFixture(END, 7, { '2026-10-08': { weightKg: 4 } }))).toBe(
      '지난 7일 체중 기록 1번. 4kg(10월 8일)',
    );
  });

  it('식사·물·증상·투약 문장', () => {
    expect(levelCountsText(levelCounts(days, 'foodLevel'))).toBe('조금 0일 · 보통 1일 · 많이 0일 · 안 적은 날 13일');
    expect(waterMlText(waterMlAverage(days)!)).toBe('ml로 적은 날 평균 300ml (1일)');
    expect(symptomNames(['vomit', 'other'], '절뚝')).toBe('구토, 기타(절뚝)');
    expect(symptomNoneText(days)).toBe('특이사항 없음으로 적은 날 1일');
    expect(symptomNoneText(daysFixture(END, 3))).toBeNull();
    expect(medicationText(medicationTotals(days))).toBe('먹임 체크 1회 / 예정 28회');
  });

  it('날짜 줄 요약: 메모는 넣지 않고, 기록이 없으면 투약 체크만', () => {
    expect(dayRowSummary(days[days.length - 7])).toBe('체중 4.4kg · 식사 보통 · 물 300ml · ◆ 증상 2개 · 투약 1/2');
    expect(dayRowSummary(days[0])).toBe('기록 없음');
    const withTaken = daysFixture(END, 1, {}, { [END]: { scheduledCount: 2, takenCount: 1 } })[0];
    expect(dayRowSummary(withTaken)).toBe('기록 없음 · 투약 1/2');
    const noMed = daysFixture(END, 1, { [END]: { weightKg: 4 } })[0];
    expect(dayRowSummary(noMed)).toBe('체중 4kg');
    expect(dayRowSummary(daysFixture(END, 1, { [END]: { memo: '메모만' } })[0])).toBe('기록 없음');
  });

  it('하루 상세 값: 안 적은 항목은 "적지 않았어요"', () => {
    expect(dayDetailValues(null)).toBeNull();
    const day = daysFixture(END, 1, { [END]: { symptomsNone: true, foodLevel: 3 } })[0];
    expect(dayDetailValues(day.dailyLog)).toEqual({
      weight: '적지 않았어요',
      food: '많이',
      water: '적지 않았어요',
      symptom: '특이사항 없음',
    });
    const blank = daysFixture(END, 1, { [END]: {} })[0];
    expect(dayDetailValues(blank.dailyLog)?.symptom).toBe('증상 칸을 적지 않았어요');
  });

  it('선택·오프라인 문장', () => {
    expect(selectedWeightText('2026-10-07', 4.1)).toBe('10월 7일 (수) · 4.1kg');
    expect(staleNotice('오후 3:20')).toBe('마지막으로 불러온 시각: 오후 3:20 · 지금은 연결이 끊겨 있어요.');
  });
});

describe('금지어 검사 (의료적 판단·평가·증감 서술·퍼센트 금지)', () => {
  it('모든 문구 상수에 금지 표현이 없다', () => {
    for (const [key, value] of Object.entries(HISTORY_TEXT)) {
      expect({ key, hit: findForbidden(value) }).toEqual({ key, hit: null });
    }
  });

  it('조립 함수 출력 전체에 금지 표현이 없다', () => {
    const days = daysFixture(
      END,
      30,
      {
        '2026-10-01': { weightKg: 5, foodLevel: 1, waterLevel: 3, symptoms: ['seizure', 'lethargy', 'diarrhea', 'cough'] },
        '2026-10-04': { weightKg: 4.6, waterMl: 220, symptomsNone: true },
        '2026-10-08': { weightKg: 4.9, foodLevel: 3, memo: '이상한 메모는 대상 아님' },
      },
      {},
      { scheduledCount: 3, takenCount: 1 },
    );
    const outputs = [
      rangeSummary(days),
      ...weightFactLines(days),
      chartDescription(days),
      levelCountsText(levelCounts(days, 'foodLevel')),
      waterMlText(waterMlAverage(days)!),
      medicationText(medicationTotals(days)),
      symptomNoneText(days) ?? '',
      ...days.map(dayRowSummary),
      ...days.flatMap((d) => Object.values(dayDetailValues(d.dailyLog) ?? {})),
      symptomNames(['vomit', 'diarrhea', 'cough', 'lethargy', 'seizure', 'other'], '절뚝'),
      selectedWeightText(END, 4.9),
      staleNotice('오후 3:20'),
    ];
    for (const text of outputs) expect({ text, hit: findForbidden(text) }).toEqual({ text, hit: null });
  });
});
