// QA 추가(모바일 전용): 약 폼 검증 경계값. 웹 사본 테스트(medicationForm.test.ts)는 건드리지 않는다.
import { addTime, removeTime, toMedicationInput, validateMedicationDraft, type MedicationDraft } from './medicationForm';

const ok: MedicationDraft = { id: null, name: '아조딜', doseText: '', times: ['08:00'] };

describe('QA 추가: 약 폼 경계', () => {
  it('이름 49·50자 통과, 51자 거부 / 시각 1·2·3개 통과, 0·4개 거부', () => {
    expect(validateMedicationDraft({ ...ok, name: 'a'.repeat(49) })).toBeNull();
    expect(validateMedicationDraft({ ...ok, name: 'a'.repeat(50) })).toBeNull();
    expect(validateMedicationDraft({ ...ok, name: 'a'.repeat(51) })).not.toBeNull();
    expect(validateMedicationDraft({ ...ok, times: ['01:00', '02:00'] })).toBeNull();
    expect(validateMedicationDraft({ ...ok, times: [] })).not.toBeNull();
    expect(validateMedicationDraft({ ...ok, times: ['01:00', '02:00', '03:00', '04:00'] })).not.toBeNull();
  });

  it('용량 50자는 본문에 그대로, 앞뒤 공백만 있는 용량은 null', () => {
    expect(toMedicationInput({ ...ok, doseText: 'd'.repeat(50) }).doseText).toBe('d'.repeat(50));
    expect(toMedicationInput({ ...ok, doseText: ' \t ' }).doseText).toBeNull();
  });

  it('시각 정렬: 00:00 이 맨 앞, 23:59 가 맨 뒤', () => {
    expect(toMedicationInput({ ...ok, times: ['23:59', '12:00', '00:00'] }).times).toEqual(['00:00', '12:00', '23:59']);
  });

  it('빼기: 범위 밖 인덱스는 아무것도 안 빼고, addTime 은 이미 3개면 그대로', () => {
    expect(removeTime(['08:00'], 5)).toEqual(['08:00']);
    expect(addTime(['01:00', '02:00', '03:00'])).toEqual(['01:00', '02:00', '03:00']);
  });

  it('용량 51자는 검증에서 거부된다(서버 @Size(max=50))', () => {
    expect(validateMedicationDraft({ ...ok, doseText: 'd'.repeat(51) })).toBe('용량은 50자까지 적을 수 있어요.');
    expect(validateMedicationDraft({ ...ok, doseText: 'd'.repeat(50) })).toBeNull();
  });
});
