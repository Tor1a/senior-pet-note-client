// [공유 로직 테스트 사본] 원본: web/src/lib/routineForm.test.ts (2026-10-13 복사)
// 웹 원본에서 `import ... from 'vitest'` 한 줄만 제거했고(describe/it/expect 는 jest 전역 사용) 나머지 본문은 동일하다.
// 웹 원본을 고치면 이 사본도 같이 고친다. 추후 packages/shared 로 통합 예정.
import type { DailyLog } from './petApi';
import {
  hasRoutineValue,
  isRoutineDirty,
  isStepDisabled,
  routineFromLog,
  ROUTINE_MAX,
  stepRoutine,
  toRoutineValue,
  undoRoutineNote,
} from './routineForm';
import { logFixture } from './historyFixtures';

describe('stepRoutine (기획 7-1: 첫 + = 1, 1→0, 0 유지, 20 상한, 지우기)', () => {
  it('안 적음에서 + 는 0 이 아니라 1회', () => {
    expect(stepRoutine(null, 'plus')).toBe(1);
  });
  it('− 는 1→0, 0 과 안 적음은 그대로', () => {
    expect(stepRoutine(1, 'minus')).toBe(0);
    expect(stepRoutine(0, 'minus')).toBe(0);
    expect(stepRoutine(null, 'minus')).toBeNull();
    expect(stepRoutine(20, 'minus')).toBe(19);
  });
  it('+ 는 20 에서 멈춘다', () => {
    expect(stepRoutine(19, 'plus')).toBe(20);
    expect(stepRoutine(ROUTINE_MAX, 'plus')).toBe(20);
    expect(stepRoutine(0, 'plus')).toBe(1);
  });
  it('지우기는 0 도 안 적음으로', () => {
    expect(stepRoutine(0, 'clear')).toBeNull();
    expect(stepRoutine(7, 'clear')).toBeNull();
    expect(stepRoutine(null, 'clear')).toBeNull();
  });
  it('눌러도 변화 없는 버튼을 비활성 모양으로 알린다', () => {
    expect(isStepDisabled(null, 'minus')).toBe(true);
    expect(isStepDisabled(0, 'minus')).toBe(true);
    expect(isStepDisabled(20, 'plus')).toBe(true);
    expect(isStepDisabled(null, 'clear')).toBe(true);
    expect(isStepDisabled(0, 'clear')).toBe(false);
    expect(isStepDisabled(null, 'plus')).toBe(false);
  });
});

describe('서버 값 읽기', () => {
  it('0 은 0 으로, 없음·범위 밖·소수는 안 적음으로 읽는다', () => {
    expect(toRoutineValue(0)).toBe(0);
    expect(toRoutineValue(20)).toBe(20);
    expect(toRoutineValue(21)).toBeNull();
    expect(toRoutineValue(-1)).toBeNull();
    expect(toRoutineValue(1.5)).toBeNull();
    expect(toRoutineValue(undefined)).toBeNull();
    expect(toRoutineValue('3')).toBeNull();
  });
  it('필드가 없는 구버전 응답과 기록 없음은 안 적음', () => {
    expect(routineFromLog(null)).toEqual({ walk: null, poop: null });
    const old = { ...logFixture('2026-10-12') } as Partial<DailyLog>;
    delete old.walkCount;
    delete old.poopCount;
    expect(routineFromLog(old as DailyLog)).toEqual({ walk: null, poop: null });
    expect(routineFromLog(logFixture('2026-10-12', { walkCount: 0, poopCount: 3 }))).toEqual({ walk: 0, poop: 3 });
  });
  it('0 도 값이 있는 것으로 센다', () => {
    expect(hasRoutineValue({ walk: 0, poop: null })).toBe(true);
    expect(hasRoutineValue({ walk: null, poop: null })).toBe(false);
  });
});

describe('isRoutineDirty', () => {
  it('값 비교: 같으면 아니고, 0 과 안 적음은 다르다', () => {
    expect(isRoutineDirty({ walk: 2, poop: null }, { walk: 2, poop: null })).toBe(false);
    expect(isRoutineDirty({ walk: 0, poop: null }, { walk: null, poop: null })).toBe(true);
    expect(isRoutineDirty({ walk: 3, poop: null }, { walk: 2, poop: null })).toBe(true);
  });
});

describe('undoRoutineNote (되돌리기 결과 안내 덧붙임 조건)', () => {
  const saved = logFixture('2026-10-12', { walkCount: 2, poopCount: null });
  it('저장 전 값으로 PUT: 루틴이 달라졌을 때만 restored', () => {
    expect(undoRoutineNote(logFixture('2026-10-12', { walkCount: 1 }), saved, true)).toBe('restored');
    expect(undoRoutineNote(logFixture('2026-10-12', { walkCount: 2 }), saved, true)).toBeNull();
    expect(undoRoutineNote(logFixture('2026-10-12'), logFixture('2026-10-12'), true)).toBeNull();
  });
  it('행 삭제: 저장분에 루틴 값이 있었을 때만 removed', () => {
    expect(undoRoutineNote(null, saved, false)).toBe('removed');
    expect(undoRoutineNote(null, logFixture('2026-10-12'), false)).toBeNull();
    expect(undoRoutineNote(null, logFixture('2026-10-12', { poopCount: 0 }), false)).toBe('removed');
  });
});
