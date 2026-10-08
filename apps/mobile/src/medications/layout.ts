// 큰 글씨 배치 기준 (설계 10-2). 글자는 줄이지 않고 배치만 바꾼다.
import { LARGE_FONT_SCALE } from '../components/ui';

/** 기기 글자 배율이 이 값 이상이면 버튼을 세로로 쌓는다(1.3) */
export const isLargeFont = (fontScale: number) => fontScale >= LARGE_FONT_SCALE;

/** 이 값 이상이면 저장 결과·오류 줄을 하단 고정 영역이 아니라 스크롤 맨 위로 옮긴다(1.8) */
export const HUGE_FONT_SCALE = 1.8;
export const isHugeFont = (fontScale: number) => fontScale >= HUGE_FONT_SCALE;

/** 요일 격자 열 수: 4 → 3(1.3~) → 2(1.8~) */
export function dayGridColumns(fontScale: number): 4 | 3 | 2 {
  if (isHugeFont(fontScale)) return 2;
  return isLargeFont(fontScale) ? 3 : 4;
}
