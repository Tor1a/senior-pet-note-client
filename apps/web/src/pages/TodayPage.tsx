import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { Link, useNavigate, useSearchParams, type LinkProps } from 'react-router-dom';
import ChecklistEntryCard from '../components/ChecklistEntryCard';
import ConfirmCard from '../components/ConfirmCard';
import CompanionLine from '../components/CompanionLine';
import { withoutRecordingDays } from '../lib/companionText';
import PetAvatar from '../components/PetAvatar';
import RoutineSection from '../components/RoutineSection';
import UndoNotice from '../components/UndoNotice';
import WeekReviewCard from '../components/WeekReviewCard';
import { ApiError, isNetworkError, NETWORK_ERROR_MESSAGE, toUserMessage } from '../lib/api';
import { petApi } from '../lib/client';
import { DISCLAIMER, MEMO_MAX_LENGTH } from '../lib/constants';
import { CHECKLIST_TEXT } from '../lib/checklistText';
import { PRIVACY_TEXT } from '../lib/privacyText';
import { HISTORY_TEXT } from '../lib/historyText';
import { bigDoseButtonLabel, PUSH_ACTION_TEXT } from '../lib/pushActionText';
import { REPORT_TEXT } from '../lib/reportText';
import { hasRoutineValue, isRoutineDirty, routineFromLog, undoRoutineNote } from '../lib/routineForm';
import { undoRoutineSentence } from '../lib/routineText';
import { TODO_TEXT } from '../lib/todoText';
import { VISIT_QUESTION_TEXT } from '../lib/visitQuestionText';
import { daysBetween, formatKg, formatRecordDate, LEVEL_LABELS, withParticle } from '../lib/format';
import type { DailyLog, TodayResponse } from '../lib/petApi';
import {
  SYMPTOM_CODES,
  SYMPTOM_LABELS,
  SYMPTOM_NONE_LABEL,
  SYMPTOM_OTHER_MAX_LENGTH,
  toggleSymptom,
  toggleSymptomNone,
} from '../lib/symptoms';
import {
  buildDailyLogBody,
  initialTodayForm,
  isFirstUse,
  isFormDirty,
  sanitizeMlInput,
  sanitizeWeightInput,
  stepWeight,
  tapLevel,
  validateTodayForm,
  type LevelField,
  type TodayForm,
} from '../lib/todayForm';
import {
  applyCheckResult,
  applyUncheckResult,
  COLLAPSE_DELAY_MS,
  collapseTaken,
  daysAgoText,
  decidePushHold,
  doseKey,
  doseLabel,
  doseParts,
  headerInfo as buildHeaderInfo,
  HIGHLIGHT_MS,
  holdKeys,
  markTaken,
  markUntaken,
  mergeServerDoses,
  orderWithPinned,
  pushTargetFromParams,
  restoreDose,
  rollback,
  settleDose,
  SHIFT_GUARD_EXTRA_MS,
  toDoseViews,
  type DoseView,
  type PushHold,
} from '../lib/todayDoses';
import {
  checkWeightDigits,
  classifyUndoError,
  parseWeight,
  planDailyUndo,
  UNDO_ACTION_MS,
  UNDO_RESULT_MS,
  type DailyUndo,
  type WeightCheck,
} from '../lib/undoLogic';
import {
  doseUndoButtonLabel,
  doseUndoFailText,
  doseUndoneText,
  UNDO_TEXT,
  weightCardSpeech,
  weightEnteredText,
  weightLastText,
} from '../lib/undoText';
import { usePet } from '../pet';
import { usePushMessages } from '../push/PushProvider';

// "오늘" 기록 화면 (design/today-wireframe.md 2장, 계약 docs/api-today.md)
// - 기록 날짜·제안값·새벽 4시 안내 문구는 서버(GET /today)가 준 값을 그대로 쓴다.
// - 투약 체크는 탭 즉시 저장(낙관적 업데이트), 일일 기록은 [저장]을 눌러야 확정한다.

const WATER_MODE_KEY = 'spn.waterMode';

function readPreferMl(): boolean {
  try {
    return localStorage.getItem(WATER_MODE_KEY) === 'ml';
  } catch {
    return false;
  }
}

function writePreferMl(ml: boolean) {
  try {
    localStorage.setItem(WATER_MODE_KEY, ml ? 'ml' : 'level');
  } catch {
    // 저장 못 해도 화면 동작에는 영향 없음
  }
}

/** 일일 기록 저장 직후 안내(저장 되돌리기). 되돌리기 정보는 메모리에만 둔다 */
type DailyNotice =
  | { kind: 'offer' | 'busy' | 'error'; message: string; undo: DailyUndo }
  | { kind: 'result'; message: string; tone: 'ok' | 'info' };

/** 투약 되돌린 직후 안내. recheckKey 가 있으면 [다시 체크] 버튼을 보여 준다 */
interface DoseNotice {
  message: string;
  recheckKey: string | null;
}

/** 글자·화면 확대로 하단 저장 막대가 화면을 많이 차지하는 낮은 화면인가(안내를 스크롤 영역 맨 위로 옮긴다) */
function useCompactHeight(): boolean {
  const query = '(max-height: 520px)';
  const get = () => (typeof window.matchMedia === 'function' ? window.matchMedia(query).matches : false);
  const [compact, setCompact] = useState(get);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia(query);
    const on = () => setCompact(mq.matches);
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, []);
  return compact;
}

/** 저장하지 않은 입력이 있으면 앱 안 링크 이동 전에 확인을 거치는 Link (새 탭 열기 같은 보조 클릭은 그대로) */
function GuardLink({
  guard,
  onClick,
  ...props
}: LinkProps & { guard: (to: string, from: HTMLElement) => boolean }) {
  return (
    <Link
      {...props}
      onClick={(e) => {
        onClick?.(e);
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        if (guard(String(props.to), e.currentTarget)) e.preventDefault();
      }}
    />
  );
}

export default function TodayPage() {
  const { pet, reload: reloadPet } = usePet();
  const [params] = useSearchParams();

  const [today, setToday] = useState<TodayResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [doses, setDoses] = useState<DoseView[]>([]);
  const [doseMessage, setDoseMessage] = useState<string | null>(null);
  const [form, setForm] = useState<TodayForm | null>(null);
  const [savedLog, setSavedLog] = useState<DailyLog | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [dailyNotice, setDailyNotice] = useState<DailyNotice | null>(null);
  const [doseNotice, setDoseNotice] = useState<DoseNotice | null>(null);
  const [focusTarget, setFocusTarget] = useState<{ key: string; to: 'undo' | 'card' } | null>(null);
  const [weightAsk, setWeightAsk] = useState<{ check: WeightCheck; ago: string; tick: number } | null>(null);
  const [confirmedWeight, setConfirmedWeight] = useState<number | null>(null);
  const [leaveTo, setLeaveTo] = useState<{ to: string; from: HTMLElement | null } | null>(null);
  const [shifting, setShifting] = useState(false);
  const [memoOpen, setMemoOpen] = useState(false);
  // 산책·배변 기록 칸의 펼침(저장하지 않는다). 불러온 직후 저장된 값이 있을 때만 한 번 펼친다
  const [routineOpen, setRoutineOpen] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const navigate = useNavigate();
  const compact = useCompactHeight();
  const weightInputRef = useRef<HTMLInputElement>(null);
  // 방금 체크한 줄의 두 번째 탭 무시(접히는 동안 더블탭이 되돌리기로 이어지지 않게)
  const guardUntil = useRef<Record<string, number>>({});

  // 10초 지표: 화면을 연 시각부터 저장까지의 탭 수와 시간
  const openedAt = useRef(performance.now());
  const taps = useRef(0);
  const openedSent = useRef(false);
  const timers = useRef<number[]>([]);

  const petId = pet?.id ?? null;

  // 비동기 작업이 끝난 시점의 최신 화면 값(되돌리는 중 입력한 내용을 덮지 않기 위해)
  const formRef = useRef<TodayForm | null>(null);
  formRef.current = form;
  const todayRef = useRef<TodayResponse | null>(null);
  todayRef.current = today;

  const later = useCallback((fn: () => void, ms: number) => {
    const t = window.setTimeout(fn, ms);
    timers.current.push(t);
  }, []);

  useEffect(
    () => () => {
      timers.current.forEach((t) => window.clearTimeout(t));
    },
    [],
  );

  /** 공통 오류 처리: 404 → 반려동물 다시 확인(없으면 등록 화면), 401 은 client 가 로그인 화면으로 보낸다 */
  const isPetGone = useCallback(
    (err: unknown) => {
      if (err instanceof ApiError && err.status === 404) {
        void reloadPet();
        return true;
      }
      return false;
    },
    [reloadPet],
  );

  const applyToday = useCallback((t: TodayResponse) => {
    setToday(t);
    setDoses(toDoseViews(t.doses));
    setSavedLog(t.dailyLog);
    setForm(initialTodayForm(t, readPreferMl()));
    setRoutineOpen(hasRoutineValue(routineFromLog(t.dailyLog)));
    // 날짜·반려동물이 바뀌면 "그대로 저장" 확인값도 새로 시작한다
    setConfirmedWeight(null);
  }, []);

  const load = useCallback(async () => {
    if (!petId) return;
    setLoadError(null);
    try {
      applyToday(await petApi.getToday(petId));
    } catch (err) {
      if (isPetGone(err)) return;
      setLoadError(isNetworkError(err) ? NETWORK_ERROR_MESSAGE : toUserMessage(err));
    }
  }, [petId, applyToday, isPetGone]);

  /** 투약 상태만 서버와 맞춘다(입력 중인 기록은 건드리지 않음) */
  // 응답 순서가 뒤바뀌어도 최신 요청의 응답만 반영한다(요청 시작 시 번호를 올리고, 체크·취소 시작·끝에서도 올려 이전 요청을 무효화).
  const syncSeq = useRef(0);
  const invalidateSync = () => {
    syncSeq.current += 1;
  };
  const syncDoses = useCallback(async () => {
    if (!petId) return;
    const seq = ++syncSeq.current;
    try {
      const t = await petApi.getToday(petId);
      if (seq !== syncSeq.current) return; // 더 새 요청이 있거나 그 사이 체크·취소가 있었음
      setDoses((list) => mergeServerDoses(list, t.doses)); // 응답 대기 중인 회차는 낙관적 상태 유지
    } catch (err) {
      isPetGone(err);
    }
  }, [petId, isPetGone]);

  useEffect(() => {
    void load();
  }, [load]);

  // 화면을 보고 있을 때 투약 알림이 오면(배너는 PushProvider 가 그린다) 투약 상태를 서버와 다시 맞춘다
  usePushMessages(() => {
    void syncDoses();
  });

  // 알림 탭(?source=push&med=<medicationId>&t=<scheduledTime>&d=<recordDate>): 알림이 가리킨 "그 회차" 카드를 2분간 강조하고 큰 [먹였어요]를 붙인다.
  // 약·시각이 모두 맞는 회차만 고르고, d 가 오늘 응답의 recordDate 와 다르면(어제 알림) 강조하지 않는다. t 가 없는 옛 URL 은 강조만 한다.
  // n 은 알림이 열릴 때마다 바뀌는 값(서비스워커가 붙인다): 같은 약을 다시 눌러도 강조와 2분 타이머가 다시 시작된다
  const medParam = params.get('source') === 'push' ? params.get('med') : null;
  const target = useMemo(
    () => pushTargetFromParams(medParam, params.get('t'), params.get('d')),
    [medParam, params],
  );
  const openNonce = params.get('n');
  const [highlightExpired, setHighlightExpired] = useState(false);
  useEffect(() => {
    setHighlightExpired(false);
    if (!medParam) return;
    const t = window.setTimeout(() => setHighlightExpired(true), HIGHLIGHT_MS);
    return () => window.clearTimeout(t);
  }, [medParam, openNonce]);
  // 처음 정한 회차를 저장해 고정한다: 렌더마다 "그 약의 아직 안 먹인 첫 회차"를 다시 고르지 않는다(체크해도 같은 약의 다음 회차로 옮겨 가지 않는다).
  // 처음 그릴 때부터 맞는 순서가 되도록 렌더 중에 고르고 effect 로 저장한다. 알림을 다시 눌러 열면(n 이 바뀌면) 다시 고른다
  const pinSig = target ? `${target.medicationId}#${target.scheduledTime ?? ''}#${target.recordDate ?? ''}#${openNonce ?? ''}` : '';
  const [held, setHeld] = useState<{ sig: string; hold: PushHold } | null>(null);
  const keptHold = held && held.sig === pinSig ? held.hold : null;
  const hold = target ? (keptHold ?? decidePushHold(doses, target, today?.recordDate ?? null)) : null;
  useEffect(() => {
    if (hold && !keptHold) setHeld({ sig: pinSig, hold });
  }, [hold, keptHold, pinSig]);
  const { highlightKey, bigKey } = holdKeys(hold, highlightExpired);
  const pinnedKey = hold?.key ?? null;
  const orderedDoses = useMemo(() => orderWithPinned(doses, pinnedKey), [doses, pinnedKey]);

  // today_opened: 화면을 열 때 한 번. 실패해도 화면에는 영향 없음
  useEffect(() => {
    if (openedSent.current) return;
    openedSent.current = true;
    void petApi.sendEvent('today_opened', { source: params.get('source') === 'push' ? 'push' : 'direct' });
  }, [params]);

  // 저장하지 않은 입력이 있는 채로 새로고침·탭 닫기를 하면 브라우저 기본 경고만 띄운다(문구는 브라우저가 정한다)
  const baseline = useMemo(() => (today ? initialTodayForm(today) : null), [today]);
  const dirty = !!form && !!baseline && isFormDirty(form, baseline);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  /** 앱 안 링크 이동: 바뀐 내용이 있으면 이동을 막고 확인을 띄운다. 막았으면 true */
  const guardLeave = (to: string, from: HTMLElement) => {
    if (!dirty) return false;
    setLeaveTo({ to, from });
    return true;
  };

  /** 입력을 고치는 동작은 이 함수로: 저장 되돌리기 안내(폼이 덮이는 사고 방지)와 낡은 체중 확인 카드를 정리한다 */
  function changeForm(next: TodayForm) {
    if (form && (next.weight.text !== form.weight.text || next.weight.measured !== form.weight.measured)) {
      setWeightAsk(null);
    }
    setDailyNotice((n) => (n && n.kind !== 'result' && n.kind !== 'busy' ? null : n));
    setForm(next);
  }

  // 큰 확대(낮은 화면)에서는 저장 성공 안내가 맨 위에 생기므로 화면을 맨 위로 올려 보이게 한다
  const offerShown = dailyNotice?.kind === 'offer' || dailyNotice?.kind === 'error';
  useEffect(() => {
    if (!compact || !offerShown) return;
    try {
      const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
    } catch {
      // 스크롤을 못 해도 안내는 화면에 있다
    }
  }, [compact, offerShown]);

  function countTap(e: MouseEvent) {
    const el = e.target as HTMLElement;
    if (el.closest('button, [role="checkbox"], [role="radio"]')) taps.current += 1;
  }

  async function toggleDose(dose: DoseView) {
    if (dose.pending) return;
    const key = doseKey(dose);
    // 접히는 동안 같은 줄의 두 번째 탭은 무시한다(더블탭이 되돌리기로 이어지지 않게)
    if (dose.taken && Date.now() < (guardUntil.current[key] ?? 0)) return;
    setDoseMessage(null);
    setDoseNotice(null);
    invalidateSync();

    if (!dose.taken) {
      // 낙관적 업데이트: 바로 체크 표시 → 0.3초 뒤 한 줄로 접기
      guardUntil.current[key] = Date.now() + COLLAPSE_DELAY_MS + SHIFT_GUARD_EXTRA_MS;
      setFocusTarget({ key, to: 'undo' });
      setDoses((list) => markTaken(list, key, new Date().toISOString()));
      setShifting(true);
      later(() => {
        setDoses((list) => collapseTaken(list, key));
      }, COLLAPSE_DELAY_MS);
      later(() => setShifting(false), COLLAPSE_DELAY_MS + SHIFT_GUARD_EXTRA_MS);
      try {
        const log = await petApi.checkMed(dose.medicationId, dose.scheduledTime);
        invalidateSync();
        setDoses((list) => applyCheckResult(list, key, log));
        void petApi.sendEvent('med_checked');
      } catch (err) {
        invalidateSync();
        if (err instanceof ApiError && err.code === 'ALREADY_CHECKED') {
          setFocusTarget({ key, to: 'undo' });
          // 다른 기기에서 이미 체크함 → 체크 상태 유지, 서버 값(medLogId)으로 맞춘다
          setDoses((list) => settleDose(list, key));
          setDoseMessage('이미 체크된 약이라 화면을 맞췄어요.');
          void syncDoses();
          return;
        }
        // 실패 → 되돌리고 안내. 줄이 카드로 돌아오므로 포커스도 카드로(null 로 비우면 body 로 빠진다)
        setFocusTarget({ key, to: 'card' });
        setDoses((list) => rollback(list, key));
        if (err instanceof ApiError && err.status === 404) {
          // 백엔드 규칙: 목록에서 뺀(비활성) 약을 체크하면 404 → 최신 목록으로 맞춘다
          setDoseMessage('목록에서 뺀 약이에요. 약 목록을 새로 불러왔어요.');
          void syncDoses();
          return;
        }
        if (err instanceof ApiError && err.status === 400) {
          setDoseMessage(toUserMessage(err, 'medLog'));
          void syncDoses();
          return;
        }
        if (err instanceof ApiError && err.status === 401) return;
        setDoseMessage(`체크하지 못했어요. ${toUserMessage(err, 'medLog')}`);
      }
      return;
    }

    // 체크 되돌리기(서버에서는 med-log 삭제)
    if (!dose.medLogId) {
      void syncDoses();
      return;
    }
    const before = { ...dose };
    setFocusTarget({ key, to: 'card' });
    setDoses((list) => markUntaken(list, key));
    try {
      await petApi.uncheckMed(dose.medLogId);
      invalidateSync();
      setDoses((list) => applyUncheckResult(list, key));
      setDoseNotice({ message: `${doseUndoneText(dose.name)} ${UNDO_TEXT.doseRecheckHint}`, recheckKey: key });
    } catch (err) {
      invalidateSync();
      if (err instanceof ApiError && err.status === 404) {
        // 이미 되돌려진 기록 → 먼저 대기 상태를 풀고(재동기가 실패해도 잠기지 않게) 서버와 맞춘다
        setDoses((list) => applyUncheckResult(list, key));
        setDoseNotice({ message: UNDO_TEXT.doseAlreadyUndone, recheckKey: null });
        void syncDoses();
        return;
      }
      // 실패하면 줄이 다시 접히므로 포커스를 [되돌리기] 버튼으로 돌려준다(null 로 비우면 body 로 빠진다)
      setFocusTarget({ key, to: 'undo' });
      setDoses((list) => restoreDose(list, key, before));
      if (err instanceof ApiError && err.status === 401) return;
      setDoseMessage(doseUndoFailText(toUserMessage(err, 'medLog')));
    }
  }

  /** 되돌린 직후 안내의 [다시 체크]: 지금 시각으로 다시 기록한다 */
  function recheckDose(key: string) {
    const dose = doses.find((d) => doseKey(d) === key);
    setDoseNotice(null);
    if (dose && !dose.taken) void toggleDose(dose);
  }

  async function save(confirmedKg: number | null = confirmedWeight) {
    if (!form || !today || !petId || saving || dailyNotice?.kind === 'busy') return;
    const problem = validateTodayForm(form);
    setSaveError(problem);
    setSaveFailed(false);
    if (problem) return;
    // 체중 자릿수 확인: 지난 기록의 5배 이상·1/5 이하면 저장 전에 숫자 두 개를 나란히 보여 주고 묻는다
    const check = checkWeightDigits({
      text: form.weight.text,
      measured: form.weight.measured,
      lastKg: today.lastWeight?.weightKg ?? null,
      savedKg: savedLog?.weightKg ?? null,
      confirmedKg,
    });
    if (check.ask && today.lastWeight) {
      const ago = daysAgoText(daysBetween(today.lastWeight.recordDate, today.recordDate));
      setWeightAsk((prev) => ({ check, ago, tick: (prev?.tick ?? 0) + 1 }));
      return;
    }
    setWeightAsk(null);
    setSaving(true);
    try {
      // 저장 직전에 서버의 실제 기록을 받아 "되돌릴 값"으로 삼는다(다른 기기가 그 사이 저장했어도 그 기록을 지우거나 낡은 값으로 덮지 않게).
      // 받지 못하면 화면이 알던 기록(savedLog)을 쓴다. 이때도 되돌릴 때 updatedAt 비교가 다른 곳의 수정을 막아 준다.
      const server = await petApi.getToday(petId).catch(() => null);
      const before = server && server.recordDate === today.recordDate ? server.dailyLog : savedLog;
      const wasFirst = isFirstUse(today) && !savedLog && !before;
      const log = await petApi.saveDailyLog(petId, today.recordDate, buildDailyLogBody(form, routineFromLog(today.dailyLog)));
      const next = { ...today, dailyLog: log };
      setToday(next);
      setSavedLog(log);
      setForm(initialTodayForm(next, form.waterMode === 'ml'));
      if (wasFirst) {
        // 첫 기록이 생겼으니 기록 줄에 쓸 값(첫 기록일 기준)을 서버에서 다시 받는다. 실패해도 다음 불러오기 때 채워진다
        void petApi
          .getToday(petId)
          .then((t) =>
            setToday((prev) => (prev && prev.recordDate === t.recordDate ? { ...prev, companion: t.companion } : prev)),
          )
          .catch(() => {});
      }
      setDailyNotice({
        kind: 'offer',
        message: wasFirst ? UNDO_TEXT.dailyFirstSaved : before ? UNDO_TEXT.dailyEdited : UNDO_TEXT.dailySaved,
        undo: { before, saved: log },
      });
      void petApi.sendEvent('daily_log_saved', {
        taps: taps.current,
        durationMs: Math.round(performance.now() - openedAt.current),
      });
      taps.current = 0;
      openedAt.current = performance.now();
    } catch (err) {
      if (isPetGone(err)) return;
      if (err instanceof ApiError && err.code === 'INVALID_RECORD_DATE') {
        // 새벽 4시가 지나 기록 날짜가 바뀜 → 새 날짜로 다시 불러온다
        setSaveError(toUserMessage(err, 'dailyLog'));
        setSaveFailed(true);
        void load();
        return;
      }
      if (err instanceof ApiError && err.status === 401) return;
      setSaveError(toUserMessage(err, 'dailyLog'));
      setSaveFailed(true);
    } finally {
      setSaving(false);
    }
  }

  /**
   * 되돌리는 동안 보호자가 입력을 시작했으면(바뀐 내용이 있으면) 입력 폼은 그대로 두고 today/savedLog 만 새로 맞춘다.
   * 바뀐 내용이 없을 때만 서버 값으로 폼을 다시 만든다.
   */
  function refreshFormUnlessEdited(server: TodayResponse) {
    const f = formRef.current;
    const t = todayRef.current;
    if (f && t && isFormDirty(f, initialTodayForm(t))) return;
    setForm(initialTodayForm(server, f?.waterMode === 'ml'));
  }

  /** 저장 되돌리기: 서버의 현재 기록(updatedAt)이 내가 저장한 것과 같을 때만 되돌린다(다른 곳에서 고친 기록을 덮어쓰지 않는다) */
  async function undoDaily() {
    const notice = dailyNotice;
    // 저장 중에는 되돌리지 않는다(저장 결과가 나온 뒤 새 저장 기준으로 다시 안내한다)
    if (!notice || (notice.kind !== 'offer' && notice.kind !== 'error') || !petId || saving) return;
    const { undo, message } = notice;
    setDailyNotice({ kind: 'busy', message, undo });
    const finish = (text: string, tone: 'ok' | 'info') => setDailyNotice({ kind: 'result', message: text, tone });
    try {
      const current = await petApi.getToday(petId);
      const plan = planDailyUndo(undo, current);
      if (plan.kind === 'conflict') {
        // 서버 값으로 화면을 맞춘다(그 사이 고친 입력이 없으므로 안전)
        setToday(current);
        setSavedLog(current.dailyLog);
        refreshFormUnlessEdited(current);
        finish(UNDO_TEXT.dailyConflict, 'info');
        return;
      }
      if (plan.kind === 'expired') {
        finish(UNDO_TEXT.dailyExpired, 'info');
        void load();
        return;
      }
      let restored: DailyLog | null = null;
      if (plan.kind === 'put') restored = await petApi.saveDailyLog(petId, plan.recordDate, plan.body);
      else await petApi.deleteDailyLog(petId, plan.recordDate);
      const next = { ...current, dailyLog: restored };
      setToday(next);
      setSavedLog(restored);
      refreshFormUnlessEdited(next);
      // 루틴 값이 저장 전과 달라졌을 때만 결과 안내 뒤에 한 문장을 덧붙인다(그 밖에는 기존 문구 그대로)
      const routineSentence = undoRoutineSentence(undoRoutineNote(undo.before, undo.saved, plan.kind === 'put'));
      const base = plan.kind === 'put' ? UNDO_TEXT.dailyRestored : UNDO_TEXT.dailyRemoved;
      finish(routineSentence ? `${base} ${routineSentence}` : base, 'ok');
    } catch (err) {
      const kind = classifyUndoError(err);
      if (kind === 'auth') return;
      if (kind === 'gone') {
        setDailyNotice(null);
        isPetGone(err);
        return;
      }
      if (kind === 'expired') {
        finish(UNDO_TEXT.dailyExpired, 'info');
        void load();
        return;
      }
      setDailyNotice({
        kind: 'error',
        message: kind === 'network' ? UNDO_TEXT.dailyFailNetwork : UNDO_TEXT.dailyFailServer,
        undo,
      });
    }
  }

  function retypeWeight() {
    setWeightAsk(null);
    const input = weightInputRef.current;
    input?.focus();
    input?.select();
  }

  function keepWeight() {
    const kg = form ? parseWeight(form.weight.text) : null;
    setConfirmedWeight(kg);
    setWeightAsk(null);
    void save(kg);
  }

  function setWaterMode(mode: 'level' | 'ml') {
    if (!form) return;
    writePreferMl(mode === 'ml');
    setForm({ ...form, waterMode: mode });
  }

  /** [계속 적기]: 대화상자를 닫고 이동을 시작한 링크로 포커스를 돌려준다 */
  function closeLeave() {
    const from = leaveTo?.from;
    setLeaveTo(null);
    window.setTimeout(() => from?.focus(), 0);
  }

  // ---------- 화면 ----------
  const name = pet?.name ?? '';
  const headerInfo = buildHeaderInfo(pet, today);
  const takenCount = doses.filter((d) => d.taken).length;
  const firstUse = today ? isFirstUse(today) : false;
  const saveLabel = saving ? '저장하는 중…' : savedLog ? '기록 수정하기' : firstUse ? '첫 기록 저장' : '오늘 기록 저장';

  const dailyNoticeView = dailyNotice && (
    <div className={compact ? 'undo-top' : undefined}>
      {dailyNotice.kind === 'result' ? (
        <UndoNotice
          key={dailyNotice.message}
          message={dailyNotice.message}
          tone={dailyNotice.tone === 'ok' ? 'ok' : 'error'}
          autoDismissMs={UNDO_RESULT_MS}
          onDismiss={() => setDailyNotice((n) => (n?.kind === 'result' ? null : n))}
        />
      ) : (
        <UndoNotice
          message={dailyNotice.message}
          tone={dailyNotice.kind === 'error' ? 'error' : 'ok'}
          actionLabel={dailyNotice.kind === 'error' ? UNDO_TEXT.dailyRetry : UNDO_TEXT.dailyUndoButton}
          busy={dailyNotice.kind === 'busy'}
          disabled={saving}
          disabledNote={UNDO_TEXT.dailyUndoWhileSaving}
          busyLabel={UNDO_TEXT.dailyUndoBusy}
          onAction={() => void undoDaily()}
          closeLabel={UNDO_TEXT.close}
          onClose={dailyNotice.kind === 'busy' ? undefined : () => setDailyNotice(null)}
        />
      )}
    </div>
  );

  return (
    <>
    <div className="today" onClickCapture={countTap} inert={leaveTo ? true : undefined}>
      <header className="today-header">
        <div className="row-between">
          <h1 className="today-date">{today ? formatRecordDate(today.recordDate) : '오늘'}</h1>
          <nav className="top-links" aria-label="바로가기">
            <GuardLink guard={guardLeave} to="/history" className="btn-link menu-link">
              지난 기록
            </GuardLink>
            <GuardLink guard={guardLeave} to="/pet" className="btn-link menu-link" aria-label="메뉴: 프로필과 약 관리">
              ≡ 메뉴
            </GuardLink>
          </nav>
        </div>
        <div className="pet-line">
          <PetAvatar pet={pet} size={40} />
          <span>{headerInfo}</span>
        </div>
        <CompanionLine
          companion={firstUse ? withoutRecordingDays(today?.companion) : today?.companion}
          name={pet?.name ?? ''}
          profileType={pet?.profileType}
        />
      </header>

      <main className="page today-main">
        {loadError && (
          <div role="alert" className="error">
            <p>{loadError}</p>
            <button type="button" className="btn-secondary" onClick={() => void load()}>
              다시 불러오기
            </button>
          </div>
        )}

        {!today && !loadError && (
          <p className="muted" aria-busy="true">
            불러오는 중…
          </p>
        )}

        {today && form && (
          <>
            {compact && dailyNoticeView}
            {firstUse && (
              <section className="welcome">
                <p className="welcome-title">{withParticle(name, '와', '과')}의 첫 기록을 시작해 볼까요?</p>
                <p className="muted">오늘 컨디션만 골라도 충분해요.</p>
              </section>
            )}

            {/* 투약 */}
            <section className="section" aria-labelledby="dose-title">
              <div className="row-between">
                <h2 id="dose-title">
                  오늘 먹일 약
                  {doses.length > 0 && (
                    <span className="count">
                      {' '}
                      {takenCount} / {doses.length}
                    </span>
                  )}
                </h2>
                {doses.length > 0 && (
                  <GuardLink guard={guardLeave} to="/medications" className="btn-link">
                    약 관리
                  </GuardLink>
                )}
              </div>
              <p className="notice">{today.cutoffNotice}</p>

              {doses.length === 0 ? (
                <div className="card med-empty">
                  <p className="strong">💊 먹이는 약이 있나요?</p>
                  <p className="muted">등록하면 오늘 화면에서 한 번에 체크할 수 있어요.</p>
                  <GuardLink guard={guardLeave} to="/medications" className="btn-secondary link-button">
                    약 등록하기
                  </GuardLink>
                </div>
              ) : (
                <>
                  {takenCount === doses.length && (
                    <p className="all-done">
                      <span aria-hidden="true">▣ </span>오늘 약 {doses.length}개 모두 먹였어요
                    </p>
                  )}
                  <ul className="dose-list">
                    {orderedDoses.map((d) => (
                      <li key={doseKey(d)}>
                        <DoseItem
                          dose={d}
                          highlight={doseKey(d) === highlightKey && !d.taken}
                          bigButton={doseKey(d) === bigKey}
                          onToggle={() => void toggleDose(d)}
                          focusWanted={focusTarget?.key === doseKey(d) ? focusTarget.to : null}
                          onFocused={() => setFocusTarget(null)}
                        />
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {doseMessage && (
                <p role="alert" className="error">
                  {doseMessage}
                </p>
              )}
              {doseNotice && (
                <div className="dose-notice">
                  <UndoNotice
                    key={doseNotice.message}
                    message={doseNotice.message}
                    actionLabel={doseNotice.recheckKey ? UNDO_TEXT.doseRecheckButton : undefined}
                    onAction={() => doseNotice.recheckKey && recheckDose(doseNotice.recheckKey)}
                    onClose={doseNotice.recheckKey ? () => setDoseNotice(null) : undefined}
                    closeLabel={UNDO_TEXT.close}
                    autoDismissMs={doseNotice.recheckKey ? UNDO_ACTION_MS : UNDO_RESULT_MS}
                    onDismiss={() => setDoseNotice(null)}
                  />
                </div>
              )}
            </section>

            {/* 투약 카드가 접히는 동안 아래 영역 입력을 잠시 막는다 */}
            <div className={shifting ? 'below-doses shifting' : 'below-doses'} aria-busy={shifting || undefined}>
              <section className="section" aria-labelledby="food-title">
                <LevelPicker
                  id="food"
                  title="식사"
                  field={form.food}
                  suggestion={today.suggestions.foodLevel}
                  onTap={(v) => changeForm({ ...form, food: tapLevel(form.food, v) })}
                />
              </section>

              <section className="section" aria-labelledby="water-title">
                {form.waterMode === 'level' ? (
                  <LevelPicker
                    id="water"
                    title="물"
                    field={form.water}
                    suggestion={today.suggestions.waterLevel}
                    onTap={(v) => changeForm({ ...form, water: tapLevel(form.water, v) })}
                  />
                ) : (
                  <>
                    <div className="row-between">
                      <h2 id="water-title">물</h2>
                      {today.suggestions.waterMl != null && (
                        <span className="muted small">최근 평균: {today.suggestions.waterMl}ml</span>
                      )}
                    </div>
                    <div className="unit-input">
                      <input
                        id="water-ml"
                        inputMode="numeric"
                        aria-label="물 마신 양 (ml)"
                        className={form.waterMl.source === 'suggested' ? 'is-suggested' : ''}
                        value={form.waterMl.text}
                        placeholder="예: 300"
                        onChange={(e) =>
                          changeForm({
                            ...form,
                            waterMl: {
                              text: sanitizeMlInput(e.target.value),
                              source: sanitizeMlInput(e.target.value) ? 'confirmed' : 'empty',
                            },
                          })
                        }
                      />
                      <span>ml</span>
                      {form.waterMl.source === 'suggested' && <span className="tag-suggested">최근 평균</span>}
                    </div>
                  </>
                )}
                <button
                  type="button"
                  className="btn-link align-end"
                  onClick={() => setWaterMode(form.waterMode === 'level' ? 'ml' : 'level')}
                >
                  {form.waterMode === 'level' ? 'ml로 적기 ›' : '조금/보통/많이로 고르기 ›'}
                </button>
              </section>

              <section className="section" aria-labelledby="symptom-title">
                <h2 id="symptom-title">
                  오늘 보인 증상 <span className="muted small">(여러 개 선택 가능)</span>
                </h2>
                <div className="tags">
                  {SYMPTOM_CODES.map((code) => {
                    const on = form.symptoms.codes.includes(code);
                    return (
                      <button
                        key={code}
                        type="button"
                        aria-pressed={on}
                        className={`tag ${on ? 'is-confirmed' : ''}`}
                        onClick={() => changeForm({ ...form, symptoms: toggleSymptom(form.symptoms, code) })}
                      >
                        {on && <span aria-hidden="true">✓ </span>}
                        {code === 'other' && !on ? '+ ' : ''}
                        {SYMPTOM_LABELS[code]}
                      </button>
                    );
                  })}
                </div>
                {form.symptoms.codes.includes('other') && (
                  <input
                    aria-label="기타 증상 내용"
                    maxLength={SYMPTOM_OTHER_MAX_LENGTH}
                    placeholder={`기타 내용 (${SYMPTOM_OTHER_MAX_LENGTH}자까지)`}
                    value={form.symptoms.other}
                    onChange={(e) => changeForm({ ...form, symptoms: { ...form.symptoms, other: e.target.value } })}
                  />
                )}
                <button
                  type="button"
                  aria-pressed={form.symptoms.none}
                  className={`tag tag-none ${form.symptoms.none ? 'is-confirmed' : ''}`}
                  onClick={() => changeForm({ ...form, symptoms: toggleSymptomNone(form.symptoms) })}
                >
                  {form.symptoms.none && <span aria-hidden="true">✓ </span>}
                  {SYMPTOM_NONE_LABEL}
                </button>
              </section>

              <section className="section" aria-labelledby="weight-title">
                <div className="row-between">
                  <h2 id="weight-title">체중 (선택)</h2>
                  {today.lastWeight && (
                    <span className="muted small">
                      지난 기록 {formatKg(today.lastWeight.weightKg)}kg (
                      {daysAgoText(daysBetween(today.lastWeight.recordDate, today.recordDate))})
                    </span>
                  )}
                </div>
                <div className="stepper">
                  <button
                    type="button"
                    aria-label="0.1kg 빼기"
                    disabled={!form.weight.text}
                    onClick={() => {
                      const text = stepWeight(form.weight.text, -0.1);
                      if (text !== form.weight.text) changeForm({ ...form, weight: { ...form.weight, text, measured: true } });
                    }}
                  >
                    −
                  </button>
                  <div className="unit-input">
                    <input
                      ref={weightInputRef}
                      inputMode="decimal"
                      aria-label="체중 (kg)"
                      className={!form.weight.measured && form.weight.suggested ? 'is-suggested' : form.weight.measured ? 'is-measured' : ''}
                      value={form.weight.text}
                      placeholder="-.-"
                      onChange={(e) => {
                        const text = sanitizeWeightInput(e.target.value);
                        changeForm({ ...form, weight: { ...form.weight, text, measured: text !== '' } });
                      }}
                    />
                    <span>kg</span>
                  </div>
                  <button
                    type="button"
                    aria-label="0.1kg 더하기"
                    disabled={!form.weight.text}
                    onClick={() => {
                      const text = stepWeight(form.weight.text, 0.1);
                      if (text !== form.weight.text) changeForm({ ...form, weight: { ...form.weight, text, measured: true } });
                    }}
                  >
                    +
                  </button>
                </div>
                {!form.weight.measured && form.weight.suggested && (
                  <p className="center">
                    <span className="tag-suggested">최근 평균</span>
                  </p>
                )}
                <button
                  type="button"
                  aria-pressed={form.weight.measured}
                  disabled={!form.weight.text}
                  className={`choice measured-btn ${form.weight.measured ? 'is-confirmed' : ''}`}
                  onClick={() => changeForm({ ...form, weight: { ...form.weight, measured: !form.weight.measured } })}
                >
                  {form.weight.measured ? '✓ 오늘 쟀어요' : '오늘 쟀어요'}
                </button>
                {!form.weight.measured && (
                  <p className="muted small">
                    {form.weight.text
                      ? '[오늘 쟀어요]를 누르거나 숫자를 바꾸면 오늘 체중으로 저장돼요.'
                      : '체중을 적으면 오늘 체중으로 저장돼요.'}
                  </p>
                )}
                {weightAsk && today.lastWeight && (
                  <ConfirmCard
                    key={weightAsk.tick}
                    title={UNDO_TEXT.weightTitle}
                    speech={weightCardSpeech(weightAsk.check.last, weightAsk.check.entered)}
                    primaryLabel={UNDO_TEXT.weightRetype}
                    onPrimary={retypeWeight}
                    secondaryLabel={UNDO_TEXT.weightKeep}
                    onSecondary={keepWeight}
                    disabled={saving}
                    scrollIntoView
                  >
                    <dl className="confirm-facts">
                      <dt>{UNDO_TEXT.weightLastLabel}</dt>
                      <dd>{weightLastText(weightAsk.check.last, weightAsk.ago)}</dd>
                      <dt>{UNDO_TEXT.weightEnteredLabel}</dt>
                      <dd>{weightEnteredText(weightAsk.check.entered)}</dd>
                    </dl>
                    <p className="confirm-text">{UNDO_TEXT.weightBody1}</p>
                    <p className="confirm-text">{UNDO_TEXT.weightBody2}</p>
                  </ConfirmCard>
                )}
              </section>

              <section className="section" aria-labelledby="memo-title">
                <h2 id="memo-title">
                  <label htmlFor="memo">메모 (선택)</label>
                </h2>
                <textarea
                  id="memo"
                  rows={memoOpen || form.memo ? 3 : 1}
                  maxLength={MEMO_MAX_LENGTH}
                  placeholder="오늘 있었던 일을 짧게 남겨 두세요"
                  aria-describedby="memo-help"
                  value={form.memo}
                  onFocus={() => setMemoOpen(true)}
                  onChange={(e) => changeForm({ ...form, memo: e.target.value })}
                />
                <p id="memo-help" className="muted">
                  {PRIVACY_TEXT.memoHelp}
                </p>
                <p className="muted small align-end">
                  {form.memo.length} / {MEMO_MAX_LENGTH}
                </p>
              </section>

              <RoutineSection
                routine={form.routine}
                open={routineOpen}
                onToggle={() => setRoutineOpen((v) => !v)}
                onChange={(routine) => {
                  setSaveFailed(false); // 실패 뒤 다시 고치면 "저장하지 못했어요"를 걷는다(저장하면 다시 판단)
                  changeForm({ ...form, routine });
                }}
                dirty={!!baseline && isRoutineDirty(form.routine, baseline.routine)}
                saveFailed={saveFailed}
                saving={saving}
              />

              {pet && !firstUse && <WeekReviewCard key={pet.id} petId={pet.id} onNotFound={() => void reloadPet()} />}

              <GuardLink guard={guardLeave} to="/history" className="history-link-row">
                <span>{HISTORY_TEXT.entryLink}</span>
              </GuardLink>

              <section className="card" aria-labelledby="report-entry-title">
                <h2 id="report-entry-title">{REPORT_TEXT.entryCardTitle}</h2>
                <p>{REPORT_TEXT.entryCardBody}</p>
                <GuardLink guard={guardLeave} to="/report" className="btn-secondary link-button">
                  {REPORT_TEXT.entryCardButton}
                </GuardLink>
              </section>

              <GuardLink guard={guardLeave} to="/account" className="history-link-row">
                <span>계정 · 로그아웃</span>
              </GuardLink>

              <section className="card" aria-labelledby="todo-entry-title">
                <h2 id="todo-entry-title">{TODO_TEXT.entryTitle}</h2>
                <p>{TODO_TEXT.entryBody}</p>
                <GuardLink guard={guardLeave} to="/todos" className="btn-secondary link-button">
                  {TODO_TEXT.entryButton}
                </GuardLink>
              </section>

              <GuardLink guard={guardLeave} to="/visit-questions" className="history-link-row">
                <span>{VISIT_QUESTION_TEXT.title}</span>
                <span aria-hidden="true">›</span>
              </GuardLink>

              <ChecklistEntryCard profileType={pet?.profileType}>
                <GuardLink
                  guard={guardLeave}
                  to="/checklist"
                  className="btn-secondary link-button"
                  aria-label={CHECKLIST_TEXT.entryButtonLabel}
                >
                  {CHECKLIST_TEXT.entryButton}
                </GuardLink>
              </ChecklistEntryCard>

              <p className="disclaimer">{DISCLAIMER}</p>
            </div>
          </>
        )}
      </main>

      <div className="save-bar">
        {!compact && dailyNoticeView}
        {weightAsk && (
          <p className="bar-hint" aria-hidden="true">
            ⓘ {UNDO_TEXT.weightBarHint}
          </p>
        )}
        {saveError && (
          <p role="alert" className="error">
            {saveError}
          </p>
        )}
        <button type="button" className="btn-primary save-btn" disabled={!form || saving || dailyNotice?.kind === 'busy'} onClick={() => void save()}>
          {saveLabel}
        </button>
      </div>
    </div>
    {leaveTo && (
      <div className="dialog-backdrop">
        <div className="dialog leave-dialog">
          <ConfirmCard
            role="alertdialog"
            title={UNDO_TEXT.leaveTitle}
            primaryLabel={UNDO_TEXT.leaveStay}
            onPrimary={closeLeave}
            secondaryLabel={UNDO_TEXT.leaveGo}
            onSecondary={() => {
              const to = leaveTo.to;
              setLeaveTo(null);
              navigate(to);
            }}
            onEscape={closeLeave}
          >
            <p className="confirm-text">{UNDO_TEXT.leaveBody}</p>
          </ConfirmCard>
        </div>
      </div>
    )}
    </>
  );
}

function DoseItem({
  dose,
  highlight,
  bigButton,
  onToggle,
  focusWanted,
  onFocused,
}: {
  dose: DoseView;
  highlight: boolean;
  /** 알림이 가리킨 회차에 큰 [먹였어요]를 붙일지(체크하면 카드가 접히며 함께 사라진다) */
  bigButton: boolean;
  onToggle: () => void;
  /** 체크·되돌리기로 줄 모양이 바뀐 뒤 포커스를 어디로 둘지(키보드 사용자가 포커스를 잃지 않게) */
  focusWanted: 'undo' | 'card' | null;
  onFocused: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const undoRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!highlight || !ref.current) return;
    ref.current.scrollIntoView?.({ block: 'center' });
    ref.current.focus({ preventScroll: true });
  }, [highlight]);

  const collapsed = dose.taken && dose.collapsed;
  const mode = collapsed ? 'undo' : 'card';
  useEffect(() => {
    if (!focusWanted || focusWanted !== mode) return;
    (mode === 'undo' ? undoRef.current : ref.current)?.focus({ preventScroll: true });
    onFocused();
  }, [focusWanted, mode, onFocused]);

  const { what, time, takenText } = doseParts(dose);
  const label = doseLabel(dose);

  if (collapsed) {
    // 접힌 줄은 줄 전체가 아니라 [되돌리기] 버튼만 반응한다(스크롤하다 건드려도 체크가 풀리지 않게)
    return (
      <div className="dose dose-collapsed">
        <span className="check is-on" aria-hidden="true">
          ✓
        </span>
        <span className="dose-line">
          {time} {what} · {takenText}
        </span>
        <button
          type="button"
          ref={undoRef}
          className="dose-action"
          aria-label={doseUndoButtonLabel(what, time)}
          aria-disabled={dose.pending || undefined}
          onClick={onToggle}
        >
          {UNDO_TEXT.doseUndoButton}
        </button>
      </div>
    );
  }

  return (
    <>
      {highlight && <p className="dose-flag">{PUSH_ACTION_TEXT.highlightFlag}</p>}
      <div
        ref={ref}
        role="checkbox"
        aria-checked={dose.taken}
        aria-label={label}
        aria-disabled={dose.pending || undefined}
        tabIndex={0}
        className={`dose dose-card ${dose.taken ? 'is-taken' : ''} ${highlight ? 'is-highlight' : ''}`}
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === ' ' || e.key === 'Enter') {
            e.preventDefault();
            onToggle();
          }
        }}
      >
        <span className={`check ${dose.taken ? 'is-on' : ''}`} aria-hidden="true">
          {dose.taken ? '✓' : ''}
        </span>
        <span className="dose-body">
          <span className="dose-time">{time}</span>
          <span className="dose-name">{what}</span>
        </span>
        <span className="dose-action">{dose.taken ? takenText : PUSH_ACTION_TEXT.actionLabel}</span>
      </div>
      {/* 알림이 가리킨 회차: 카드 아래에 폭 전체의 큰 [먹였어요]를 바로 보여 준다(알림-바로-체크 설계 6-2).
          체크한 직후(접히기 전 0.3초)에도 그대로 두어 포커스가 body 로 떨어지지 않게 하고, 줄이 접히면 함께 사라진다(→ 포커스는 [되돌리기]로).
          2분 강조가 끝나도 남겨 둔다: 손가락 밑에서 카드 높이가 바뀌지 않게 */}
      {bigButton && (
        <button
          type="button"
          className="btn-primary dose-big-button"
          aria-label={bigDoseButtonLabel(what, time)}
          aria-disabled={dose.pending || dose.taken || undefined}
          onClick={dose.taken ? undefined : onToggle}
        >
          {PUSH_ACTION_TEXT.actionLabel}
        </button>
      )}
    </>
  );
}

/** 조금/보통/많이 3단 선택. 제안값은 점선 + "최근 평균", 확정 값은 채움 + ✓ */
function LevelPicker({
  id,
  title,
  field,
  suggestion,
  onTap,
}: {
  id: string;
  title: string;
  field: LevelField;
  suggestion: number | null;
  onTap: (v: number) => void;
}) {
  return (
    <>
      <div className="row-between">
        <h2 id={`${id}-title`}>{title}</h2>
        {suggestion != null && <span className="muted small">최근 평균: {LEVEL_LABELS[suggestion]}</span>}
      </div>
      <div className="levels" role="radiogroup" aria-labelledby={`${id}-title`}>
        {[1, 2, 3].map((v) => {
          const selected = field.value === v;
          const suggested = selected && field.source === 'suggested';
          const confirmed = selected && field.source === 'confirmed';
          return (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={suggested ? `${LEVEL_LABELS[v]}, 최근 평균 제안값, 아직 확인 안 함` : LEVEL_LABELS[v]}
              className={`choice ${suggested ? 'is-suggested' : ''} ${confirmed ? 'is-confirmed' : ''}`}
              onClick={() => onTap(v)}
            >
              <span>
                {confirmed && <span aria-hidden="true">✓ </span>}
                {LEVEL_LABELS[v]}
              </span>
              {suggested && <span className="tag-suggested">최근 평균</span>}
            </button>
          );
        })}
      </div>
    </>
  );
}
