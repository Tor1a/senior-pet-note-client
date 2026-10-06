// "오늘" 화면 입력 상태 (UI 상태 로직만. 제안값·기록 날짜 계산은 서버가 한다)
//
// 값의 출처(source)
//   empty     : 값 없음(기록 없음으로 저장)
//   suggested : 서버가 준 "최근 평균" 제안값. 점선으로 표시하고, [저장]을 눌러야 확정된다
//   confirmed : 사용자가 고른 값 또는 이미 저장된 값. 실선으로 표시
import { MEMO_MAX_LENGTH } from './constants';
import { formatKg } from './format';
import type { DailyLogBody, TodayResponse } from './petApi';
import {
  INITIAL_SYMPTOM_STATE,
  symptomStateFromLog,
  toSymptomFields,
  type SymptomState,
} from './symptoms';

export type ValueSource = 'empty' | 'suggested' | 'confirmed';

export interface LevelField {
  value: number | null;
  source: ValueSource;
}

export interface TodayForm {
  food: LevelField;
  waterMode: 'level' | 'ml';
  water: LevelField;
  /** ml 입력값(문자열 그대로) */
  waterMl: { text: string; source: ValueSource };
  /** 체중: measured 가 true 일 때만 저장한다(와이어프레임 개발자 메모 3) */
  weight: { text: string; measured: boolean; suggested: boolean };
  symptoms: SymptomState;
  memo: string;
}

function fromSaved(value: number | null): LevelField {
  return value == null ? { value: null, source: 'empty' } : { value, source: 'confirmed' };
}

function fromSuggestion(value: number | null): LevelField {
  return value == null ? { value: null, source: 'empty' } : { value, source: 'suggested' };
}

/**
 * 서버 응답으로 화면 초기 상태를 만든다.
 * - 저장된 dailyLog 가 있으면 그 값(실선)
 * - 없으면 suggestions 를 제안값(점선)으로. 증상은 "특이사항 없음" 기본 선택(대표 결정 4)
 * @param preferMl 사용자가 지난번에 물을 ml 로 적었는지(기기에 저장한 화면 설정)
 */
export function initialTodayForm(today: TodayResponse, preferMl = false): TodayForm {
  const { dailyLog: log, suggestions: s, lastWeight } = today;
  if (log) {
    return {
      food: fromSaved(log.foodLevel),
      waterMode: log.waterMl != null ? 'ml' : log.waterLevel != null ? 'level' : preferMl ? 'ml' : 'level',
      water: fromSaved(log.waterLevel),
      waterMl: log.waterMl != null ? { text: String(log.waterMl), source: 'confirmed' } : { text: '', source: 'empty' },
      weight:
        log.weightKg != null
          ? { text: formatKg(log.weightKg), measured: true, suggested: false }
          : weightFromReference(s.weightKg, lastWeight?.weightKg ?? null),
      symptoms: symptomStateFromLog(log),
      memo: log.memo ?? '',
    };
  }
  const mlMode = preferMl || (s.waterLevel == null && s.waterMl != null);
  return {
    food: fromSuggestion(s.foodLevel),
    waterMode: mlMode ? 'ml' : 'level',
    water: fromSuggestion(s.waterLevel),
    waterMl: s.waterMl != null ? { text: String(s.waterMl), source: 'suggested' } : { text: '', source: 'empty' },
    weight: weightFromReference(s.weightKg, lastWeight?.weightKg ?? null),
    symptoms: { ...INITIAL_SYMPTOM_STATE, codes: [] },
    memo: '',
  };
}

/** 체중 칸의 시작값: 최근 평균(제안) → 없으면 지난 기록. 저장은 하지 않는다 */
function weightFromReference(suggested: number | null, last: number | null): TodayForm['weight'] {
  if (suggested != null) return { text: formatKg(suggested), measured: false, suggested: true };
  if (last != null) return { text: formatKg(last), measured: false, suggested: false };
  return { text: '', measured: false, suggested: false };
}

/**
 * 3단 버튼 탭
 * - 다른 값(또는 점선 제안값)을 누르면 그 값으로 확정(실선)
 * - 이미 확정된 값을 다시 누르면 선택 해제(기록 없음)
 */
export function tapLevel(field: LevelField, value: number): LevelField {
  if (field.value === value && field.source === 'confirmed') return { value: null, source: 'empty' };
  return { value, source: 'confirmed' };
}

/** 체중 ±0.1 스테퍼. 값이 비어 있으면 아무것도 하지 않는다 */
export function stepWeight(text: string, delta: number): string {
  const n = Number(text);
  if (!text || Number.isNaN(n)) return text;
  // 소수 둘째 자리까지 유지 (4.35 + 0.1 = 4.45)
  const next = Math.round((n + delta) * 100) / 100;
  if (next <= 0 || next >= 200) return text;
  return formatKg(next);
}

/** 저장 전 입력 확인. 문제가 있으면 한국어 안내 문구, 없으면 null */
export function validateTodayForm(form: TodayForm): string | null {
  if (form.waterMode === 'ml' && form.waterMl.text.trim() !== '') {
    const ml = Number(form.waterMl.text);
    if (!Number.isInteger(ml) || ml < 0 || ml > 20000) return '물은 0~20000 사이 숫자(ml)로 적어 주세요.';
  }
  if (form.weight.measured) {
    const kg = Number(form.weight.text);
    if (form.weight.text.trim() === '' || Number.isNaN(kg) || kg <= 0 || kg >= 200) {
      return '체중은 0보다 크고 200보다 작은 숫자(kg)로 적어 주세요.';
    }
  }
  return null;
}

/** PUT /api/pets/{petId}/daily-logs/{recordDate} 본문 (계약 5장과 같은 8개 필드) */
export function buildDailyLogBody(form: TodayForm): DailyLogBody {
  const mlText = form.waterMl.text.trim();
  const weightKg = form.weight.measured ? Math.round(Number(form.weight.text) * 100) / 100 : null;
  return {
    foodLevel: form.food.value,
    waterLevel: form.waterMode === 'level' ? form.water.value : null,
    waterMl: form.waterMode === 'ml' && mlText !== '' ? Number(mlText) : null,
    weightKg,
    ...toSymptomFields(form.symptoms),
    memo: form.memo.slice(0, MEMO_MAX_LENGTH),
  };
}

/** 첫 사용(빈) 상태: 저장된 기록도, 제안값도, 지난 체중도 없음 */
export function isFirstUse(today: TodayResponse): boolean {
  const s = today.suggestions;
  return (
    !today.dailyLog &&
    s.foodLevel == null &&
    s.waterLevel == null &&
    s.waterMl == null &&
    s.weightKg == null &&
    today.lastWeight == null
  );
}
