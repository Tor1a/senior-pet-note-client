import { describe, expect, it } from 'vitest';
import { ApiError } from './api';
import type { DailyLog, TodayResponse } from './petApi';
import { checkWeightDigits, classifyUndoError, planDailyUndo, restoreBody, type DailyUndo } from './undoLogic';

const LOG: DailyLog = {
  id: 'log-1',
  petId: 'pet-1',
  recordDate: '2026-10-12',
  foodLevel: 2,
  waterLevel: null,
  waterMl: 350,
  weightKg: 4.3,
  symptoms: ['cough'],
  symptomsNone: false,
  symptomOther: null,
  memo: '산책 잘 함',
  updatedAt: '2026-10-12T01:00:00Z',
};
const SAVED: DailyLog = { ...LOG, foodLevel: 3, memo: '고침', updatedAt: '2026-10-12T02:00:00Z' };

function today(dailyLog: DailyLog | null, recordDate = '2026-10-12'): TodayResponse {
  return {
    recordDate,
    cutoffNotice: '',
    doses: [],
    dailyLog,
    suggestions: { foodLevel: null, waterLevel: null, waterMl: null, weightKg: null },
    lastWeight: null,
  };
}

describe('restoreBody', () => {
  it('id·날짜·updatedAt 없이 10개 필드(기존 8 + 루틴 2)만 돌려주고 증상 배열은 복사한다', () => {
    const body = restoreBody(LOG);
    expect(Object.keys(body).sort()).toEqual(
      ['foodLevel', 'memo', 'symptomOther', 'symptoms', 'symptomsNone', 'waterLevel', 'waterMl', 'weightKg', 'walkCount', 'poopCount'].sort(),
    );
    expect(body.symptoms).toEqual(['cough']);
    expect(body.symptoms).not.toBe(LOG.symptoms);
  });
});

describe('planDailyUndo', () => {
  it('수정이었고 updatedAt 이 같으면 직전 값으로 PUT 한다', () => {
    const undo: DailyUndo = { before: LOG, saved: SAVED };
    expect(planDailyUndo(undo, today(SAVED))).toEqual({
      kind: 'put',
      recordDate: '2026-10-12',
      body: restoreBody(LOG),
    });
  });

  it('하루의 첫 저장이었고 updatedAt 이 같으면 삭제한다', () => {
    expect(planDailyUndo({ before: null, saved: SAVED }, today(SAVED))).toEqual({
      kind: 'delete',
      recordDate: '2026-10-12',
    });
  });

  it('updatedAt 이 다르면(다른 곳에서 고침) 덮어쓰지 않는다', () => {
    const other = { ...SAVED, updatedAt: '2026-10-12T02:30:00Z' };
    expect(planDailyUndo({ before: LOG, saved: SAVED }, today(other))).toEqual({ kind: 'conflict' });
    expect(planDailyUndo({ before: null, saved: SAVED }, today(other))).toEqual({ kind: 'conflict' });
  });

  it('서버에 기록이 없으면(다른 곳에서 지움) 충돌로 본다', () => {
    expect(planDailyUndo({ before: LOG, saved: SAVED }, today(null))).toEqual({ kind: 'conflict' });
  });

  it('서버의 기록 날짜가 넘어갔으면 요청 없이 만료로 본다(새 날짜 기록을 건드리지 않는다)', () => {
    expect(planDailyUndo({ before: null, saved: SAVED }, today(null, '2026-10-13'))).toEqual({ kind: 'expired' });
  });
});

describe('classifyUndoError', () => {
  it('오류를 갈래로 나눈다', () => {
    expect(classifyUndoError(new ApiError('http', 400, 'INVALID_RECORD_DATE', 'x'))).toBe('expired');
    expect(classifyUndoError(new ApiError('network', 0, null, 'x'))).toBe('network');
    expect(classifyUndoError(new ApiError('http', 404, 'NOT_FOUND', 'x'))).toBe('gone');
    expect(classifyUndoError(new ApiError('http', 401, 'UNAUTHORIZED', 'x'))).toBe('auth');
    expect(classifyUndoError(new ApiError('http', 500, null, 'x'))).toBe('server');
    expect(classifyUndoError(new Error('x'))).toBe('server');
  });
});

describe('checkWeightDigits', () => {
  const base = { measured: true, lastKg: 4.3, savedKg: null, confirmedKg: null };

  it('자릿수 오타(43, 0.43)는 묻고, 숫자를 그대로 보여 준다', () => {
    expect(checkWeightDigits({ ...base, text: '43' })).toEqual({ ask: true, entered: '43', last: '4.3' });
    expect(checkWeightDigits({ ...base, text: '0.43' })).toEqual({ ask: true, entered: '0.43', last: '4.3' });
  });

  it('경계: 정확히 5배·1/5 는 묻고, 그 안쪽은 묻지 않는다', () => {
    const at = (text: string, lastKg: number) => checkWeightDigits({ ...base, text, lastKg }).ask;
    expect(at('21.5', 4.3)).toBe(true); // 5배
    expect(at('21.4', 4.3)).toBe(false);
    expect(at('0.86', 4.3)).toBe(true); // 1/5
    expect(at('0.87', 4.3)).toBe(false);
    expect(at('2', 10)).toBe(true);
    expect(at('2.1', 10)).toBe(false);
  });

  it('보통 범위(4.8, 6.5, 3.4)는 묻지 않는다', () => {
    for (const text of ['4.8', '6.5', '3.4', '4.3']) expect(checkWeightDigits({ ...base, text }).ask).toBe(false);
  });

  it('안 쟀다고 되어 있거나 지난 기록이 없거나 숫자가 아니면 묻지 않는다', () => {
    expect(checkWeightDigits({ ...base, text: '43', measured: false }).ask).toBe(false);
    expect(checkWeightDigits({ ...base, text: '43', lastKg: null }).ask).toBe(false);
    expect(checkWeightDigits({ ...base, text: '' }).ask).toBe(false);
    expect(checkWeightDigits({ ...base, text: '.' }).ask).toBe(false);
    expect(checkWeightDigits({ ...base, text: '0' }).ask).toBe(false);
    expect(checkWeightDigits({ ...base, text: '250' }).ask).toBe(false);
  });

  it('이미 저장된 값이거나 [그대로 저장]을 눌렀던 값이면 다시 묻지 않고, 값이 바뀌면 다시 묻는다', () => {
    expect(checkWeightDigits({ ...base, text: '43', savedKg: 43 }).ask).toBe(false);
    expect(checkWeightDigits({ ...base, text: '43', confirmedKg: 43 }).ask).toBe(false);
    expect(checkWeightDigits({ ...base, text: '44', confirmedKg: 43 }).ask).toBe(true);
  });
});
