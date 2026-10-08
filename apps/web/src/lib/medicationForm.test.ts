import { describe, expect, it } from 'vitest';
import {
  addTime,
  draftFromMedication,
  EMPTY_MEDICATION_DRAFT,
  removeTime,
  setTimeAt,
  toMedicationInput,
  validateMedicationDraft,
  type MedicationDraft,
} from './medicationForm';

const ok: MedicationDraft = { id: null, name: '아조딜', doseText: '1캡슐', times: ['08:00', '20:00'] };

describe('validateMedicationDraft', () => {
  it('정상 입력은 문제 없음', () => {
    expect(validateMedicationDraft(ok)).toBeNull();
    expect(validateMedicationDraft({ ...ok, name: 'a'.repeat(50) })).toBeNull();
    expect(validateMedicationDraft({ ...ok, times: ['08:00', '12:00', '20:00'] })).toBeNull();
  });

  it('이름 없음·공백만', () => {
    expect(validateMedicationDraft({ ...ok, name: '' })).toBe('약 이름을 적어 주세요.');
    expect(validateMedicationDraft({ ...ok, name: '   ' })).toBe('약 이름을 적어 주세요.');
  });

  it('이름 50자 초과(앞뒤 공백은 세지 않음)', () => {
    expect(validateMedicationDraft({ ...ok, name: 'a'.repeat(51) })).toBe('약 이름은 50자까지 적을 수 있어요.');
    expect(validateMedicationDraft({ ...ok, name: ` ${'a'.repeat(50)} ` })).toBeNull();
  });

  it('용량 50자 초과(앞뒤 공백은 세지 않음)', () => {
    expect(validateMedicationDraft({ ...ok, doseText: 'd'.repeat(50) })).toBeNull();
    expect(validateMedicationDraft({ ...ok, doseText: ` ${'d'.repeat(50)} ` })).toBeNull();
    expect(validateMedicationDraft({ ...ok, doseText: 'd'.repeat(51) })).toBe('용량은 50자까지 적을 수 있어요.');
  });

  it('시각 0개·4개', () => {
    expect(validateMedicationDraft({ ...ok, times: [] })).toBe('먹이는 시각을 1~3개 정해 주세요.');
    expect(validateMedicationDraft({ ...ok, times: ['01:00', '02:00', '03:00', '04:00'] })).toBe(
      '먹이는 시각을 1~3개 정해 주세요.',
    );
  });

  it('시각 형식 오류(비어 있음)', () => {
    expect(validateMedicationDraft({ ...ok, times: ['08:00', ''] })).toBe('먹이는 시각을 모두 골라 주세요.');
    expect(validateMedicationDraft({ ...ok, times: ['8:00'] })).toBe('먹이는 시각을 모두 골라 주세요.');
  });

  it('같은 시각 중복', () => {
    expect(validateMedicationDraft({ ...ok, times: ['08:00', '08:00'] })).toBe(
      '같은 시각이 두 번 들어갔어요. 서로 다른 시각으로 골라 주세요.',
    );
  });
});

describe('toMedicationInput', () => {
  it('이름·용량 trim, 시각 오름차순', () => {
    expect(toMedicationInput({ id: null, name: '  레나메진 ', doseText: ' 1포 ', times: ['21:00', '08:00'] })).toEqual({
      name: '레나메진',
      doseText: '1포',
      times: ['08:00', '21:00'],
    });
  });

  it('용량이 공백이면 null', () => {
    expect(toMedicationInput({ ...ok, doseText: '   ' }).doseText).toBeNull();
    expect(toMedicationInput({ ...ok, doseText: '' }).doseText).toBeNull();
  });

  it('원본 배열을 바꾸지 않는다', () => {
    const times = ['21:00', '08:00'];
    toMedicationInput({ ...ok, times });
    expect(times).toEqual(['21:00', '08:00']);
  });
});

describe('초안·시각 편집', () => {
  it('빈 초안은 새 약(id null)이고 08:00 하나', () => {
    expect(EMPTY_MEDICATION_DRAFT).toEqual({ id: null, name: '', doseText: '', times: ['08:00'] });
  });

  it('draftFromMedication: 용량 null 은 빈 문자열, 시각은 복사', () => {
    const med = { id: 'm1', petId: 'p', name: '약', doseText: null, times: ['09:00'], active: true };
    const d = draftFromMedication(med);
    expect(d).toEqual({ id: 'm1', name: '약', doseText: '', times: ['09:00'] });
    expect(d.times).not.toBe(med.times);
  });

  it('addTime: 20:00 을 덧붙이고 3개를 넘기지 않는다', () => {
    expect(addTime(['08:00'])).toEqual(['08:00', '20:00']);
    expect(addTime(['08:00', '12:00', '16:00'])).toEqual(['08:00', '12:00', '16:00']);
  });

  it('removeTime·setTimeAt', () => {
    expect(removeTime(['08:00', '12:00', '20:00'], 1)).toEqual(['08:00', '20:00']);
    expect(setTimeAt(['08:00', '20:00'], 1, '21:30')).toEqual(['08:00', '21:30']);
  });
});
