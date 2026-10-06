// [공유 로직 사본] 원본: web/src/lib/symptoms.ts (2026-10-06 복사)
// web/src/lib 과 동기화 필요. 추후 packages/shared 로 통합 예정 (mobile/README.md 참고).
// 이 파일만 고치지 말고 웹 원본과 함께 수정하세요.

// 증상 선택 상태 (대표 결정 4: "특이사항 없음" 기본 선택)
// DB 매핑: daily_logs.symptoms(text[]), symptoms_none(boolean), symptom_other(text, 30자)
// 화면의 상태일 뿐이며, [저장]을 눌러야 symptoms_none = true 로 확정된다.

export const SYMPTOM_CODES = ['vomit', 'diarrhea', 'cough', 'lethargy', 'seizure', 'other'] as const;
export type SymptomCode = (typeof SYMPTOM_CODES)[number];

export const SYMPTOM_LABELS: Record<SymptomCode, string> = {
  vomit: '구토',
  diarrhea: '설사',
  cough: '기침',
  lethargy: '기운 없음',
  seizure: '발작',
  other: '기타',
};

export const SYMPTOM_NONE_LABEL = '특이사항 없음';
export const SYMPTOM_OTHER_MAX_LENGTH = 30;

export interface SymptomState {
  /** "특이사항 없음" 선택 여부 */
  none: boolean;
  /** 선택한 증상 코드 */
  codes: SymptomCode[];
  /** 기타 내용 (codes 에 'other' 가 있을 때만 의미 있음) */
  other: string;
}

/** 초기 상태: "특이사항 없음"이 선택된 상태. 어제 증상은 이어 오지 않는다. */
export const INITIAL_SYMPTOM_STATE: Readonly<SymptomState> = Object.freeze({
  none: true,
  codes: [],
  other: '',
});

/** 증상 태그 토글. 태그를 하나라도 고르면 "특이사항 없음"은 자동 해제된다. */
export function toggleSymptom(state: SymptomState, code: SymptomCode): SymptomState {
  const selected = state.codes.includes(code);
  const codes = selected ? state.codes.filter((c) => c !== code) : [...state.codes, code];
  return {
    none: codes.length > 0 ? false : state.none,
    codes,
    other: codes.includes('other') ? state.other : '',
  };
}

/** "특이사항 없음" 선택: 다른 증상 선택을 모두 지운다. 다시 누르면 해제(=안 적음). */
export function toggleSymptomNone(state: SymptomState): SymptomState {
  if (state.none) return { ...state, none: false };
  return { none: true, codes: [], other: '' };
}

/** 저장용 값으로 변환 (DB CHECK 제약: symptoms_none 과 증상 동시 불가) */
export function toSymptomColumns(state: SymptomState): {
  symptoms: SymptomCode[];
  symptoms_none: boolean;
  symptom_other: string | null;
} {
  const other = state.codes.includes('other')
    ? state.other.trim().slice(0, SYMPTOM_OTHER_MAX_LENGTH) || null
    : null;
  return {
    symptoms: state.codes,
    symptoms_none: state.codes.length === 0 && state.none,
    symptom_other: other,
  };
}
