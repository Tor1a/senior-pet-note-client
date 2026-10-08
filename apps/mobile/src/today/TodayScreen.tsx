// "오늘" 화면: 상태·API 호출·타이머·AppState (웹 TodayPage 의 로직 부분을 옮김. 표시는 sections/ 가 맡는다)
// - 기록 날짜·제안값·새벽 4시 안내 문구는 서버(GET /today)가 준 값을 그대로 쓴다. 클라이언트는 날짜를 계산하지 않는다.
// - 투약 체크는 탭 즉시 저장(낙관적 업데이트), 일일 기록은 [저장]을 눌러야 확정한다.
// - 모바일에서 더한 것: 앱이 앞으로 돌아왔을 때 재동기(날짜가 바뀌었으면 화면 교체), 당겨서 새로고침(투약만).
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, AppState, findNodeHandle, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { AppButton, AppText, Card, Screen } from '../components/ui';
import { ApiError, isNetworkError, NETWORK_ERROR_MESSAGE, toUserMessage } from '../lib/api';
import { DISCLAIMER } from '../lib/constants';
import { formatRecordDate, withParticle } from '../lib/format';
import type { DailyLog, TodayResponse } from '../lib/petApi';
import { toggleSymptom, toggleSymptomNone } from '../lib/symptoms';
import {
  applyCheckResult,
  applyUncheckResult,
  COLLAPSE_DELAY_MS,
  collapseTaken,
  doseKey,
  headerInfo as buildHeaderInfo,
  HIGHLIGHT_MS,
  markTaken,
  markUntaken,
  mergeServerDoses,
  pickHighlightKey,
  restoreDose,
  rollback,
  settleDose,
  SHIFT_GUARD_EXTRA_MS,
  toDoseViews,
  type DoseView,
} from '../lib/todayDoses';
import {
  buildDailyLogBody,
  initialTodayForm,
  isFirstUse,
  sanitizeMlInput,
  sanitizeWeightInput,
  stepWeight,
  tapLevel,
  validateTodayForm,
  type TodayForm,
} from '../lib/todayForm';
import { MEDICATIONS_HREF, NEW_MEDICATION_HREF } from '../medications/routes';
import { usePet } from '../pet/PetProvider';
import { usePushMessages } from '../push/pushContext';
import { petApi } from '../services/client';
import { readPreferMl, writePreferMl } from '../services/preferences';
import { colors, spacing } from '../theme';
import { DeviceFooter } from './sections/DeviceFooter';
import { DoseSection } from './sections/DoseSection';
import { LevelPicker } from './sections/LevelPicker';
import { MemoSection } from './sections/MemoSection';
import { SaveBar } from './sections/SaveBar';
import { SymptomSection } from './sections/SymptomSection';
import { TodayHeader } from './sections/TodayHeader';
import { WaterSection } from './sections/WaterSection';
import { WeightSection } from './sections/WeightSection';

const TOAST_MS = 3000;
/** 앱이 앞으로 돌아올 때 서버 재확인 최소 간격(과호출 방지) */
export const RESYNC_MIN_INTERVAL_MS = 30_000;
export const DATE_CHANGED_NOTICE = '새 날짜가 되어 화면을 새로 불러왔어요.';

export default function TodayScreen() {
  const { pet, reload: reloadPet } = usePet();
  const params = useLocalSearchParams<{ source?: string; med?: string; n?: string }>();
  const router = useRouter();
  const goManage = useCallback(() => router.push(MEDICATIONS_HREF as never), [router]);
  const goAddMedication = useCallback(() => router.push(NEW_MEDICATION_HREF as never), [router]);

  const [today, setToday] = useState<TodayResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [doses, setDoses] = useState<DoseView[]>([]);
  const [doseMessage, setDoseMessage] = useState<string | null>(null);
  const [form, setForm] = useState<TodayForm | null>(null);
  const [savedLog, setSavedLog] = useState<DailyLog | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
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
    setDoses(toDoseViews(t.doses));
    setSavedLog(t.dailyLog);
    setForm(initialTodayForm(t, preferMl));
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
          } else {
            // 새 날짜: 입력 중이던 값은 버리고 새 응답으로 교체한다(저장해도 서버가 400 으로 거부하므로)
            applyToday(t, await readPreferMl());
            setNotice(DATE_CHANGED_NOTICE);
            setToast(null);
            setSaveError(null);
            setDoseMessage(null);
          }
        } catch (err) {
          isPetGone(err); // 오프라인 등 그 밖의 실패는 무시
        }
      })();
    });
    return () => sub.remove();
  }, [petId, applyToday, isPetGone]);

  // 알림 탭(?source=push&med=<medicationId>): 해당 약의 아직 안 먹인 회차 카드를 2분간 강조한다(없는 id 면 무시)
  // n 은 알림이 열릴 때마다 바뀌는 값(nonce): 같은 약을 다시 탭해도 강조와 2분 타이머가 다시 시작된다
  const medParam = params.source === 'push' && params.med ? params.med : null;
  const openNonce = params.n ?? null;
  const [highlightExpired, setHighlightExpired] = useState(false);
  useEffect(() => {
    setHighlightExpired(false);
    if (!medParam) return;
    const t = setTimeout(() => setHighlightExpired(true), HIGHLIGHT_MS);
    return () => clearTimeout(t);
  }, [medParam, openNonce]);
  const highlightKey = useMemo(
    () => pickHighlightKey(doses, medParam, highlightExpired),
    [medParam, highlightExpired, doses],
  );

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

  // 저장 토스트는 3초 후 사라진다
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(t);
  }, [toast]);

  /** 웹은 DOM 캡처로 탭을 세지만 RN 은 입력 핸들러에서 센다(지표용 근사값) */
  const countTap = () => {
    taps.current += 1;
  };

  async function toggleDose(dose: DoseView) {
    if (dose.pending) return;
    countTap();
    const key = doseKey(dose);
    setDoseMessage(null);
    invalidateSync();

    if (!dose.taken) {
      // 낙관적 업데이트: 바로 체크 표시 → 0.3초 뒤 한 줄로 접기
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
          // 다른 기기에서 이미 체크함 → 체크 상태 유지, 서버 값(medLogId)으로 맞춘다
          setDoses((list) => settleDose(list, key));
          setDoseMessage('이미 체크된 약이라 화면을 맞췄어요.');
          void syncDoses();
          return;
        }
        // 실패 → 되돌리고 안내
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

    // 체크 취소
    if (!dose.medLogId) {
      void syncDoses();
      return;
    }
    const before = { ...dose };
    setDoses((list) => markUntaken(list, key));
    try {
      await petApi.uncheckMed(dose.medLogId);
      invalidateSync();
      setDoses((list) => applyUncheckResult(list, key));
    } catch (err) {
      invalidateSync();
      if (err instanceof ApiError && err.status === 404) {
        // 이미 취소된 기록 → 먼저 대기 상태를 풀고(재동기가 실패해도 잠기지 않게) 서버와 맞춘다
        setDoses((list) => applyUncheckResult(list, key));
        void syncDoses();
        return;
      }
      setDoses((list) => restoreDose(list, key, before));
      if (err instanceof ApiError && err.status === 401) return;
      setDoseMessage(`취소하지 못했어요. ${toUserMessage(err, 'medLog')}`);
    }
  }

  async function save() {
    if (!form || !today || !petId || saving) return;
    const problem = validateTodayForm(form);
    setSaveError(problem);
    if (problem) return;
    setSaving(true);
    setNotice(null);
    const wasFirst = isFirstUse(today) && !savedLog;
    try {
      const log = await petApi.saveDailyLog(petId, today.recordDate, buildDailyLogBody(form));
      // 저장하는 동안 앱 복귀 등으로 화면이 새 날짜로 바뀌었으면 구 날짜 값을 되살리지 않는다
      if (todayRef.current?.recordDate !== today.recordDate) return;
      const next = { ...today, dailyLog: log };
      setToday(next);
      setSavedLog(log);
      setForm(initialTodayForm(next, form.waterMode === 'ml'));
      setToast(wasFirst ? '첫 기록을 남겼어요. 내일 이 시간쯤 다시 만나요.' : '오늘 기록을 남겼어요. 수고하셨어요');
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
        void load();
        return;
      }
      if (err instanceof ApiError && err.status === 401) return;
      setSaveError(toUserMessage(err, 'dailyLog'));
    } finally {
      setSaving(false);
    }
  }

  function update(patch: Partial<TodayForm>) {
    setForm((f) => (f ? { ...f, ...patch } : f));
  }

  function setWaterMode(mode: 'level' | 'ml') {
    if (!form) return;
    countTap();
    void writePreferMl(mode === 'ml');
    update({ waterMode: mode });
  }

  // ---------- 화면 ----------
  const name = pet?.name ?? '';
  const firstUse = today ? isFirstUse(today) : false;
  const saveLabel = saving ? '저장하는 중…' : savedLog ? '기록 수정하기' : firstUse ? '첫 기록 저장' : '오늘 기록 저장';

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
          toast={toast}
          error={saveError}
          disabled={!form}
          saving={saving}
          onSave={() => void save()}
        />
      }
    >
      <TodayHeader
        dateText={today ? formatRecordDate(today.recordDate) : '오늘'}
        petName={name}
        info={buildHeaderInfo(pet, today)}
      />

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
            onToggle={(d) => void toggleDose(d)}
            onHighlight={revealCard}
            onManage={goManage}
            onAdd={goAddMedication}
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
            />

            <MemoSection value={form.memo} onChange={(memo) => update({ memo })} />

            <AppText variant="caption">{DISCLAIMER}</AppText>
          </View>
        </>
      )}

      <DeviceFooter onManage={goManage} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  bold: { fontWeight: '700' },
  loading: { alignItems: 'center', gap: spacing.sm, padding: spacing.lg },
  below: { gap: spacing.lg },
});
