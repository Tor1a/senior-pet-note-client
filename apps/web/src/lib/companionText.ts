// 오늘 화면 헤더의 "함께한 날 · 기록 시작 일수" 문구와 조립 (온보딩 E단계). 숫자와 고정 문구만: 평가·압박·보상 없음.
// 근거: .company/plans/초보-견주-온보딩-C-E-F.md 3장, .company/design/초보-견주-온보딩-E.md
// 날짜 계산은 하지 않는다(서버가 준 숫자만 쓴다). 웹 원본. 모바일은 그대로 복사한다.
import { withParticle } from './format';
import { findForbidden } from './historyText';
import type { Companion } from './petApi';

export const COMPANION_TEXT = {
  together: (name: string, n: number) => `${withParticle(name, '와', '과')} 함께한 지 ${n}일째`,
  recording: (n: number) => `기록을 시작한 지 ${n}일째`,
} as const;

/** 1 이상의 정수만 쓸 수 있는 숫자 */
export function isUsableDays(n: unknown): n is number {
  return typeof n === 'number' && Number.isInteger(n) && n >= 1;
}

/**
 * 화면에 그릴 문장 0~2개(함께한 줄 → 기록 줄). 그리는 조건:
 * companion 이 있고 profileType 이 first_time 일 때만. 숫자는 줄마다 1 이상 정수일 때만.
 * recordingDays 는 첫 기록일 기준이라 기록이 없으면 null(기록 줄 없음).
 */
export function companionLines(
  companion: Companion | null | undefined,
  name: string,
  profileType: string | null | undefined,
): string[] {
  if (!companion || profileType !== 'first_time') return [];
  const lines: string[] = [];
  if (name && isUsableDays(companion.togetherDays)) lines.push(COMPANION_TEXT.together(name, companion.togetherDays));
  if (isUsableDays(companion.recordingDays)) lines.push(COMPANION_TEXT.recording(companion.recordingDays));
  return lines;
}

/**
 * 첫 기록 전 환영 카드가 보이는 동안은 기록 줄을 숨긴다(환영 카드 조건 isFirstUse 와 같은 때).
 * recordingDays 만 비우고 함께한 줄은 그대로 둔다.
 */
export function withoutRecordingDays(companion: Companion | null | undefined): Companion | null | undefined {
  return companion ? { ...companion, recordingDays: null } : companion;
}

/** 금지어 검사용: 함수형 문구의 샘플 출력 (숫자·이름 경계 포함) */
export function companionTexts(): string[] {
  const out: string[] = [];
  for (const n of [1, 2, 45, 120, 365, 1234]) {
    for (const name of ['보리', '콩이', '가'.repeat(30)]) out.push(COMPANION_TEXT.together(name, n));
    out.push(COMPANION_TEXT.recording(n));
  }
  return out;
}

// 기획서 3-5 추가어 + 대표님 요청 추가어. `일째`는 허용.
const COMPANION_FORBIDDEN: RegExp[] = [
  /연속/, /달성/, /보상/, /목표/, /놓/, /빠짐/, /끊/, /거르/, /벌써/, /아직/, /축하/, /배지/, /레벨/,
  /포인트/, /마일스톤/, /해야/, /하세요/, /권장/, /오늘도/, /계속/,
  /기록 이어가기/, /이어서/, /이어가/, /유지/, /꾸준/, /성공/, /최고/, /기념/, /D-/, /번째/,
];

export function findCompanionForbidden(text: string): string | null {
  const base = findForbidden(text);
  if (base) return base;
  for (const pattern of COMPANION_FORBIDDEN) {
    const match = text.match(pattern);
    if (match) return match[0];
  }
  return null;
}
