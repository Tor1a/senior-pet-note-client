import { describe, expect, it } from 'vitest';
import type { SymptomCode } from './symptoms';
import { ApiError } from './api';
import type { DailyLog, TodayResponse } from './petApi';
import { sanitizeWeightInput } from './todayForm';
import { daysAgoText } from './todayDoses';
import { checkWeightDigits, classifyUndoError, planDailyUndo, restoreBody, WEIGHT_CHECK_RATIO, type DailyUndo } from './undoLogic';
import { doseUndoButtonLabel, doseUndoFailText, doseUndoneText, findUndoForbidden, UNDO_TEXT, weightCardSpeech, weightEnteredText, weightLastText } from './undoText';

// QA 보강: 복원 본문 null/빈 값, updatedAt 비교, 오류 분류, 체중 5배 경계(부동소수점), 문구 금지어(동적 문구 포함)

const sym = (...c: string[]) => c as SymptomCode[];
const base: DailyLog = {
  id: 'l', petId: 'p', recordDate: '2026-10-12', foodLevel: null, waterLevel: null, waterMl: null, weightKg: null,
  symptoms: [], symptomsNone: false, symptomOther: null, memo: null as unknown as string, updatedAt: '2026-10-12T01:00:00.123Z',
};
const today = (dailyLog: DailyLog | null, recordDate = '2026-10-12'): TodayResponse => ({
  recordDate, cutoffNotice: '', doses: [], dailyLog,
  suggestions: { foodLevel: null, waterLevel: null, waterMl: null, weightKg: null }, lastWeight: null,
});

describe('restoreBody: 증상·메모·체중 null/빈 값 조합', () => {
  const combos: Array<[string, Partial<DailyLog>]> = [
    ['증상 없음·메모 없음·체중 없음', { symptoms: [], symptomsNone: false, symptomOther: null, memo: '', weightKg: null }],
    ['증상 있음·메모 있음·체중 있음', { symptoms: sym('cough', 'vomit'), symptomOther: '절뚝', memo: '메모', weightKg: 4.35 }],
    ['증상만 있음', { symptoms: sym('cough'), memo: '', weightKg: null }],
    ['메모·체중만 있음, symptomsNone', { symptomsNone: true, memo: '산책', weightKg: 0.5 }],
  ];
  for (const [name, over] of combos) {
    it(name, () => {
      const log = { ...base, ...over };
      const body = restoreBody(log);
      expect(body).toEqual({
        foodLevel: log.foodLevel, waterLevel: log.waterLevel, waterMl: log.waterMl, weightKg: log.weightKg,
        symptoms: log.symptoms, symptomsNone: log.symptomsNone, symptomOther: log.symptomOther, memo: log.memo,
      });
      expect(Object.keys(body)).toHaveLength(8);
      // null 이 undefined/빈 문자열로 바뀌지 않는다(JSON 으로 보내면 서버가 null 로 받는다)
      expect(JSON.parse(JSON.stringify(body))).toEqual(JSON.parse(JSON.stringify(log.memo === null ? { ...body, memo: null } : body)));
    });
  }

  it('원본 증상 배열을 바꿔도 이미 만든 본문은 변하지 않는다', () => {
    const log = { ...base, symptoms: sym('cough') };
    const body = restoreBody(log);
    log.symptoms.push('vomit' as SymptomCode);
    expect(body.symptoms).toEqual(['cough']);
  });
});

describe('planDailyUndo: updatedAt 비교', () => {
  const saved = { ...base, foodLevel: 3 };
  const undo: DailyUndo = { before: null, saved };

  it('같음 → delete / 다름 → conflict / 서버 기록 없음 → conflict', () => {
    expect(planDailyUndo(undo, today(saved)).kind).toBe('delete');
    expect(planDailyUndo(undo, today({ ...saved, updatedAt: '2026-10-12T01:00:00.124Z' })).kind).toBe('conflict');
    expect(planDailyUndo(undo, today(null)).kind).toBe('conflict');
  });

  it('updatedAt 이 없거나 빈 값이면(계약 위반) 같다고 보지 않는다', () => {
    const noStamp = { ...saved, updatedAt: undefined as unknown as string };
    expect(planDailyUndo({ before: null, saved: noStamp }, today(saved)).kind).toBe('conflict');
    expect(planDailyUndo({ before: null, saved: saved }, today({ ...saved, updatedAt: '' })).kind).toBe('conflict');
  });

  it('날짜가 넘어가면 updatedAt 이 같아도 만료가 먼저다(새 날짜 기록을 건드리지 않는다)', () => {
    expect(planDailyUndo(undo, today(saved, '2026-10-13')).kind).toBe('expired');
    expect(planDailyUndo(undo, today(null, '2026-10-11')).kind).toBe('expired');
  });

  it('복원 본문은 서버 GET 으로 받은 before 값 그대로(저장 응답의 값이 아니다)', () => {
    const before = { ...base, foodLevel: 1, memo: '서버 값', symptoms: sym('cough'), updatedAt: '2026-10-12T00:30:00Z' };
    const plan = planDailyUndo({ before, saved }, today(saved));
    expect(plan).toEqual({ kind: 'put', recordDate: '2026-10-12', body: restoreBody(before) });
    if (plan.kind === 'put') expect(plan.body.memo).toBe('서버 값');
  });
});

describe('classifyUndoError', () => {
  it('04시 INVALID_RECORD_DATE 는 400 이 아니어도 코드로 만료 분류, 다른 400 은 server', () => {
    expect(classifyUndoError(new ApiError('http', 400, 'INVALID_RECORD_DATE', 'x'))).toBe('expired');
    expect(classifyUndoError(new ApiError('http', 400, 'VALIDATION_ERROR', 'x'))).toBe('server');
    expect(classifyUndoError(new ApiError('http', 429, 'RATE_LIMITED', 'x'))).toBe('server');
    expect(classifyUndoError(new ApiError('http', 503, null, 'x'))).toBe('server');
    expect(classifyUndoError(undefined)).toBe('server');
    expect(classifyUndoError(null)).toBe('server');
  });
});

describe('checkWeightDigits: 5배 경계', () => {
  const ask = (text: string, lastKg: number | null, over = {}) =>
    checkWeightDigits({ text, measured: true, lastKg, savedKg: null, confirmedKg: null, ...over }).ask;

  it('상수는 5', () => expect(WEIGHT_CHECK_RATIO).toBe(5));

  it('정확히 5배·1/5 는 묻고 한 칸 안쪽은 묻지 않는다', () => {
    expect(ask('5', 1)).toBe(true);
    expect(ask('4.99', 1)).toBe(false);
    expect(ask('0.2', 1)).toBe(true);
    expect(ask('0.21', 1)).toBe(false);
    expect(ask('0.5', 0.1)).toBe(true); // 부동소수점: 0.1 * 5
    expect(ask('16.5', 3.3)).toBe(true); // 3.3 * 5 = 16.499999999999996
    expect(ask('0.66', 3.3)).toBe(true); // 3.3 / 5 = 0.66
  });

  it('지난 기록이 0·음수·없음이면 묻지 않는다', () => {
    expect(ask('43', 0)).toBe(false);
    expect(ask('43', -4.3)).toBe(false);
    expect(ask('43', null)).toBe(false);
  });

  it('지난 기록이 소수 둘째 자리·아주 작은 값이어도 계산한다', () => {
    expect(ask('21.65', 4.33)).toBe(true);
    expect(ask('21.64', 4.33)).toBe(false);
    expect(ask('0.86', 4.31)).toBe(true); // 4.31 / 5 = 0.862
    expect(ask('0.87', 4.31)).toBe(false);
    expect(ask('0.25', 0.05)).toBe(true);
    expect(ask('0.24', 0.05)).toBe(false);
  });

  it('소수 둘째 자리 격자 전체에서 정수(센트) 계산과 판정이 일치한다', () => {
    const mismatches: string[] = [];
    for (let lastC = 10; lastC <= 4000; lastC += 7) {
      const last = lastC / 100;
      for (const enteredC of [lastC * 5, lastC * 5 - 1, lastC * 5 + 1, Math.ceil(lastC / 5), Math.floor(lastC / 5), Math.ceil(lastC / 5) + 1]) {
        if (enteredC <= 0 || enteredC >= 20000) continue;
        const expected = enteredC >= lastC * 5 || enteredC * 5 <= lastC;
        const actual = ask(String(enteredC / 100), last);
        if (actual !== expected) mismatches.push(`last=${last} entered=${enteredC / 100} expected=${expected}`);
      }
    }
    expect(mismatches).toEqual([]);
  });

  it('입력칸 보정(쉼표→점)을 거친 값으로도 판정된다. 쉼표 그대로 들어오면 읽지 못해 묻지 않는다', () => {
    expect(ask(sanitizeWeightInput('21,5'), 4.3)).toBe(true);
    expect(ask('21,5', 4.3)).toBe(false);
    expect(ask(' 43 ', 4.3)).toBe(true);
    expect(ask('4.3.5', 4.3)).toBe(false);
  });

  it('측정 꺼짐·이미 저장된 값·확인한 값은 묻지 않는다. 200 이상은 저장 불가라 묻지 않는다', () => {
    expect(ask('43', 4.3, { measured: false })).toBe(false);
    expect(ask('43', 4.3, { savedKg: 43 })).toBe(false);
    expect(ask('43', 4.3, { confirmedKg: 43 })).toBe(false);
    expect(ask('200', 4.3)).toBe(false);
    expect(ask('199.99', 4.3)).toBe(true);
  });

  it('보여 주는 숫자는 입력 그대로(kg 글자·판단 말 없음)', () => {
    expect(checkWeightDigits({ text: '43.0', measured: true, lastKg: 4.3, savedKg: null, confirmedKg: null }))
      .toEqual({ ask: true, entered: '43', last: '4.3' });
  });
});

describe('문구 금지어: 모든 고정 문구와 동적 문구', () => {
  it('UNDO_TEXT 전체', () => {
    for (const [key, text] of Object.entries(UNDO_TEXT)) expect({ key, hit: findUndoForbidden(text) }).toEqual({ key, hit: null });
  });

  it('동적 문구: 약 이름·시각·며칠 전·실패 사유를 바꿔 끼워도 걸리지 않는다', () => {
    const names = ['아조딜', '약', '혈압약 A', 'Benazepril'];
    const times = ['오전 8:00', '오후 12:05', '오후 11:59'];
    const reasons = ['서버에 연결할 수 없어요.', '서버에 잠시 문제가 있어요.', '잠시 후 다시 시도해 주세요.'];
    const hits: string[] = [];
    const check = (t: string) => { const h = findUndoForbidden(t); if (h) hits.push(`${t} → ${h}`); };
    for (const n of names) { check(doseUndoneText(n)); for (const tm of times) check(doseUndoButtonLabel(`${n} 1캡슐`, tm)); }
    for (const r of reasons) check(doseUndoFailText(r));
    for (let d = 0; d <= 400; d++) {
      check(weightLastText('4.3', daysAgoText(d)));
      check(weightCardSpeech('4.3', '43'));
    }
    check(weightEnteredText('0.43'));
    expect(hits).toEqual([]);
  });

  it('금지어 목록이 실제로 걸러낸다(검사 함수가 항상 null 을 주지 않는다)', () => {
    for (const bad of ['위험해요', '정상이에요', '주의하세요', '체중이 줄었어요', '3% 늘었어요', '증가', '감소', '경고', '진단', '배로 늘었어요', '변화', '차이', '실수'])
      expect({ bad, ok: findUndoForbidden(bad) !== null }).toEqual({ bad, ok: true });
  });
});
