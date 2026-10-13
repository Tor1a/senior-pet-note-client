import { describe, expect, it } from 'vitest';
import { logFixture } from './historyFixtures';
import type { TodayResponse } from './petApi';
import { buildDailyLogBody, initialTodayForm, isFormDirty } from './todayForm';
import { restoreBody } from './undoLogic';

function today(over: Partial<TodayResponse> = {}): TodayResponse {
  return {
    recordDate: '2026-10-12',
    cutoffNotice: '',
    doses: [],
    dailyLog: null,
    suggestions: { foodLevel: 2, waterLevel: 2, waterMl: null, weightKg: 4.35 },
    lastWeight: { weightKg: 4.4, recordDate: '2026-10-09' },
    ...over,
  };
}

describe('루틴 기록: 폼 상태·요청 본문·변경 여부', () => {
  it('기록이 없으면 제안값이 있어도 루틴은 안 적음(제안값·기본값 없음)', () => {
    expect(initialTodayForm(today()).routine).toEqual({ walk: null, poop: null });
  });

  it('저장된 값을 그대로 읽고, 0 은 0 으로 둔다', () => {
    const t = today({ dailyLog: logFixture('2026-10-12', { walkCount: 0, poopCount: 3 }) });
    expect(initialTodayForm(t).routine).toEqual({ walk: 0, poop: 3 });
  });

  it('루틴을 안 바꿨으면 두 키를 생략한다(8필드). 서버는 생략 = 기존 값 유지', () => {
    const t = today({ dailyLog: logFixture('2026-10-12', { walkCount: 2, poopCount: null }) });
    const f = initialTodayForm(t);
    const body = buildDailyLogBody(f, f.routine);
    expect('walkCount' in body).toBe(false);
    expect('poopCount' in body).toBe(false);
    expect(Object.keys(JSON.parse(JSON.stringify(body)))).toHaveLength(8);
    // 기록이 없고(baseline null) 안 건드렸어도 생략
    const empty = initialTodayForm(today());
    expect(Object.keys(JSON.parse(JSON.stringify(buildDailyLogBody(empty, empty.routine))))).toHaveLength(8);
  });

  it('루틴을 바꿨으면 두 키를 모두 싣는다(10필드, 0 은 0 으로)', () => {
    const base = initialTodayForm(today());
    const body = buildDailyLogBody({ ...base, routine: { walk: 0, poop: 3 } }, base.routine);
    expect(body).toMatchObject({ walkCount: 0, poopCount: 3 });
    expect(Object.keys(JSON.parse(JSON.stringify(body)))).toHaveLength(10);
  });

  it('저장된 값을 지우면(기준 값 → 안 적음) null 을 명시해 보낸다', () => {
    const t = today({ dailyLog: logFixture('2026-10-12', { walkCount: 2, poopCount: 1 }) });
    const base = initialTodayForm(t);
    const body = buildDailyLogBody({ ...base, routine: { walk: null, poop: null } }, base.routine);
    expect(body.walkCount).toBeNull();
    expect(body.poopCount).toBeNull();
    // JSON 으로 보냈을 때도 null 키가 남는다
    expect(JSON.parse(JSON.stringify(body))).toMatchObject({ walkCount: null, poopCount: null });
    expect(Object.keys(JSON.parse(JSON.stringify(body)))).toHaveLength(10);
  });

  it('바꿨다가 원래대로 돌려놓으면 다시 생략한다', () => {
    const t = today({ dailyLog: logFixture('2026-10-12', { walkCount: 2, poopCount: null }) });
    const base = initialTodayForm(t);
    const back = { ...base, routine: { walk: 5, poop: null } };
    expect('walkCount' in buildDailyLogBody(back, base.routine)).toBe(true);
    expect('walkCount' in buildDailyLogBody({ ...back, routine: { ...base.routine } }, base.routine)).toBe(false);
  });

  it('루틴 값을 바꾸면 바뀐 것이고, 원래대로 돌려놓으면 아니다', () => {
    const base = initialTodayForm(today());
    const changed = { ...base, routine: { walk: 1, poop: null } };
    expect(isFormDirty(changed, base)).toBe(true);
    expect(isFormDirty({ ...changed, routine: { walk: null, poop: null } }, base)).toBe(false);
    expect(isFormDirty({ ...base, routine: { walk: 0, poop: null } }, base)).toBe(true); // 0 ≠ 안 적음
  });

  it('restoreBody 는 저장 전 루틴이 없으면 null 을 명시하고, 값이 있으면 그 값을 싣는다', () => {
    expect(restoreBody(logFixture('2026-10-12'))).toMatchObject({ walkCount: null, poopCount: null });
    const old = logFixture('2026-10-12');
    delete (old as { walkCount?: unknown }).walkCount; // 필드가 없는 응답도 null 로 명시
    expect(restoreBody(old).walkCount).toBeNull();
    expect(restoreBody(logFixture('2026-10-12', { walkCount: 4, poopCount: 0 }))).toMatchObject({ walkCount: 4, poopCount: 0 });
  });
});
