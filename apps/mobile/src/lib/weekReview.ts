// [공유 로직 사본] 원본: web/src/lib/weekReview.ts (2026-10-15 복사)
// web/src/lib 과 동기화 필요. 추후 packages/shared 로 통합 예정 (mobile/README.md 참고).
// 이 파일만 고치지 말고 웹 원본과 함께 수정하세요.
// 오늘 화면 "최근 7일 돌아보기" 카드의 순수 집계 (서버가 준 days 의 마지막 7개를 세기만 한다)
// 근거: .company/plans/이번-주-돌아보기-카드.md 3·5·9장. 웹 원본, 모바일은 그대로 복사한다. 지난 기록 7일 보기와 같은 함수·같은 자르기를 쓴다.
// 오늘/기간 끝은 서버 recordDate 가 정한다. 기기 시계로 날짜를 만들거나 계산하지 않는다.
import { lastNDays, medicationTotals, recordedDayCount, weightPoints } from './historyStats';
import type { HistoryDay } from './petApi';

export const WEEK_REVIEW_DAYS = 7;

export interface WeekReviewWeight {
  /** 7일 안의 체중 기록 수 (1 이상) */
  count: number;
  first: { weightKg: number; recordDate: string };
  /** 기록이 1번이면 first 와 같은 값 */
  last: { weightKg: number; recordDate: string };
}

export interface WeekReviewFacts {
  kind: 'facts';
  firstDate: string;
  lastDate: string;
  /** 기록한 날 수 / 받은 날 수(보통 7) */
  recorded: number;
  total: number;
  /** 체중 기록이 없으면 null */
  weight: WeekReviewWeight | null;
  /** 예정 횟수가 0 이면 null (줄·고지 숨김) */
  medication: { taken: number; scheduled: number } | null;
}

export interface WeekReviewEmpty {
  kind: 'empty';
  firstDate: string;
  lastDate: string;
}

/** days 가 비어 있으면(서버는 항상 채워 주므로 사실상 없음) null */
export type WeekReviewView = WeekReviewFacts | WeekReviewEmpty | null;

/** 서버가 준 days(오름차순) 로 카드 내용을 만든다. 기록한 날 0일이면 empty */
export function weekReviewView(days: HistoryDay[]): WeekReviewView {
  const last7 = lastNDays(days, WEEK_REVIEW_DAYS);
  if (last7.length === 0) return null;
  const firstDate = last7[0].recordDate;
  const lastDate = last7[last7.length - 1].recordDate;
  const recorded = recordedDayCount(last7);
  if (recorded === 0) return { kind: 'empty', firstDate, lastDate };

  const points = weightPoints(last7);
  const weight: WeekReviewWeight | null =
    points.length === 0
      ? null
      : {
          count: points.length,
          first: { weightKg: points[0].weightKg, recordDate: points[0].recordDate },
          last: {
            weightKg: points[points.length - 1].weightKg,
            recordDate: points[points.length - 1].recordDate,
          },
        };
  const totals = medicationTotals(last7);
  return {
    kind: 'facts',
    firstDate,
    lastDate,
    recorded,
    total: last7.length,
    weight,
    medication: totals.scheduled > 0 ? { taken: totals.taken, scheduled: totals.scheduled } : null,
  };
}
