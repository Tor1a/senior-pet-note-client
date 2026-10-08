// 병원 방문 리포트 화면의 경로 (오늘 화면·지난 기록 화면에서 진입: 스택 구조, 하단 탭 없음)
import type { ReportRange } from '../lib/reportStats';

export const REPORT_HREF = '/report';
/** 지난 기록 화면에서 들어올 때: 보던 기간을 이어받고, 돌아오기는 지난 기록으로 */
export const reportFromHistoryHref = (range: ReportRange) => `/report?range=${range}&from=history`;
