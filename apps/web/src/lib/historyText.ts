// 지난 기록 화면 문구와 문장 조립 (사실만 말한다: 값·날짜·횟수. 평가·권유·의료 표현 없음)
// 근거: .company/plans/지난-기록-보기.md 5-1·9장, .company/design/지난-기록-보기.md 13장
// 금지 표현 검사는 findForbidden() 으로 테스트와 화면 테스트가 함께 쓴다.
import { formatKg, formatMonthDay, formatRecordDate, LEVEL_LABELS } from './format';
import {
  medicationTotals,
  recordedDayCount,
  symptomNoneCount,
  weightFact,
  type LevelCounts,
} from './historyStats';
import type { DailyLog, HistoryDay } from './petApi';
import { SYMPTOM_LABELS, SYMPTOM_NONE_LABEL } from './symptoms';

export const HISTORY_TEXT = {
  title: '지난 기록',
  backToToday: '← 오늘로',
  backToHistory: '← 지난 기록',
  entryLink: '지난 기록 보기 ›',
  rangeGroup: '보여 줄 기간',
  range7: '7일',
  range30: '30일',
  loading: '불러오는 중…',
  retry: '다시 불러오기',
  refresh: '새로 불러오기',
  loadFailed: '지난 기록을 불러오지 못했어요. 잠시 뒤에 다시 해 주세요.',
  invalidDay: '이 날짜는 볼 수 없어요.',
  invalidDayLink: '찾을 수 없는 날짜예요.',
  weightTitle: '체중',
  mealWaterTitle: '식사 · 물',
  symptomTitle: '증상을 적은 날',
  medicationTitle: '투약 체크',
  dayListTitle: '날짜별 기록',
  scaleNote: '눈금은 이 기간 값에 맞춰져 있어요.',
  showTable: '표로 보기',
  showGraph: '그래프로 보기',
  legendSolid: '━ 이어서 적은 날',
  legendDashed: '╌ 측정하지 않은 날이 있어요',
  weightNone: '체중을 적으면 여기에 그래프가 그려져요.',
  weightOne: '한 번 더 적으면 선이 이어져요.',
  fewRecords: '기록이 쌓이면 흐름을 더 볼 수 있어요.',
  noRecord: '기록 없음',
  notWritten: '적지 않았어요',
  todayTag: '오늘 · 기록 중',
  emptyTitle: '이 기간에는 기록이 없어요.',
  emptyBody: '오늘부터 하나씩 적어 보세요.',
  goToday: '오늘 기록하러 가기',
  medicationBasis: '현재 등록된 약 기준이에요',
  symptomNoneInPeriod: '이 기간에 증상을 적은 날이 없어요.',
  dayReadOnly: '읽기만 할 수 있어요',
  dayEmpty: '이 날은 기록이 없어요.',
  dayToday: '아직 기록 중인 날이에요.',
  dayGoToday: '오늘 화면에서 기록하기',
  prevDay: '← 전날',
  nextDay: '다음 날 →',
  tableCaption: '날짜별 체중과 증상',
  keyHint: '← → 키로 체중 기록을 옮겨 볼 수 있어요.',
  offlineStale: '지금은 연결이 끊겨 있어요.',
} as const;

/** 화면 문구에 쓰면 안 되는 표현
 * (검사 대상은 앱이 만든 문구 상수·조립 함수 출력뿐이다. 서버·사용자 입력 텍스트
 * (메모, 증상 '기타' 내용 등)는 findForbidden 에 넘기지 않는다: "이상해 보임" 같은 입력은 오탐이 된다) (의료적 판단·평가·증감 서술·퍼센트) */
const FORBIDDEN: RegExp[] = [
  /이상/,
  /위험/,
  /진단/,
  /정상/,
  /경고/,
  /주의/,
  /악화/,
  /호전/,
  /좋아/,
  /나빠/,
  /늘었/,
  /줄었/,
  /증가/,
  /감소/,
  /준수/,
  /순응/,
  /퍼센트/,
  /%/,
];

/** 금지 표현이 들어 있으면 그 표현을, 없으면 null */
export function findForbidden(text: string): string | null {
  for (const pattern of FORBIDDEN) {
    const match = text.match(pattern);
    if (match) return match[0];
  }
  return null;
}

/** "10월 2일 ~ 10월 8일 · 기록한 날 4일 / 7일" */
export function rangeSummary(days: HistoryDay[]): string {
  if (days.length === 0) return '';
  const span = `${formatMonthDay(days[0].recordDate)} ~ ${formatMonthDay(days[days.length - 1].recordDate)}`;
  return `${span} · 기록한 날 ${recordedDayCount(days)}일 / ${days.length}일`;
}

/** 체중 사실 문장들 (1줄 또는 2줄). 비교는 값이 있을 때만 */
export function weightFactLines(days: HistoryDay[], context: HistoryDay[] = days): string[] {
  const fact = weightFact(days, context);
  const lines = [`이 기간 체중 기록 ${fact.count}번`];
  if (fact.last && fact.previousAverage !== null && fact.difference !== null && fact.compare) {
    const base = `마지막 체중 ${formatKg(fact.last.weightKg)}kg (${formatMonthDay(fact.last.recordDate)})`;
    const avg = `직전 7일 평균 ${formatKg(fact.previousAverage)}kg`;
    const tail =
      fact.compare === 'same'
        ? `${avg}과 같아요`
        : `${avg}보다 ${formatKg(fact.difference)}kg ${fact.compare === 'less' ? '적어요' : '많아요'}`;
    lines.push(`${base} · ${tail}`);
  }
  return lines;
}

/** 그래프 텍스트 대체 (스크린리더용): 사실만 서술 */
export function chartDescription(days: HistoryDay[]): string {
  const fact = weightFact(days);
  const head = `지난 ${days.length}일 체중 기록 ${fact.count}번.`;
  if (!fact.first || !fact.last) return head;
  if (fact.count === 1) return `${head} ${formatKg(fact.first.weightKg)}kg(${formatMonthDay(fact.first.recordDate)})`;
  return `${head} 첫 기록 ${formatKg(fact.first.weightKg)}kg(${formatMonthDay(fact.first.recordDate)}), 마지막 기록 ${formatKg(fact.last.weightKg)}kg(${formatMonthDay(fact.last.recordDate)})`;
}

/** "조금 2일 · 보통 20일 · 많이 3일 · 안 적은 날 5일" */
export function levelCountsText(counts: LevelCounts): string {
  return [
    `${LEVEL_LABELS[1]} ${counts[1]}일`,
    `${LEVEL_LABELS[2]} ${counts[2]}일`,
    `${LEVEL_LABELS[3]} ${counts[3]}일`,
    `안 적은 날 ${counts.none}일`,
  ].join(' · ');
}

/** "ml로 적은 날 평균 310ml (4일)" */
export function waterMlText(avg: { average: number; count: number }): string {
  return `ml로 적은 날 평균 ${avg.average}ml (${avg.count}일)`;
}

/** 증상 이름들: "구토, 기타(절뚝)" */
export function symptomNames(codes: string[], other: string | null): string {
  return codes
    .map((code) => {
      const label = SYMPTOM_LABELS[code as keyof typeof SYMPTOM_LABELS] ?? code;
      return code === 'other' && other ? `${label}(${other})` : label;
    })
    .join(', ');
}

/** "특이사항 없음으로 적은 날 3일" (0이면 null) */
export function symptomNoneText(days: HistoryDay[]): string | null {
  const n = symptomNoneCount(days);
  return n > 0 ? `${SYMPTOM_NONE_LABEL}으로 적은 날 ${n}일` : null;
}

/** "먹임 체크 18회 / 예정 21회" — 퍼센트 없음 */
export function medicationText(totals: { scheduled: number; taken: number }): string {
  return `먹임 체크 ${totals.taken}회 / 예정 ${totals.scheduled}회`;
}

export function medicationSummary(days: HistoryDay[]): string {
  return medicationText(medicationTotals(days));
}

/** 날짜 줄의 요약. 메모는 넣지 않는다. 기록이 없으면 투약 체크만(있을 때) */
export function dayRowSummary(day: HistoryDay): string {
  const log = day.dailyLog;
  const med = day.medication;
  const medPart = med.scheduledCount > 0 ? `투약 ${med.takenCount}/${med.scheduledCount}` : null;
  if (!log) {
    return medPart && med.takenCount > 0 ? `${HISTORY_TEXT.noRecord} · ${medPart}` : HISTORY_TEXT.noRecord;
  }
  const parts: string[] = [];
  if (log.weightKg !== null) parts.push(`체중 ${formatKg(log.weightKg)}kg`);
  if (log.foodLevel !== null) parts.push(`식사 ${LEVEL_LABELS[log.foodLevel]}`);
  if (log.waterMl !== null) parts.push(`물 ${log.waterMl}ml`);
  else if (log.waterLevel !== null) parts.push(`물 ${LEVEL_LABELS[log.waterLevel]}`);
  if (log.symptoms.length > 0) parts.push(`◆ 증상 ${log.symptoms.length}개`);
  if (medPart) parts.push(medPart);
  return parts.length > 0 ? parts.join(' · ') : HISTORY_TEXT.noRecord;
}

/** 하루 상세의 항목 값 (안 적은 항목은 "적지 않았어요") */
export function dayDetailValues(log: DailyLog | null) {
  const none = HISTORY_TEXT.notWritten;
  if (!log) return null;
  const symptom =
    log.symptoms.length > 0
      ? `◆ ${symptomNames(log.symptoms, log.symptomOther)}`
      : log.symptomsNone
        ? SYMPTOM_NONE_LABEL
        : '증상 칸을 적지 않았어요';
  return {
    weight: log.weightKg !== null ? `${formatKg(log.weightKg)}kg` : none,
    food: log.foodLevel !== null ? LEVEL_LABELS[log.foodLevel] : none,
    water: log.waterMl !== null ? `${log.waterMl}ml` : log.waterLevel !== null ? LEVEL_LABELS[log.waterLevel] : none,
    symptom,
  };
}

/** 선택한 체중 기록 한 줄: "10월 7일 (화) · 4.1kg" */
export function selectedWeightText(recordDate: string, kg: number): string {
  return `${formatRecordDate(recordDate)} · ${formatKg(kg)}kg`;
}

/** 마지막으로 불러온 시각 안내 (모바일 오프라인 표기). time 은 이미 '오후 3:20' 형태 */
export function staleNotice(time: string): string {
  return `마지막으로 불러온 시각: ${time} · ${HISTORY_TEXT.offlineStale}`;
}
