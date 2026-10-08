import { describe, expect, it } from 'vitest';
import { DISCLAIMER } from './constants';
import { daysFixture } from './historyFixtures';
import { findForbidden } from './historyText';
import type { Medication } from './petApi';
import { reportDays } from './reportStats';
import {
  buildReport,
  documentTitle,
  findReportForbidden,
  periodText,
  rangeChangedNotice,
  REPORT_FORBIDDEN,
  REPORT_TEXT,
  restText,
  shareContents,
  toPlainText,
  type MedicationsState,
  type ReportInput,
} from './reportText';

const END = '2026-10-08';
const PET = { name: '초코', species: 'dog' as const, birthYear: 2014, conditions: '신장 관리 중' };

const med = (over: Partial<Medication> = {}): Medication => ({
  id: 'm1',
  petId: 'pet-1',
  name: '아조딜',
  doseText: '1캡슐',
  times: ['08:00', '20:00'],
  active: true,
  ...over,
});

const READY: MedicationsState = { status: 'ready', items: [med(), med({ id: 'm2', name: '오메가', doseText: null, times: ['08:00'] })] };

function input(over: Partial<ReportInput> = {}, count = 14, logs = {}, defaultMedication = { scheduledCount: 3, takenCount: 2 }): ReportInput {
  return {
    pet: PET,
    recordDate: END,
    days: daysFixture(END, count, logs, {}, defaultMedication),
    medications: READY,
    includeMemo: true,
    ...over,
  };
}

const RICH = {
  '2026-09-26': { weightKg: 4.4, foodLevel: 2, waterMl: 300 },
  '2026-10-03': { weightKg: 4.0, symptoms: ['vomit', 'other'], symptomOther: '절뚝', memo: '사료를 잘게 불려 줬어요.', waterLevel: 1 },
  '2026-10-04': { symptomsNone: true, foodLevel: 3 },
  '2026-10-08': { weightKg: 4.1, foodLevel: 2 },
} as never;

/** 앱이 만든 문구만 모아 검사하기 위해 사용자 입력(이름·질환·약·메모·기타)이 없는 입력을 쓴다 */
function appOnlyText(over: Partial<ReportInput> = {}, count = 14, logs = RICH): string {
  const i = input(
    {
      pet: { name: '코코', species: 'cat', birthYear: null, conditions: null },
      medications: { status: 'ready', items: [] },
      ...over,
    },
    count,
    logs,
  );
  const model = buildReport(i);
  const days = i.days;
  return [JSON.stringify(model), toPlainText(model, days)].join('\n');
}

describe('REPORT_TEXT 금지어 검사', () => {
  it('모든 문구 상수가 통과한다', () => {
    for (const [key, value] of Object.entries(REPORT_TEXT)) {
      expect({ key, hit: findReportForbidden(value) }).toEqual({ key, hit: null });
    }
  });

  it('추가 금지어를 잡는다', () => {
    for (const word of ['상의해 보세요', '권유', '병원에 가 보세요', '진료받으세요', '필요해요', '의심돼요', '심각해요', '이상 없어요']) {
      expect(findReportForbidden(word)).not.toBeNull();
    }
    expect(REPORT_FORBIDDEN.length).toBeGreaterThanOrEqual(8);
  });

  it('기존 findForbidden 목록도 함께 검사한다', () => {
    for (const word of ['이상', '위험', '진단', '정상', '경고', '주의', '악화', '호전', '좋아', '나빠', '늘었', '줄었', '증가', '감소', '준수', '순응', '퍼센트', '50%']) {
      expect(findForbidden(word)).not.toBeNull();
      expect(findReportForbidden(word)).not.toBeNull();
    }
  });

  it('여러 입력 조합의 조립 결과(모델·공유 텍스트)에 금지어가 없다', () => {
    const cases: [Partial<ReportInput>, number, object][] = [
      [{}, 14, RICH],
      [{}, 7, RICH],
      [{}, 30, RICH],
      [{ includeMemo: false }, 14, RICH],
      [{}, 14, {}],
      [{}, 1, { '2026-10-08': { weightKg: 4 } }],
      [{ medications: { status: 'error' } }, 14, RICH],
      [{ medications: { status: 'loading' } }, 14, RICH],
      [{ medications: { status: 'ready', items: [] } }, 14, RICH],
    ];
    for (const [over, count, logs] of cases) {
      expect(findReportForbidden(appOnlyText(over, count, logs as never))).toBeNull();
    }
  });

  it('사용자 입력은 금지어가 있어도 검사하지 않고 그대로 통과한다', () => {
    const logs = { '2026-10-08': { weightKg: 4, memo: '이상해 보여서 병원에 가 봤어요 50%', symptoms: ['other'], symptomOther: '위험한 기침' } } as never;
    const i = input({ pet: { ...PET, name: '주의', conditions: '정상 범위 아님' }, medications: { status: 'ready', items: [med({ name: '진단약' })] } }, 14, logs);
    const model = buildReport(i);
    const text = toPlainText(model, i.days);
    expect(text).toContain('이상해 보여서 병원에 가 봤어요 50%');
    expect(text).toContain('기타(위험한 기침)');
    expect(text).toContain('주의');
    expect(text).toContain('정상 범위 아님');
    expect(text).toContain('진단약');
    // 앱 문구 쪽은 따로 검사된다: 사용자 입력을 뺀 앱 문장
    expect(findReportForbidden(model.glance.join(' '))).toBeNull();
    expect(findReportForbidden(model.weight.lines.join(' '))).toBeNull();
  });
});

describe('buildReport 경계', () => {
  it('기록 0일: 한눈에 보기와 체중 없음 문구, 숫자는 0', () => {
    const m = buildReport(input({}, 14, {}));
    expect(m.recorded).toBe(0);
    expect(m.glance).toEqual(['14일 중 0일 기록했어요.', '기록 없는 날은 14일이에요.']);
    expect(m.weight.lines).toEqual([REPORT_TEXT.weightNone]);
    expect(m.symptoms.empty).toBe(REPORT_TEXT.symptomNone);
    expect(m.emptyDays?.title).toBe('기록 없는 날 14일');
  });

  it('기록 1일: 적힌 기록만 담았어요, 체중 하루 문장', () => {
    const m = buildReport(input({}, 14, { '2026-10-08': { weightKg: 4.1 } } as never));
    expect(m.recorded).toBe(1);
    expect(m.glance).toContain(REPORT_TEXT.fewRecords);
    expect(m.weight.lines).toEqual(['체중은 하루 적었어요. 10월 8일 4.1kg이에요.']);
  });

  it('체중이 모두 같은 값이어도 문장이 만들어진다', () => {
    const m = buildReport(input({}, 14, { '2026-10-02': { weightKg: 5 }, '2026-10-06': { weightKg: 5 } } as never));
    expect(m.weight.lines[0]).toBe('체중을 적은 날 2일');
    expect(m.weight.lines[1]).toBe('첫 기록 5kg (10월 2일) · 마지막 기록 5kg (10월 6일)');
    expect(m.weight.lines[2]).toBe('가장 낮은 기록 5kg (10월 2일) · 가장 높은 기록 5kg (10월 2일)');
  });

  it('값 두 개를 나란히 적고 증감을 서술하지 않는다 (첫·마지막·최소·최대)', () => {
    const m = buildReport(input({}, 14, RICH));
    expect(m.weight.lines).toEqual([
      '체중을 적은 날 3일',
      '첫 기록 4.4kg (9월 26일) · 마지막 기록 4.1kg (10월 8일)',
      '가장 낮은 기록 4kg (10월 3일) · 가장 높은 기록 4.4kg (9월 26일)',
    ]);
  });

  it('14일 보기에는 14일 밖의 체중이 들어가지 않는다', () => {
    // END 기준 14일은 9월 25일부터. 9월 26일은 포함
    const all = daysFixture(END, 30, { '2026-09-20': { weightKg: 9 }, '2026-10-08': { weightKg: 4 } });
    const cut = reportDays(all, 14);
    expect(cut[0].recordDate).toBe('2026-09-25');
    const m = buildReport({ ...input(), days: cut });
    expect(m.total).toBe(14);
    expect(m.periodLine).toBe('9월 25일 ~ 10월 8일 (14일)');
    expect(m.weight.lines[0]).toContain('하루');
  });

  it('기준일은 서버가 준 recordDate 이고 나이는 계산하지 않는다', () => {
    const m = buildReport(input());
    expect(m.baseDateLine).toBe('기록 기준일: 10월 8일');
    expect(m.petLine).toBe('초코 · 강아지 · 2014년생');
    expect(buildReport(input({ pet: { ...PET, birthYear: null } })).petLine).toBe('초코 · 강아지');
    expect(buildReport(input({ pet: { ...PET, conditions: ' ' } })).conditionsLine).toBeNull();
  });

  it('증상 12건 초과: 12건만 보이고 나머지 n건 문구', () => {
    const logs: Record<string, object> = {};
    for (let i = 1; i <= 15; i += 1) logs[`2026-09-${String(10 + i).padStart(2, '0')}`] = { symptoms: ['cough'] };
    const i = input({}, 30, logs);
    const m = buildReport(i);
    expect(m.symptoms.countLine).toBe('15일');
    expect(m.symptoms.items).toHaveLength(12);
    expect(m.symptoms.rest).toBe('나머지 3건은 앱에서 볼 수 있어요.');
    expect(toPlainText(m, i.days)).toContain('나머지 3건은 이 쪽에 담지 않았어요.');
    expect(buildReport({ ...i, restWording: 'paper' }).symptoms.rest).toBe('나머지 3건은 이 쪽에 담지 않았어요.');
    // 최신이 위
    expect(m.symptoms.items[0].dateLabel).toBe('9월 25일 (금)');
  });

  it('증상 12건 이하는 나머지 문구가 없다', () => {
    const logs: Record<string, object> = {};
    for (let i = 1; i <= 12; i += 1) logs[`2026-09-${String(10 + i).padStart(2, '0')}`] = { symptoms: ['cough'] };
    expect(buildReport(input({}, 30, logs)).symptoms.rest).toBeNull();
  });

  it('메모 12건 초과: 12건만, 나머지 n건 문구', () => {
    const logs: Record<string, object> = {};
    for (let i = 1; i <= 14; i += 1) logs[`2026-09-${String(10 + i).padStart(2, '0')}`] = { memo: `메모 ${i}` };
    const i = input({}, 30, logs);
    const m = buildReport(i);
    expect(m.memos.items).toHaveLength(12);
    expect(m.memos.rest).toBe(restText(2));
    expect(toPlainText(m, i.days)).toContain('나머지 2건은 이 쪽에 담지 않았어요.');
    expect(shareContents(m, 2)).toContain('메모 14건');
  });

  it('메모 끄기: 본문·텍스트 모두에서 메모가 사라지고 안내 한 줄만 남는다', () => {
    const i = input({ includeMemo: false }, 14, RICH);
    const m = buildReport(i);
    expect(m.memos).toEqual({ included: false, items: [], rest: null, message: REPORT_TEXT.memoExcluded });
    const text = toPlainText(m, i.days);
    expect(text).not.toContain('사료를 잘게');
    expect(text).not.toContain('■ 메모');
    expect(text).toContain(REPORT_TEXT.memoExcluded);
  });

  it('메모는 적은 그대로(줄바꿈 포함) 들어간다', () => {
    const i = input({}, 14, { '2026-10-08': { memo: '첫 줄\n둘째 줄' } } as never);
    const text = toPlainText(buildReport(i), i.days);
    expect(text).toContain('10월 8일 (목) 첫 줄\n  > 둘째 줄');
  });

  it('메모가 앱 구역·면책처럼 시작해도 들여쓴 줄이라 앱이 만든 구역과 구분된다', () => {
    const i = input({}, 14, { '2026-10-08': { memo: '시작\n■ 투약 체크\n※ 면책 아님' } } as never);
    const lines = toPlainText(buildReport(i), i.days).split('\n');
    expect(lines.filter((l) => l.startsWith('■ 투약 체크'))).toHaveLength(1);
    expect(lines.filter((l) => l.startsWith('※ '))).toHaveLength(1);
    expect(lines).toContain('  > ■ 투약 체크');
    expect(lines).toContain('  > ※ 면책 아님');
  });

  it('약 이름·질환·증상 기타의 줄바꿈도 들여쓴다', () => {
    const i = input(
      { pet: { ...PET, conditions: '신장\n■ 체중' }, medications: { status: 'ready', items: [med({ name: '약\n※ x' })] } },
      14,
      { '2026-10-08': { symptoms: ['other'], symptomOther: '절뚝\n■ 가짜' } } as never,
    );
    const text = toPlainText(buildReport(i), i.days);
    expect(text).toContain('  > ■ 체중');
    expect(text).toContain('  > ※ x');
    expect(text).toContain('  > ■ 가짜');
  });

  it('이름에 " · " 가 있어도 종·출생연도가 깨지지 않는다', () => {
    const i = input({ pet: { ...PET, name: '초코 · 2호' } });
    const m = buildReport(i);
    expect(m.speciesLabel).toBe('강아지');
    expect(m.birthLabel).toBe('2014년생');
    expect(toPlainText(m, i.days).split('\n')[0]).toBe('[병원 방문 요약] 초코 · 2호 (강아지, 2014년생)');
  });

  it('문서 제목은 긴 이름을 줄이고, 질환 문구는 출처를 밝히며 금지어 검사를 통과한다', () => {
    expect(documentTitle('가'.repeat(60), '2026-10-08').length).toBeLessThan(50);
    expect(documentTitle('초코', '2026-10-08')).toBe('초코 진료용 기록 요약 10월 8일');
    const m = buildReport(input());
    expect(m.conditionsLine).toBe('보호자가 적은 질환: 신장 관리 중');
    expect(findReportForbidden(m.conditionsLine ?? '')).toBeNull();
  });
});

describe('투약 고지와 약 목록', () => {
  it('약 일정이 있으면 횟수와 고지 3문장이 항상 같이 나온다', () => {
    const m = buildReport(input());
    expect(m.medication.lines).toEqual([
      '먹임 체크 28회 / 예정 42회',
      REPORT_TEXT.medicationBasis,
      REPORT_TEXT.medicationReason,
      REPORT_TEXT.medicationCaution,
    ]);
  });

  it('약이 없으면 투약 줄을 숨기고 안내 한 줄, 고지는 계속 남는다', () => {
    const m = buildReport(input({ medications: { status: 'ready', items: [] } }, 14, RICH, { scheduledCount: 0, takenCount: 0 }));
    expect(m.medication.lines).toEqual([
      REPORT_TEXT.medicationBasis,
      REPORT_TEXT.medicationReason,
      REPORT_TEXT.medicationCaution,
    ]);
    expect(m.medication.empty).toBe(REPORT_TEXT.noMedication);
  });

  it('약 목록: 이름·용량·시각, 비활성 약은 뺀다', () => {
    const m = buildReport(input({ medications: { status: 'ready', items: [med(), med({ id: 'x', name: '뺀약', active: false })] } }));
    expect(m.medicationList.items).toEqual([{ name: '아조딜 · 1캡슐', times: '매일 오전 8:00, 오후 8:00' }]);
  });

  it('약 목록 오류는 없는 것처럼 비우지 않고 문구를 남긴다 (공유 텍스트 포함)', () => {
    const i = input({ medications: { status: 'error' } });
    const m = buildReport(i);
    expect(m.medicationList.message).toBe(REPORT_TEXT.medicationListFailed);
    // 받는 사람에게는 실패 문장 대신 사실 문구를 보낸다
    expect(toPlainText(m, i.days)).toContain(REPORT_TEXT.medicationListOmitted);
    expect(toPlainText(m, i.days)).not.toContain(REPORT_TEXT.medicationListFailed);
    expect(buildReport({ ...i, restWording: 'paper' }).medicationList.message).toBe(REPORT_TEXT.medicationListOmitted);
  });
});

describe('공유 텍스트', () => {
  const i = input({}, 14, RICH);
  const text = toPlainText(buildReport(i), i.days);

  it('출처·기준일·면책·약 기준 고지가 들어 있다', () => {
    expect(text.startsWith('[병원 방문 요약] 초코 (강아지, 2014년생)')).toBe(true);
    expect(text).toContain('기록 기준일: 10월 8일');
    expect(text).toContain(REPORT_TEXT.source);
    expect(text).toContain(DISCLAIMER);
    expect(text).toContain('현재 등록된 약 기준이에요');
    expect(text).toContain('아조딜 · 1캡슐 (매일 오전 8:00, 오후 8:00)');
    expect(text).toContain('9/26 4.4 · 10/3 4 · 10/8 4.1');
  });

  it('이모지를 쓰지 않는다', () => {
    expect(/\p{Extended_Pictographic}/u.test(text.replace(/[◆●━╌■※]/g, ''))).toBe(false);
  });

  it('보조 함수', () => {
    expect(periodText(i.days)).toBe('9월 25일 ~ 10월 8일 (14일)');
    expect(periodText([])).toBe('');
    expect(rangeChangedNotice(14, i.days)).toBe('14일 보기로 바꿨어요. 14일 중 4일 기록했어요.');
    expect(documentTitle('초코', END)).toBe('초코 진료용 기록 요약 10월 8일');
  });
});
