// [공유 로직 사본] 원본: web/src/lib/reportText.ts (2026-10-08 복사)
// web/src/lib 과 동기화 필요. 추후 packages/shared 로 통합 예정 (mobile/README.md 참고).
// 이 파일만 고치지 말고 웹 원본과 함께 수정하세요.
// 병원 방문 리포트 문구와 문장 조립, 공유용 텍스트 (사실만 말한다: 값·날짜·횟수. 평가·권유·의료 표현 없음)
// 근거: .company/plans/병원-방문-리포트.md 2-3·6장, .company/design/병원-방문-리포트.md 5·8·13장
// 금지 표현 검사는 findReportForbidden() 으로 테스트와 화면 테스트가 함께 쓴다.
// 기록 날짜·기간은 서버가 준 값만 쓴다 (기기 시계로 "오늘"·나이를 만들지 않는다).
import { DISCLAIMER } from './constants';
import { formatKg, formatMonthDay, formatRecordDate, formatTime } from './format';
import {
  levelCounts,
  medicationTotals,
  recordedDayCount,
  symptomDays,
  waterMlAverage,
  weightPoints,
} from './historyStats';
import {
  chartDescription,
  findForbidden,
  levelCountsText,
  medicationText,
  symptomNames,
  symptomNoneText,
  waterMlText,
} from './historyText';
import type { HistoryDay, Medication, Pet } from './petApi';
import { emptyDates, limitItems, memoDays, weightExtremes, type ReportRange } from './reportStats';

export const REPORT_TEXT = {
  title: '병원 방문 리포트',
  subtitle: '수의사에게 보여 드릴 요약이에요',
  printTitle: '병원 방문 요약 리포트',
  source: '보호자가 앱에 직접 적은 기록이에요.',
  appName: '시니어펫 노트',
  backToToday: '← 오늘로',
  backToHistory: '← 지난 기록으로',
  entryCardTitle: '병원 방문 리포트',
  entryCardBody: '진료 때 보여 드릴 한 장 요약이에요.',
  entryCardButton: '리포트 보기',
  historyLink: '병원 방문 리포트 만들기 ›',
  rangeGroup: '보여 줄 기간',
  glanceTitle: '한눈에 보기',
  petTitle: '반려동물',
  weightTitle: '체중',
  mealWaterTitle: '식사 · 물',
  symptomTitle: '증상을 적은 날',
  medicationTitle: '투약 체크',
  medicationListTitle: '현재 등록된 약',
  memoTitle: '메모 (적은 그대로)',
  emptyDatesTitle: '기록 없는 날',
  fewRecords: '적힌 기록만 담았어요.',
  weightNone: '이 기간에는 체중을 적은 날이 없어요.',
  axisNote: '세로축은 0kg부터 시작하지 않아요.',
  legend: '● 체중 기록  ━ 이어서 적은 날  ╌ 기록 없는 날 건너뜀',
  tableDate: '날짜',
  tableWeight: '체중',
  tableSymptom: '증상',
  noRecord: '기록 없음',
  symptomNone: '이 기간에는 증상을 적은 날이 없어요.',
  medicationBasis: '현재 등록된 약 기준이에요.',
  medicationReason: '기간 중에 약을 바꿨어도 지금 등록된 약으로 계산한 횟수예요.',
  medicationCaution: '체크하지 않은 날도 약을 먹였을 수 있어요.',
  noMedication: '이 기간에는 등록된 약이 없어요.',
  noSchedule: '이 기간에는 예정된 투약이 없어요.',
  medicationListFailed: '약 목록을 불러오지 못했어요.',
  medicationListOmitted: '약 목록은 이 쪽에 담지 않았어요.',
  conditionsLabel: '보호자가 적은 질환',
  medicationListLoading: '약 목록을 불러오는 중이에요.',
  memoSwitch: '메모 포함',
  memoSwitchHintWeb: '끄면 종이에도 메모가 나오지 않아요.',
  memoSwitchHintApp: '끄면 공유 내용에 메모가 담기지 않아요.',
  memoNone: '이 기간에는 메모가 없어요.',
  memoExcluded: '메모는 담지 않았어요.',
  print: '인쇄하기',
  printHint: '종이로 뽑거나, 인쇄 창에서 "PDF로 저장"을 골라 파일로 저장할 수 있어요.',
  printHint2: '인쇄 창이 열리지 않으면 브라우저 메뉴에서 인쇄를 골라 주세요.',
  printPrivacy: 'PDF로 저장하면 이 기기에 파일이 남아요. 공용 컴퓨터에서는 저장하지 마세요.',
  printDisabledLoading: '불러온 뒤에 할 수 있어요.',
  printDisabledMedications: '약 목록을 불러오는 중이에요. 불러온 뒤에 할 수 있어요.',
  shareDisabledMedications: '약 목록을 불러오는 중이에요. 불러온 뒤에 할 수 있어요.',
  printDisabledEmpty: '기록이 없어서 만들 수 없어요.',
  share: '공유하기',
  shareHint: '문자나 메신저로 보낼 수 있어요.',
  shareConfirmTitle: '공유 전에 확인해 주세요',
  shareConfirmBody: '건강 기록이 선택한 앱으로 전달돼요.',
  shareConfirmBody2: '받는 분과 앱을 확인하고 보내 주세요.',
  shareContents: '담기는 내용',
  sharePreview: '미리 보기',
  sharePreviewClose: '미리 보기 닫기',
  shareOpen: '공유 시트 열기',
  shareCancel: '취소',
  shareOpened: '공유 시트를 열었어요.',
  shareFailed: '공유하지 못했어요. 다시 해 주세요.',
  loading: '불러오는 중…',
  retry: '다시 불러오기',
  loadFailed: '리포트를 불러오지 못했어요. 잠시 뒤에 다시 해 주세요.',
  stale: '지금은 연결이 끊겨 있어요. 이미 불러온 내용을 보여 주고 있어요.',
  emptyTitle: '이 기간에는 남긴 기록이 없어요.',
  emptyBody: '기록이 쌓이면 여기에 요약해 드려요.',
  goToday: '오늘 기록하러 가기',
  toToday: '오늘 화면으로',
  webOnlyShare: '공유는 앱에서 할 수 있어요.',
  textHead: '[병원 방문 요약]',
  textFoot: '(시니어펫 노트)',
} as const;

/**
 * 앱이 만든 문구에 쓰면 안 되는 표현을 더한 목록. 기존 findForbidden 의 목록에 이어 붙여 쓴다.
 * 사용자 입력(메모, 반려동물 이름, 약 이름·용량, 증상 '기타' 내용, 질환 입력)은 검사하지 않는다.
 */
export const REPORT_FORBIDDEN: RegExp[] = [/상의/, /권/, /병원에 가/, /진료받/, /필요해/, /의심/, /심각/, /이상 없/];

/** 금지 표현이 들어 있으면 그 표현을, 없으면 null (historyText.findForbidden + 리포트 추가 목록) */
export function findReportForbidden(text: string): string | null {
  const base = findForbidden(text);
  if (base) return base;
  for (const pattern of REPORT_FORBIDDEN) {
    const match = text.match(pattern);
    if (match) return match[0];
  }
  return null;
}

const SPECIES_LABELS = { dog: '강아지', cat: '고양이' } as const;

export type MedicationsState = { status: 'loading' } | { status: 'error' } | { status: 'ready'; items: Medication[] };

export interface ReportInput {
  pet: Pick<Pet, 'name' | 'species' | 'birthYear' | 'conditions'>;
  /** 서버의 현재 기록 날짜 (history.recordDate). 기준일로 쓴다 */
  recordDate: string;
  /** 이미 7/14/30 으로 자른 days (오름차순) */
  days: HistoryDay[];
  medications: MedicationsState;
  includeMemo: boolean;
  /** 나머지 건수 문구: 'app'(앱 화면, 기본) | 'paper'(종이에 찍히는 문서) */
  restWording?: 'app' | 'paper';
}

export interface ReportWeightRow {
  recordDate: string;
  dateLabel: string;
  weight: string;
  symptom: string;
}

export interface ReportModel {
  printTitle: string;
  petName: string;
  /** "강아지" */
  speciesLabel: string;
  /** "2014년생" (출생연도가 없으면 null) */
  birthLabel: string | null;
  /** "초코 · 강아지 · 2014년생" (화면용. 공유 텍스트는 위 필드로 따로 조립한다) */
  petLine: string;
  /** "보호자가 적은 질환: …" (입력이 있을 때만. 입력 부분은 그대로) */
  conditionsLine: string | null;
  /** "10월 2일 ~ 10월 15일 (14일)" */
  periodLine: string;
  baseDateLine: string;
  /** 한눈에 보기 문장들 */
  glance: string[];
  recorded: number;
  total: number;
  weight: {
    lines: string[];
    count: number;
    description: string;
    /** 최신 날짜가 위 */
    rows: ReportWeightRow[];
  };
  mealWater: { food: string; water: string; waterMl: string | null };
  symptoms: {
    countLine: string;
    items: { dateLabel: string; names: string }[];
    rest: string | null;
    none: string | null;
    empty: string | null;
  };
  /** lines: 횟수(있을 때) + 항상 붙는 기준 고지 3문장 */
  medication: { lines: string[]; empty: string | null };
  medicationList: { status: MedicationsState['status']; items: { name: string; times: string }[]; message: string | null };
  memos: { included: boolean; items: { dateLabel: string; memo: string }[]; rest: string | null; message: string | null };
  emptyDays: { title: string; dates: string } | null;
  disclaimer: string;
}

/** 나머지 건수 문구: "나머지 3건은 앱에서 볼 수 있어요." */
export function restText(n: number): string {
  return `나머지 ${n}건은 앱에서 볼 수 있어요.`;
}

/** 종이·공유 텍스트용 사실 문구 (받는 사람은 앱을 열 수 없다) */
export function restTextPaper(n: number): string {
  return `나머지 ${n}건은 이 쪽에 담지 않았어요.`;
}

/** 사용자 입력의 줄바꿈 뒤 줄을 들여써서 앱이 만든 구역("■ …", "※ …")처럼 보이지 않게 한다 */
export function indentUserText(text: string): string {
  return text.replace(/\r\n|\r|\n/g, '\n  > ');
}

const TITLE_NAME_MAX = 20;

/** "14일 보기로 바꿨어요. 14일 중 11일 기록했어요." (스크린리더용) */
export function rangeChangedNotice(range: ReportRange, days: HistoryDay[]): string {
  return `${range}일 보기로 바꿨어요. ${days.length}일 중 ${recordedDayCount(days)}일 기록했어요.`;
}

/** "10월 2일 ~ 10월 15일 (14일)" — 기간이 비어 있으면 빈 문자열 */
export function periodText(days: HistoryDay[]): string {
  if (days.length === 0) return '';
  return `${formatMonthDay(days[0].recordDate)} ~ ${formatMonthDay(days[days.length - 1].recordDate)} (${days.length}일)`;
}

/** 인쇄 PDF 파일명의 기본값이 되는 문서 제목: "초코 진료용 기록 요약 10월 8일" */
export function documentTitle(petName: string, recordDate: string): string {
  const chars = Array.from(petName.replace(/\s+/g, ' ').trim());
  const name = chars.length > TITLE_NAME_MAX ? `${chars.slice(0, TITLE_NAME_MAX).join('')}…` : chars.join('');
  return `${name} 진료용 기록 요약 ${formatMonthDay(recordDate)}`;
}

export function buildReport(input: ReportInput): ReportModel {
  const { pet, days, medications } = input;
  const rest = input.restWording === 'paper' ? restTextPaper : restText;
  const recorded = recordedDayCount(days);
  const total = days.length;
  const gaps = emptyDates(days);

  const glance = [`${total}일 중 ${recorded}일 기록했어요.`];
  if (gaps.length > 0) glance.push(`기록 없는 날은 ${gaps.length}일이에요.`);
  if (recorded >= 1 && recorded <= 2) glance.push(REPORT_TEXT.fewRecords);

  // 체중
  const ex = weightExtremes(days);
  const point = (p: { weightKg: number; recordDate: string }) => `${formatKg(p.weightKg)}kg (${formatMonthDay(p.recordDate)})`;
  const weightLines: string[] = [];
  if (ex.count === 0 || !ex.first || !ex.last || !ex.min || !ex.max) {
    weightLines.push(REPORT_TEXT.weightNone);
  } else if (ex.count === 1) {
    weightLines.push(`체중은 하루 적었어요. ${formatMonthDay(ex.first.recordDate)} ${formatKg(ex.first.weightKg)}kg이에요.`);
  } else {
    weightLines.push(`체중을 적은 날 ${ex.count}일`);
    weightLines.push(`첫 기록 ${point(ex.first)} · 마지막 기록 ${point(ex.last)}`);
    weightLines.push(`가장 낮은 기록 ${point(ex.min)} · 가장 높은 기록 ${point(ex.max)}`);
  }
  const rows: ReportWeightRow[] = [...days].reverse().map((d) => ({
    recordDate: d.recordDate,
    dateLabel: formatRecordDate(d.recordDate),
    weight: d.dailyLog?.weightKg != null ? `${formatKg(d.dailyLog.weightKg)}kg` : REPORT_TEXT.noRecord,
    symptom:
      d.dailyLog && d.dailyLog.symptoms.length > 0 ? `◆ ${symptomNames(d.dailyLog.symptoms, d.dailyLog.symptomOther)}` : '–',
  }));

  // 식사·물
  const ml = waterMlAverage(days);

  // 증상
  const sDays = symptomDays(days);
  const sLimited = limitItems(sDays);

  // 투약
  const totals = medicationTotals(days);
  const hasList = medications.status === 'ready' && medications.items.some((m) => m.active);
  const medLines: string[] = [];
  let medEmpty: string | null = null;
  if (totals.scheduled > 0) medLines.push(medicationText(totals));
  else if (medications.status === 'ready' && !hasList) medEmpty = REPORT_TEXT.noMedication;
  else medEmpty = REPORT_TEXT.noSchedule;
  // 기준 고지는 약이 없을 때도 항상 붙는다 (읽는 사람이 예정 횟수를 과거 처방 이력으로 오해하지 않게)
  medLines.push(REPORT_TEXT.medicationBasis, REPORT_TEXT.medicationReason, REPORT_TEXT.medicationCaution);

  const activeMeds = medications.status === 'ready' ? medications.items.filter((m) => m.active) : [];
  const medicationList: ReportModel['medicationList'] = {
    status: medications.status,
    items: activeMeds.map((m) => ({
      name: m.doseText ? `${m.name} · ${m.doseText}` : m.name,
      times: `매일 ${m.times.map(formatTime).join(', ')}`,
    })),
    message:
      medications.status === 'error'
        ? input.restWording === 'paper'
          ? REPORT_TEXT.medicationListOmitted
          : REPORT_TEXT.medicationListFailed
        : medications.status === 'loading'
          ? REPORT_TEXT.medicationListLoading
          : activeMeds.length === 0
            ? REPORT_TEXT.noMedication
            : null,
  };

  // 메모
  const mLimited = limitItems(memoDays(days));
  const memos: ReportModel['memos'] = input.includeMemo
    ? {
        included: true,
        items: mLimited.shown.map((m) => ({ dateLabel: formatRecordDate(m.recordDate), memo: m.memo })),
        rest: mLimited.rest > 0 ? rest(mLimited.rest) : null,
        message: mLimited.shown.length === 0 ? REPORT_TEXT.memoNone : null,
      }
    : { included: false, items: [], rest: null, message: REPORT_TEXT.memoExcluded };

  const species = SPECIES_LABELS[pet.species];
  const birth = pet.birthYear !== null && pet.birthYear !== undefined ? `${pet.birthYear}년생` : null;

  return {
    printTitle: REPORT_TEXT.printTitle,
    petName: pet.name,
    speciesLabel: species,
    birthLabel: birth,
    petLine: [pet.name, species, birth].filter(Boolean).join(' · '),
    conditionsLine: pet.conditions && pet.conditions.trim() ? `${REPORT_TEXT.conditionsLabel}: ${pet.conditions}` : null,
    periodLine: periodText(days),
    baseDateLine: `기록 기준일: ${formatMonthDay(input.recordDate)}`,
    glance,
    recorded,
    total,
    weight: { lines: weightLines, count: ex.count, description: chartDescription(days), rows },
    mealWater: {
      food: `식사: ${levelCountsText(levelCounts(days, 'foodLevel'))}`,
      water: `물: ${levelCountsText(levelCounts(days, 'waterLevel'))}`,
      waterMl: ml ? waterMlText(ml) : null,
    },
    symptoms: {
      countLine: `${sDays.length}일`,
      items: sLimited.shown.map((s) => ({
        dateLabel: formatRecordDate(s.recordDate),
        names: symptomNames(s.codes, s.other),
      })),
      rest: sLimited.rest > 0 ? rest(sLimited.rest) : null,
      none: symptomNoneText(days),
      empty: sDays.length === 0 ? REPORT_TEXT.symptomNone : null,
    },
    medication: { lines: medLines, empty: medEmpty },
    medicationList,
    memos,
    emptyDays:
      gaps.length > 0
        ? { title: `${REPORT_TEXT.emptyDatesTitle} ${gaps.length}일`, dates: gaps.map(formatMonthDay).join(', ') }
        : null,
    disclaimer: DISCLAIMER,
  };
}

/** 그래프가 없는 곳(공유 텍스트)에서 쓰는 체중 값 목록: "10/2 5.3 · 10/3 5.3" (적은 날만, 오름차순) */
export function weightValueList(days: HistoryDay[]): string {
  return weightPoints(days)
    .map((p) => {
      const [, m, d] = p.recordDate.split('-').map(Number);
      return `${m}/${d} ${formatKg(p.weightKg)}`;
    })
    .join(' · ');
}

/** 공유 확인 카드의 "담기는 내용" 목록 */
export function shareContents(model: ReportModel, medicationCount: number): string[] {
  const items = [model.petLine, `${model.periodLine} 체중`, '식사·물, 증상을 적은 날, 투약 체크'];
  if (model.medicationList.status === 'ready') items.push(`현재 등록된 약 ${medicationCount}개`);
  items.push(model.memos.included ? `메모 ${memoCount(model)}건` : REPORT_TEXT.memoExcluded);
  return items;
}

function restCount(text: string): number {
  return Number(text.replace(/\D/g, ''));
}

function memoCount(model: ReportModel): number {
  const rest = model.memos.rest ? restCount(model.memos.rest) : 0;
  return model.memos.items.length + rest;
}

/** 시스템 공유 시트로 보내는 텍스트 (이모지 없음, 면책·약 기준 고지 포함, 메모는 includeMemo 를 따른다) */
export function toPlainText(model: ReportModel, days: HistoryDay[]): string {
  const out: string[] = [];
  const petExtra = [model.speciesLabel, model.birthLabel].filter(Boolean).join(', ');
  out.push(`${REPORT_TEXT.textHead} ${indentUserText(model.petName)} (${petExtra})`);
  if (model.conditionsLine) out.push(indentUserText(model.conditionsLine));
  out.push(`기간: ${model.periodLine}, ${model.glance[0]}`);
  out.push(model.baseDateLine);
  out.push(REPORT_TEXT.source);

  out.push('', `■ ${REPORT_TEXT.weightTitle}`, ...model.weight.lines);
  const values = weightValueList(days);
  if (values && model.weight.count > 1) out.push(values);

  out.push('', `■ ${REPORT_TEXT.mealWaterTitle}`, model.mealWater.food, model.mealWater.water);
  if (model.mealWater.waterMl) out.push(model.mealWater.waterMl);

  out.push('', `■ ${REPORT_TEXT.symptomTitle} (${model.symptoms.countLine})`);
  if (model.symptoms.empty) out.push(model.symptoms.empty);
  for (const s of model.symptoms.items) out.push(`${s.dateLabel} ${indentUserText(s.names)}`);
  if (model.symptoms.rest) out.push(restTextPaper(restCount(model.symptoms.rest)));
  if (model.symptoms.none) out.push(model.symptoms.none);

  out.push('', `■ ${REPORT_TEXT.medicationTitle}`);
  if (model.medication.empty) out.push(model.medication.empty);
  out.push(...model.medication.lines);
  if (model.medicationList.items.length > 0) {
    out.push(
      `${REPORT_TEXT.medicationListTitle}: ${model.medicationList.items.map((m) => `${indentUserText(m.name)} (${m.times})`).join(' / ')}`,
    );
  } else if (model.medicationList.message) {
    // 받는 사람에게 "불러오지 못했어요" 대신 사실 문구를 보낸다
    out.push(model.medicationList.status === 'error' ? REPORT_TEXT.medicationListOmitted : model.medicationList.message);
  }

  if (model.memos.included) {
    out.push('', `■ ${REPORT_TEXT.memoTitle}`);
    if (model.memos.message) out.push(model.memos.message);
    for (const m of model.memos.items) out.push(`${m.dateLabel} ${indentUserText(m.memo)}`);
    if (model.memos.rest) out.push(restTextPaper(restCount(model.memos.rest)));
  } else {
    out.push('', REPORT_TEXT.memoExcluded);
  }

  out.push('');
  if (model.emptyDays) out.push(`${model.emptyDays.title}: ${model.emptyDays.dates}`);
  out.push(`※ ${model.disclaimer}`, REPORT_TEXT.textFoot);
  return out.join('\n');
}
