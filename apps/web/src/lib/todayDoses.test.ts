import { describe, expect, it } from 'vitest';
import type { Dose, Pet, TodayResponse } from './petApi';
import {
  applyCheckResult,
  applyUncheckResult,
  collapseTaken,
  daysAgoText,
  doseKey,
  doseLabel,
  headerInfo,
  mergeServerDoses,
  markTaken,
  markUntaken,
  pickHighlightKey,
  restoreDose,
  rollback,
  settleDose,
  toDoseViews,
} from './todayDoses';

const DONE: Dose = {
  medicationId: 'm1',
  name: '아조딜',
  doseText: '1캡슐',
  scheduledTime: '08:00',
  taken: true,
  medLogId: 'log-1',
  takenAt: '2026-10-05T23:05:00Z',
};
const TODO: Dose = { ...DONE, scheduledTime: '20:00', taken: false, medLogId: null, takenAt: null };

describe('투약 카드 상태', () => {
  it('toDoseViews: 체크한 회차만 접힌 상태로 시작한다', () => {
    const v = toDoseViews([DONE, TODO]);
    expect(v.map((d) => d.collapsed)).toEqual([true, false]);
    expect(v.every((d) => !d.pending)).toBe(true);
  });

  it('markTaken → rollback 으로 원래대로 돌아간다', () => {
    const list = toDoseViews([DONE, TODO]);
    const key = doseKey(TODO);
    const checked = markTaken(list, key, '2026-10-06T11:00:00Z');
    expect(checked[1]).toMatchObject({ taken: true, pending: true, takenAt: '2026-10-06T11:00:00Z' });
    expect(checked[0]).toBe(list[0]);
    expect(rollback(checked, key)[1]).toEqual(list[1]);
  });

  it('collapseTaken 은 체크 상태인 회차만 접는다', () => {
    const list = toDoseViews([TODO]);
    const key = doseKey(TODO);
    expect(collapseTaken(list, key)[0].collapsed).toBe(false);
    expect(collapseTaken(markTaken(list, key, 'x'), key)[0].collapsed).toBe(true);
  });

  it('applyCheckResult 는 서버 값으로 맞추고, settleDose 는 체크를 유지한다', () => {
    const key = doseKey(TODO);
    const checked = markTaken(toDoseViews([TODO]), key, 'x');
    expect(applyCheckResult(checked, key, { id: 'log-9', takenAt: 'y' })[0]).toMatchObject({
      pending: false,
      medLogId: 'log-9',
      takenAt: 'y',
      taken: true,
    });
    expect(settleDose(checked, key)[0]).toMatchObject({ pending: false, taken: true });
  });

  it('취소: markUntaken → 성공이면 medLogId 제거, 실패면 restoreDose 로 복원', () => {
    const list = toDoseViews([DONE]);
    const key = doseKey(DONE);
    const before = list[0];
    const un = markUntaken(list, key);
    expect(un[0]).toMatchObject({ taken: false, pending: true, collapsed: false, takenAt: null });
    expect(applyUncheckResult(un, key)[0]).toMatchObject({ pending: false, medLogId: null, taken: false });
    expect(restoreDose(un, key, before)[0]).toEqual(before);
  });

  it('applyCheckResult·applyUncheckResult 는 taken 도 함께 기록한다(오래된 응답이 덮어쓴 뒤에도 바로잡힘)', () => {
    const key = doseKey(TODO);
    const wrongOff = toDoseViews([{ ...TODO, taken: false }]); // 오래된 sync 가 taken:false 로 덮은 상태
    expect(applyCheckResult(wrongOff, key, { id: 'log-9', takenAt: 'y' })[0]).toMatchObject({ taken: true, medLogId: 'log-9' });
    const wrongOn = toDoseViews([{ ...DONE }]);
    expect(applyUncheckResult(wrongOn, doseKey(DONE))[0]).toMatchObject({ taken: false, medLogId: null, takenAt: null });
  });

  it('mergeServerDoses: 응답 대기 중(pending)인 회차는 서버 응답으로 덮지 않는다', () => {
    const key = doseKey(TODO);
    const list = markTaken(toDoseViews([DONE, TODO]), key, 'now');
    const merged = mergeServerDoses(list, [DONE, TODO]); // 서버는 아직 TODO 를 안 먹인 것으로 안다
    expect(merged[1]).toMatchObject({ taken: true, pending: true, takenAt: 'now' });
    expect(merged[0]).toMatchObject({ taken: true, pending: false, collapsed: true });
    // pending 이 아니면 서버 값으로 맞춘다
    expect(mergeServerDoses(toDoseViews([TODO]), [{ ...TODO, taken: true, medLogId: 'z', takenAt: 'q' }])[0]).toMatchObject({ taken: true, medLogId: 'z' });
  });
});

describe('알림 강조', () => {
  const list = toDoseViews([DONE, TODO, { ...TODO, medicationId: 'm2' }]);

  it('해당 약의 아직 안 먹인 첫 회차를 고른다', () => {
    expect(pickHighlightKey(list, 'm1', false)).toBe(doseKey(TODO));
    expect(pickHighlightKey(list, 'm2', false)).toBe('m2@20:00');
  });

  it('없는 id·source 가 push 가 아님(null)·이미 체크·시간 경과면 null', () => {
    expect(pickHighlightKey(list, 'nope', false)).toBeNull();
    expect(pickHighlightKey(list, null, false)).toBeNull();
    expect(pickHighlightKey(toDoseViews([DONE]), 'm1', false)).toBeNull();
    expect(pickHighlightKey(list, 'm1', true)).toBeNull();
  });
});

describe('문구', () => {
  it('doseLabel 두 상태', () => {
    expect(doseLabel(TODO)).toBe('오후 8:00 아조딜 1캡슐, 아직 체크하지 않았어요. 누르면 먹였어요로 체크해요');
    expect(doseLabel(DONE)).toBe('오전 8:00 아조딜 1캡슐, 8:05 먹임. 누르면 체크를 취소해요');
  });

  it('doseLabel: 용량이 없으면 이름만, 체크 시각이 없으면 "먹임"', () => {
    expect(doseLabel({ ...TODO, doseText: null })).toContain('오후 8:00 아조딜,');
    expect(doseLabel({ ...DONE, takenAt: null })).toContain(', 먹임.');
  });

  it('daysAgoText', () => {
    expect(daysAgoText(0)).toBe('오늘');
    expect(daysAgoText(1)).toBe('어제');
    expect(daysAgoText(3)).toBe('3일 전');
  });

  const PET: Pet = {
    id: 'p',
    name: '보리',
    species: 'dog',
    birthYear: 2012,
    conditions: '신부전',
    hasPhoto: false,
    createdAt: '',
    updatedAt: '',
  };
  const TODAY = { recordDate: '2026-10-06' } as TodayResponse;

  it('headerInfo: 이름 · 나이 · 지병, 없는 항목은 뺀다', () => {
    expect(headerInfo(PET, TODAY)).toBe('보리 · 14살 · 신부전');
    expect(headerInfo({ ...PET, birthYear: null, conditions: null }, TODAY)).toBe('보리');
    expect(headerInfo(PET, null)).toBe('보리 · 신부전');
    expect(headerInfo(null, null)).toBe('');
  });
});
