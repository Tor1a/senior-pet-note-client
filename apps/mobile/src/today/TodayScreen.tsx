// "오늘" 화면: 상태·API 호출·타이머·AppState (웹 TodayPage 의 로직 부분을 옮김. 표시는 sections/ 가 맡는다)
// - 기록 날짜·제안값·새벽 4시 안내 문구는 서버(GET /today)가 준 값을 그대로 쓴다. 클라이언트는 날짜를 계산하지 않는다.
// - 투약 체크는 탭 즉시 저장(낙관적 업데이트), 일일 기록은 [저장]을 눌러야 확정한다.
// - 모바일에서 더한 것: 앱이 앞으로 돌아왔을 때 재동기(날짜가 바뀌었으면 화면 교체), 당겨서 새로고침(투약만).
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, AppState, findNodeHandle, RefreshControl, ScrollView, StyleSheet, View, useWindowDimensions, type TextInput } from 'react-native';
import { UndoNotice } from '../components/UndoNotice';
import { AppButton, AppText, Card, Screen } from '../components/ui';
import { ApiError, isNetworkError, NETWORK_ERROR_MESSAGE, toUserMessage } from '../lib/api';
import { DISCLAIMER } from '../lib/constants';
import { daysBetween, formatRecordDate, withParticle } from '../lib/format';
import type { DailyLog, TodayResponse } from '../lib/petApi';
import { hasRoutineValue, isRoutineDirty, routineFromLog, undoRoutineNote } from '../lib/routineForm';
import { undoRoutineSentence } from '../lib/routineText';
import { toggleSymptom, toggleSymptomNone } from '../lib/symptoms';
import {
  applyCheckResult,
  applyUncheckResult,
  COLLAPSE_DELAY_MS,
  collapseTaken,
  daysAgoText,
  decidePushHold,
  doseKey,
  headerInfo as buildHeaderInfo,
  HIGHLIGHT_MS,
  holdKeys,
  markTaken,
  markUntaken,
  mergeServerDoses,
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
  buildDailyLogBody,
  initialTodayForm,
  isFormDirty,
  isFirstUse,
  sanitizeMlInput,
  sanitizeWeightInput,
  stepWeight,
  tapLevel,
  validateTodayForm,
  type TodayForm,
} from '../lib/todayForm';
import {
  checkWeightDigits,
  classifyUndoError,
  parseWeight,
  planDailyUndo,
  UNDO_RESULT_MS,
  type DailyUndo,
  type WeightCheck,
} from '../lib/undoLogic';
import { doseUndoFailText, doseUndoneText, UNDO_TEXT } from '../lib/undoText';
import { HISTORY_HREF } from '../history/routes';
import { TodayTodoCard } from '../todos/TodayTodoCard';
import { isLargeFont } from '../medications/layout';
import { REPORT_TEXT } from '../lib/reportText';
import { REPORT_HREF } from '../report/routes';
import { MEDICATIONS_HREF, NEW_MEDICATION_HREF } from '../medications/routes';
import { PetCreatedNotice, PetInfoNotice, PetUpdatedNotice } from '../pet/PetNotices';
import { usePet } from '../pet/PetProvider';
import { editPetHref } from '../pet/routes';
import { usePetNotice } from '../pet/usePetNotice';
import { createdTitle, PET_TEXT, updatedTitle } from '../pet/petText';
import { usePushMessages } from '../push/pushContext';
import { petApi } from '../services/client';
import { readPreferMl, writePreferMl } from '../services/preferences';
import { colors, spacing } from '../theme';
import { DeviceFooter } from './sections/DeviceFooter';
import { DoseSection } from './sections/DoseSection';
import { LevelPicker } from './sections/LevelPicker';
import { MemoSection } from './sections/MemoSection';
import { RoutineSection } from './sections/RoutineSection';
import { SaveBar } from './sections/SaveBar';
import { SymptomSection } from './sections/SymptomSection';
import { TodayHeader } from './sections/TodayHeader';
import { WaterSection } from './sections/WaterSection';
import { WeightConfirm } from './sections/WeightConfirm';
import { WeightSection } from './sections/WeightSection';

/** 일일 기록 저장 직후 안내(저장 되돌리기). 되돌리기 정보는 메모리에만 둔다 */
type DailyNotice =
  | { kind: 'offer' | 'busy' | 'error'; message: string; undo: DailyUndo }
  | { kind: 'result'; message: string; tone: 'ok' | 'info' };

/** 앱이 앞으로 돌아올 때 서버 재확인 최소 간격(과호출 방지) */
export const RESYNC_MIN_INTERVAL_MS = 30_000;
export const DATE_CHANGED_NOTICE = '새 날짜가 되어 화면을 새로 불러왔어요.';

const PET_NOTICE_KINDS = ['petCreated', 'petUpdated', 'petLimit'] as const;

export default function TodayScreen() {
  const { pet, reload: reloadPet } = usePet();
  const petNameRef = useRef('');
  petNameRef.current = pet?.name ?? '';
  const params = useLocalSearchParams<{ source?: string; med?: string; t?: string; d?: string; n?: string }>();
  const router = useRouter();
  const goManage = useCallback(() => router.push(MEDICATIONS_HREF as never), [router]);
  const goHistory = useCallback(() => router.push(HISTORY_HREF as never), [router]);
  const goReport = useCallback(() => router.push(REPORT_HREF as never), [router]);
  const goAddMedication = useCallback(() => router.push(NEW_MEDICATION_HREF as never), [router]);
  const goEditPet = useCallback(() => router.push(editPetHref('today') as never), [router]);
  // 등록·수정 화면이 돌아오며 실어 준 안내(등록 직후 약 등록 카드, 수정 완료, 이미 등록됨)
  const { notice: petNotice, dismiss: dismissPetNotice } = usePetNotice(PET_NOTICE_KINDS, (k) =>
    k === 'petUpdated' ? updatedTitle(petNameRef.current) : k === 'petLimit' ? PET_TEXT.limit : createdTitle(petNameRef.current),
  );

  const [today, setToday] = useState<TodayResponse | null>(null);
  // 헤더의 함께한 날 줄(E단계). 서버 값을 그대로 담는다. 약 관리 등에서 돌아올 때 투약과 함께 다시 맞춘다
  const [companion, setCompanion] = useState<TodayResponse['companion']>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [doses, setDoses] = useState<DoseView[]>([]);
  const [doseMessage, setDoseMessage] = useState<string | null>(null);
  const [form, setForm] = useState<TodayForm | null>(null);
  const [savedLog, setSavedLog] = useState<DailyLog | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  // 산책·배변 기록 칸의 펼침(저장하지 않는다). 불러온 직후 저장된 값이 있을 때만 한 번 펼친다
  const [routineOpen, setRoutineOpen] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const [dailyNotice, setDailyNotice] = useState<DailyNotice | null>(null);
  const [doseNotice, setDoseNotice] = useState<{ message: string; recheckKey: string | null } | null>(null);
  const [focusTarget, setFocusTarget] = useState<{ key: string; to: 'undo' | 'card' } | null>(null);
  const [weightAsk, setWeightAsk] = useState<{ check: WeightCheck; ago: string; tick: number } | null>(null);
  const [confirmedWeight, setConfirmedWeight] = useState<number | null>(null);
  const [reduceMotion, setReduceMotion] = useState(false);
  const { fontScale } = useWindowDimensions();
  const largeFont = isLargeFont(fontScale);
  const weightInputRef = useRef<TextInput | null>(null);
  // 방금 체크한 줄의 두 번째 탭 무시(접히는 동안 더블탭이 되돌리기로 이어지지 않게)
  const guardUntil = useRef<Record<string, number>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [shifting, setShifting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // 10초 지표: 화면을 연 시각부터 저장까지의 탭 수와 시간
  const openedAt = useRef(Date.now());
  const taps = useRef(0);
  const openedSent = useRef(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const lastFetchAt = useRef(Date.now());
  const todayRef = useRef<TodayResponse | null>(null);
  todayRef.current = today;
  // 비동기 작업이 끝난 시점의 최신 입력(되돌리는 중 입력한 내용을 덮지 않기 위해)
  const formRef = useRef<TodayForm | null>(null);
  formRef.current = form;
  const scrollRef = useRef<ScrollView>(null);

  const petId = pet?.id ?? null;

  const later = useCallback((fn: () => void, ms: number) => {
    timers.current.push(setTimeout(fn, ms));
  }, []);

  useEffect(
    () => () => {
      timers.current.forEach((t) => clearTimeout(t));
    },
    [],
  );

  /** 공통 오류 처리: 404 → 반려동물 다시 확인(없으면 안내 화면), 401 은 client 가 로그인 화면으로 보낸다 */
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

  const applyToday = useCallback((t: TodayResponse, preferMl: boolean) => {
    setToday(t);
    setCompanion(t.companion ?? null);
    setDoses(toDoseViews(t.doses));
    setSavedLog(t.dailyLog);
    setForm(initialTodayForm(t, preferMl));
    setRoutineOpen(hasRoutineValue(routineFromLog(t.dailyLog)));
    // 날짜·반려동물이 바뀌면 "그대로 저장" 확인값도 새로 시작한다
    setConfirmedWeight(null);
  }, []);

  const load = useCallback(async () => {
    if (!petId) return;
    setLoadError(null);
    lastFetchAt.current = Date.now();
    try {
      const [t, preferMl] = await Promise.all([petApi.getToday(petId), readPreferMl()]);
      applyToday(t, preferMl);
    } catch (err) {
      if (isPetGone(err)) return;
      if (err instanceof ApiError && err.status === 401) return;
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
    lastFetchAt.current = Date.now();
    const seq = ++syncSeq.current;
    try {
      const t = await petApi.getToday(petId);
      if (seq !== syncSeq.current) return; // 더 새 요청이 있거나 그 사이 체크·취소가 있었음
      setDoses((list) => mergeServerDoses(list, t.doses)); // 응답 대기 중인 회차는 낙관적 상태 유지
      setCompanion(t.companion ?? null); // 반려동물 정보 수정 화면에서 유형을 바꾸고 돌아온 경우 포함
    } catch (err) {
      isPetGone(err);
    }
  }, [petId, isPetGone]);

  useEffect(() => {
    void load();
  }, [load]);

  // 약 관리 화면에서 약을 등록·삭제하고 돌아오면 투약 목록을 서버와 다시 맞춘다(첫 진입은 load 가 읽는다)
  const focusedOnce = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (!focusedOnce.current) {
        focusedOnce.current = true;
        return;
      }
      void syncDoses();
    }, [syncDoses]),
  );

  // 화면을 보고 있을 때 투약 알림이 오면(배너는 PushProvider 가 그린다) 투약 상태를 서버와 다시 맞춘다
  usePushMessages(() => {
    void syncDoses();
  });

  // 앱이 백그라운드에서 앞으로 돌아오면 서버에 한 번 확인한다(30초 이내 반복 안 함, 실패는 조용히 무시).
  // 서버가 준 recordDate 를 화면 값과 "비교"만 한다(날짜 계산 아님).
  useEffect(() => {
    if (!petId) return;
    const sub = AppState.addEventListener('change', (next) => {
      if (next !== 'active' || !todayRef.current) return;
      if (Date.now() - lastFetchAt.current < RESYNC_MIN_INTERVAL_MS) return;
      lastFetchAt.current = Date.now();
      const seq = ++syncSeq.current;
      void (async () => {
        try {
          const t = await petApi.getToday(petId);
          if (seq !== syncSeq.current) return;
          if (t.recordDate === todayRef.current?.recordDate) {
            setDoses((list) => mergeServerDoses(list, t.doses));
            setCompanion(t.companion ?? null);
          } else {
            // 새 날짜: 입력 중이던 값은 버리고 새 응답으로 교체한다(저장해도 서버가 400 으로 거부하므로)
            applyToday(t, await readPreferMl());
            setNotice(DATE_CHANGED_NOTICE);
            setDailyNotice(null);
            setDoseNotice(null);
            setWeightAsk(null);
            setSaveError(null);
            setSaveFailed(false);
            setDoseMessage(null);
          }
        } catch (err) {
          isPetGone(err); // 오프라인 등 그 밖의 실패는 무시
        }
      })();
    });
    return () => sub.remove();
  }, [petId, applyToday, isPetGone]);

  // 알림 탭(?source=push&med=<medicationId>&t=<scheduledTime>&d=<recordDate>): 알림이 가리킨 "그 회차" 카드를 2분간 강조하고 큰 [먹였어요]를 붙인다.
  // 약·시각이 모두 맞는 회차만 고르고, d 가 오늘 응답의 recordDate 와 다르면(어제 알림) 강조하지 않는다. t 가 없는 옛 URL 은 강조만 한다.
  // n 은 알림이 열릴 때마다 바뀌는 값(nonce): 같은 약을 다시 탭해도 강조와 2분 타이머가 다시 시작된다
  const medParam = params.source === 'push' && params.med ? params.med : null;
  const target = useMemo(
    () => pushTargetFromParams(medParam, params.t, params.d),
    [medParam, params.t, params.d],
  );
  const openNonce = params.n ?? null;
  const [highlightExpired, setHighlightExpired] = useState(false);
  useEffect(() => {
    setHighlightExpired(false);
    if (!medParam) return;
    const t = setTimeout(() => setHighlightExpired(true), HIGHLIGHT_MS);
    return () => clearTimeout(t);
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

  /** 강조된 카드로 스크롤하고 VoiceOver/TalkBack 포커스를 옮긴다(웹의 scrollIntoView + focus) */
  const revealCard = useCallback((node: View) => {
    // RN 타입에는 getInnerViewRef 가 아직 없다(런타임에는 있음). 안쪽 내용 뷰 기준으로 카드 위치를 잰다
    const inner = (scrollRef.current as unknown as { getInnerViewRef?: () => unknown } | null)?.getInnerViewRef?.();
    if (inner) {
      node.measureLayout?.(
        inner as never,
        (_x, y) => scrollRef.current?.scrollTo({ y: Math.max(0, y - 120), animated: true }),
        () => {},
      );
    }
    const tag = findNodeHandle(node);
    if (tag) AccessibilityInfo.setAccessibilityFocus(tag);
  }, []);

  // today_opened: 화면을 열 때 한 번. 실패해도 화면에는 영향 없음
  useEffect(() => {
    if (openedSent.current) return;
    openedSent.current = true;
    void petApi.sendEvent('today_opened', { source: params.source === 'push' ? 'push' : 'direct' });
  }, [params.source]);

  useEffect(() => {
    let alive = true;
    void AccessibilityInfo.isReduceMotionEnabled?.()?.then((on) => alive && setReduceMotion(on));
    return () => {
      alive = false;
    };
  }, []);

  // 큰 글씨에서는 저장 성공 안내가 스크롤 맨 위에 생기므로 화면을 맨 위로 올려 보이게 한다(움직임 줄이기면 즉시)
  const offerShown = dailyNotice?.kind === 'offer' || dailyNotice?.kind === 'error';
  useEffect(() => {
    if (largeFont && offerShown) scrollRef.current?.scrollTo?.({ y: 0, animated: !reduceMotion });
  }, [largeFont, offerShown, reduceMotion]);

  /** 체중 확인 카드가 나타나면 그 위치로 스크롤한다 */
  const scrollToNode = useCallback(
    (node: View) => {
      const inner = (scrollRef.current as unknown as { getInnerViewRef?: () => unknown } | null)?.getInnerViewRef?.();
      if (!inner) return;
      node.measureLayout?.(
        inner as never,
        (_x, y) => scrollRef.current?.scrollTo({ y: Math.max(0, y - 120), animated: !reduceMotion }),
        () => {},
      );
    },
    [reduceMotion],
  );

  /** 웹은 DOM 캡처로 탭을 세지만 RN 은 입력 핸들러에서 센다(지표용 근사값) */
  const countTap = () => {
    taps.current += 1;
  };

  async function toggleDose(dose: DoseView) {
    if (dose.pending) return;
    const key = doseKey(dose);
    // 접히는 동안 같은 줄의 두 번째 탭은 무시한다(더블탭이 되돌리기로 이어지지 않게)
    if (dose.taken && Date.now() < (guardUntil.current[key] ?? 0)) return;
    countTap();
    setDoseMessage(null);
    setDoseNotice(null);
    invalidateSync();

    if (!dose.taken) {
      // 낙관적 업데이트: 바로 체크 표시 → 0.3초 뒤 한 줄로 접기
      guardUntil.current[key] = Date.now() + COLLAPSE_DELAY_MS + SHIFT_GUARD_EXTRA_MS;
      setFocusTarget({ key, to: 'undo' });
      setDoses((list) => markTaken(list, key, new Date().toISOString()));
      setShifting(true);
      later(() => setDoses((list) => collapseTaken(list, key)), COLLAPSE_DELAY_MS);
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
        // 실패 → 되돌리고 안내. 줄이 카드로 돌아오므로 접근성 포커스도 카드로(null 로 비우면 포커스를 잃는다)
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
      // 실패하면 줄이 다시 접히므로 접근성 포커스를 [되돌리기] 버튼으로 돌려준다(null 로 비우면 포커스를 잃는다)
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
    setNotice(null);
    try {
      // 저장 직전에 서버의 실제 기록을 받아 "되돌릴 값"으로 삼는다(다른 기기가 그 사이 저장했어도 그 기록을 지우거나 낡은 값으로 덮지 않게).
      // 받지 못하면 화면이 알던 기록(savedLog)을 쓴다. 이때도 되돌릴 때 updatedAt 비교가 다른 곳의 수정을 막아 준다.
      const server = await petApi.getToday(petId).catch(() => null);
      const before = server && server.recordDate === today.recordDate ? server.dailyLog : savedLog;
      const wasFirst = isFirstUse(today) && !savedLog && !before;
      const log = await petApi.saveDailyLog(petId, today.recordDate, buildDailyLogBody(form, routineFromLog(today.dailyLog)));
      // 저장하는 동안 앱 복귀 등으로 화면이 새 날짜로 바뀌었으면 구 날짜 값을 되살리지 않는다
      if (todayRef.current?.recordDate !== today.recordDate) return;
      const next = { ...today, dailyLog: log };
      setToday(next);
      setSavedLog(log);
      setForm(initialTodayForm(next, form.waterMode === 'ml'));
      setDailyNotice({
        kind: 'offer',
        message: wasFirst ? UNDO_TEXT.dailyFirstSaved : before ? UNDO_TEXT.dailyEdited : UNDO_TEXT.dailySaved,
        undo: { before, saved: log },
      });
      void petApi.sendEvent('daily_log_saved', {
        taps: taps.current,
        durationMs: Math.round(Date.now() - openedAt.current),
      });
      taps.current = 0;
      openedAt.current = Date.now();
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
  function refreshFormUnlessEdited(server: TodayResponse, preferMl: boolean) {
    const f = formRef.current;
    const t = todayRef.current;
    if (f && t && isFormDirty(f, initialTodayForm(t))) return;
    setForm(initialTodayForm(server, preferMl));
  }

  /** 저장 되돌리기: 서버의 현재 기록(updatedAt)이 내가 저장한 것과 같을 때만 되돌린다(다른 곳에서 고친 기록을 덮어쓰지 않는다) */
  async function undoDaily() {
    const current0 = dailyNotice;
    // 저장 중에는 되돌리지 않는다(저장 결과가 나온 뒤 새 저장 기준으로 다시 안내한다)
    if (!current0 || (current0.kind !== 'offer' && current0.kind !== 'error') || !petId || saving) return;
    const { undo, message } = current0;
    const preferMl = form?.waterMode === 'ml';
    setDailyNotice({ kind: 'busy', message, undo });
    const finish = (text: string, tone: 'ok' | 'info') => setDailyNotice({ kind: 'result', message: text, tone });
    try {
      lastFetchAt.current = Date.now();
      const current = await petApi.getToday(petId);
      const plan = planDailyUndo(undo, current);
      if (plan.kind === 'conflict') {
        // 서버 값으로 화면을 맞춘다(그 사이 고친 입력이 없으므로 안전)
        setToday(current);
        setSavedLog(current.dailyLog);
        refreshFormUnlessEdited(current, preferMl);
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
      refreshFormUnlessEdited(next, preferMl);
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

  /** [다시 입력]: 값은 지우지 않고 체중 칸으로 포커스를 옮겨 전체 선택한다 */
  function retypeWeight() {
    setWeightAsk(null);
    const len = form?.weight.text.length ?? 0;
    later(() => {
      weightInputRef.current?.focus();
      weightInputRef.current?.setSelection?.(0, len);
    }, 50);
  }

  function keepWeight() {
    const kg = form ? parseWeight(form.weight.text) : null;
    setConfirmedWeight(kg);
    setWeightAsk(null);
    void save(kg);
  }

  /** 입력을 고치는 동작: 저장 되돌리기 안내(폼이 덮이는 사고 방지)와 낡은 체중 확인 카드를 정리한다 */
  function update(patch: Partial<TodayForm>) {
    if (patch.weight && form && (patch.weight.text !== form.weight.text || patch.weight.measured !== form.weight.measured)) {
      setWeightAsk(null);
    }
    setDailyNotice((n) => (n && n.kind !== 'result' && n.kind !== 'busy' ? null : n));
    setForm((f) => (f ? { ...f, ...patch } : f));
  }

  function setWaterMode(mode: 'level' | 'ml') {
    if (!form) return;
    countTap();
    void writePreferMl(mode === 'ml');
    setForm((f) => (f ? { ...f, waterMode: mode } : f)); // 입력 방식만 바꾼 것이라 되돌리기 안내는 그대로 둔다
  }

  // ---------- 화면 ----------
  const name = pet?.name ?? '';
  const firstUse = today ? isFirstUse(today) : false;
  const saveLabel = saving ? '저장하는 중…' : savedLog ? '기록 수정하기' : firstUse ? '첫 기록 저장' : '오늘 기록 저장';

  const dailyNoticeView = dailyNotice && (
    dailyNotice.kind === 'result' ? (
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
    )
  );

  return (
    <Screen
      scrollRef={scrollRef}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            void syncDoses().finally(() => setRefreshing(false));
          }}
        />
      }
      footer={
        <SaveBar
          label={saveLabel}
          notice={largeFont ? null : dailyNoticeView}
          hint={weightAsk ? UNDO_TEXT.weightBarHint : null}
          error={saveError}
          disabled={!form || dailyNotice?.kind === 'busy'}
          saving={saving}
          onSave={() => void save()}
        />
      }
    >
      {petNotice === 'petCreated' ? (
        <PetCreatedNotice
          name={name}
          showMedication={!today || today.doses.length === 0}
          onAddMedication={goAddMedication}
          onDismiss={dismissPetNotice}
        />
      ) : null}
      {petNotice === 'petUpdated' ? <PetUpdatedNotice name={name} onDismiss={dismissPetNotice} /> : null}
      {petNotice === 'petLimit' ? <PetInfoNotice kind="petLimit" onDismiss={dismissPetNotice} /> : null}

      <TodayHeader
        dateText={today ? formatRecordDate(today.recordDate) : '오늘'}
        petName={name}
        info={buildHeaderInfo(pet, today)}
        companion={today ? companion : null}
        profileType={pet?.profileType}
      />

      {largeFont && dailyNoticeView}

      {notice && (
        <AppText accessibilityLiveRegion="polite" style={styles.bold}>
          {notice}
        </AppText>
      )}

      {loadError && (
        <Card>
          <AppText accessibilityRole="alert">{loadError}</AppText>
          <AppButton label="다시 불러오기" variant="secondary" onPress={() => void load()} />
        </Card>
      )}

      {!today && !loadError && (
        <View style={styles.loading} accessibilityLabel="불러오는 중" accessibilityState={{ busy: true }}>
          <ActivityIndicator color={colors.primary} />
          <AppText variant="secondary">불러오는 중…</AppText>
        </View>
      )}

      {today && form && (
        <>
          {firstUse && (
            <Card>
              <AppText style={styles.bold}>{`${withParticle(name, '와', '과')}의 첫 기록을 시작해 볼까요?`}</AppText>
              <AppText variant="secondary">오늘 컨디션만 골라도 충분해요.</AppText>
            </Card>
          )}

          <DoseSection
            doses={doses}
            cutoffNotice={today.cutoffNotice}
            message={doseMessage}
            highlightKey={highlightKey}
            bigKey={bigKey}
            pinnedKey={pinnedKey}
            onToggle={(d) => void toggleDose(d)}
            onHighlight={revealCard}
            onManage={goManage}
            onHistory={goHistory}
            onAdd={goAddMedication}
            notice={doseNotice}
            onRecheck={recheckDose}
            onDismissNotice={() => setDoseNotice(null)}
            focusTarget={focusTarget}
            onFocused={() => setFocusTarget(null)}
          />

          {/* 투약 카드가 접히는 동안 아래 영역 입력을 잠시 막는다 */}
          <View
            style={styles.below}
            pointerEvents={shifting ? 'none' : 'auto'}
            accessibilityState={{ busy: shifting }}
          >
            <LevelPicker
              title="식사"
              field={form.food}
              suggestion={today.suggestions.foodLevel}
              onTap={(v) => {
                countTap();
                update({ food: tapLevel(form.food, v) });
              }}
            />

            <WaterSection
              form={form}
              suggestions={today.suggestions}
              onTapLevel={(v) => {
                countTap();
                update({ water: tapLevel(form.water, v) });
              }}
              onChangeMl={(raw) => {
                const text = sanitizeMlInput(raw);
                update({ waterMl: { text, source: text ? 'confirmed' : 'empty' } });
              }}
              onChangeMode={setWaterMode}
            />

            <SymptomSection
              symptoms={form.symptoms}
              onToggle={(code) => {
                countTap();
                update({ symptoms: toggleSymptom(form.symptoms, code) });
              }}
              onToggleNone={() => {
                countTap();
                update({ symptoms: toggleSymptomNone(form.symptoms) });
              }}
              onChangeOther={(other) => update({ symptoms: { ...form.symptoms, other } })}
            />

            <WeightSection
              weight={form.weight}
              lastWeight={today.lastWeight}
              recordDate={today.recordDate}
              onStep={(delta) => {
                const text = stepWeight(form.weight.text, delta);
                if (text === form.weight.text) return; // 바뀐 게 없으면(예: "." 입력) 측정 체크만 켜지 않는다
                countTap();
                update({ weight: { ...form.weight, text, measured: true } });
              }}
              onChangeText={(raw) => {
                const text = sanitizeWeightInput(raw);
                update({ weight: { ...form.weight, text, measured: text !== '' } });
              }}
              onToggleMeasured={() => {
                countTap();
                update({ weight: { ...form.weight, measured: !form.weight.measured } });
              }}
              inputRef={weightInputRef}
            >
              {weightAsk && (
                <WeightConfirm
                  key={weightAsk.tick}
                  check={weightAsk.check}
                  ago={weightAsk.ago}
                  disabled={saving}
                  onRetype={retypeWeight}
                  onKeep={keepWeight}
                  onShown={scrollToNode}
                />
              )}
            </WeightSection>

            <MemoSection value={form.memo} onChange={(memo) => update({ memo })} />

            <RoutineSection
              routine={form.routine}
              open={routineOpen}
              onToggle={() => setRoutineOpen((v) => !v)}
              onChange={(routine) => {
                setSaveFailed(false); // 실패 뒤 다시 고치면 "저장하지 못했어요"를 걷는다(저장하면 다시 판단)
                update({ routine });
              }}
              dirty={isRoutineDirty(form.routine, routineFromLog(today.dailyLog))}
              saveFailed={saveFailed}
              saving={saving}
            />

            <Card>
              <AppText variant="title" accessibilityRole="header">
                {REPORT_TEXT.entryCardTitle}
              </AppText>
              <AppText>{REPORT_TEXT.entryCardBody}</AppText>
              <AppButton label={REPORT_TEXT.entryCardButton} variant="secondary" onPress={goReport} />
            </Card>

            <TodayTodoCard />

            <AppText variant="caption">{DISCLAIMER}</AppText>
          </View>
        </>
      )}

      <DeviceFooter onManage={goManage} onEditPet={goEditPet} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  bold: { fontWeight: '700' },
  loading: { alignItems: 'center', gap: spacing.sm, padding: spacing.lg },
  below: { gap: spacing.lg },
});
