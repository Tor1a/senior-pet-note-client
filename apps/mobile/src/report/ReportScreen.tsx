// R1 병원 방문 리포트 (/report) — 웹 ReportPage 와 같은 구성·문구
// - 지난 기록과 같은 daily-logs 호출 1번 + 약 목록으로 만든다(신규 API 없음). 7/14/30일 전환은 재요청 없이 받은 days 를 자른다.
// - 기간·메모 옵션은 어디에도 저장하지 않는다(매번 14일, 메모 포함). 건강 기록은 디스크에 저장하지 않는다(메모리만).
// - 내보내기는 RN 기본 Share.share 로 "텍스트"만 보낸다. 파일을 만들지 않고 클립보드에도 복사하지 않는다.
//   공유 전에 담기는 내용을 보여 주는 확인 카드를 한 번 거친다.
// - 큰 글씨(1.3+)는 표를 행 목록으로, 2.0+ 또는 스크린리더가 켜져 있으면 표가 기본으로 펼쳐진다.
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  BackHandler,
  Platform,
  RefreshControl,
  Share,
  View,
  useWindowDimensions,
} from 'react-native';
import { NoticeCard } from '../components/NoticeCard';
import { AppButton, AppText, Card, ChoiceButton, LinkButton, Screen } from '../components/ui';
import { ApiError, isNetworkError, NETWORK_ERROR_MESSAGE } from '../lib/api';
import { DISCLAIMER } from '../lib/constants';
import { formatTime } from '../lib/format';
import { staleNotice } from '../lib/historyText';
import type { HistoryResponse } from '../lib/petApi';
import { parseReportRange, REPORT_RANGES, reportDays, type ReportRange } from '../lib/reportStats';
import {
  buildReport,
  rangeChangedNotice,
  REPORT_TEXT as T,
  shareContents,
  toPlainText,
  type MedicationsState,
} from '../lib/reportText';
import { goBackOr } from '../medications/routes';
import { ScreenTop } from '../medications/ScreenTop';
import { usePet } from '../pet/PetProvider';
import { petApi } from '../services/client';
import { colors, spacing } from '../theme';
import { MemoSwitch, ReportCards } from './ReportCards';

const HUGE_FONT_SCALE = 2;

/** 기기 시계의 '오후 3:20' (마지막으로 불러온 시각 표기용. 기록 날짜 계산에는 쓰지 않는다) */
function nowText(): string {
  const d = new Date();
  return formatTime(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`);
}

export default function ReportScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ range?: string; from?: string }>();
  const fromHistory = params.from === 'history';
  const { pet, reload: reloadPet } = usePet();
  const petId = pet?.id ?? null;
  const { fontScale } = useWindowDimensions();

  const [range, setRange] = useState<ReportRange>(() => parseReportRange(params.range));
  const [history, setHistory] = useState<HistoryResponse | null>(null);
  const [loadedAt, setLoadedAt] = useState('');
  const [error, setError] = useState<{ network: boolean } | null>(null);
  const [loading, setLoading] = useState(true);
  const [medications, setMedications] = useState<MedicationsState>({ status: 'loading' });
  const [includeMemo, setIncludeMemo] = useState(true);
  const [rangeNotice, setRangeNotice] = useState('');
  const [tableOverride, setTableOverride] = useState<boolean | null>(null);
  const [screenReader, setScreenReader] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [shareMessage, setShareMessage] = useState<{ text: string; failed: boolean } | null>(null);
  const seq = useRef(0);
  const medSeq = useRef(0);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(() => {
    void AccessibilityInfo.isScreenReaderEnabled().then((on) => alive.current && setScreenReader(on));
  }, []);

  const load = useCallback(async () => {
    if (!petId) return;
    const mine = ++seq.current;
    setLoading(true);
    setError(null);
    try {
      const res = await petApi.getHistory(petId);
      if (!alive.current || mine !== seq.current) return;
      setHistory(res);
      setLoadedAt(nowText());
    } catch (err) {
      if (!alive.current || mine !== seq.current) return;
      if (err instanceof ApiError && err.status === 404) {
        void reloadPet();
        return;
      }
      setError({ network: isNetworkError(err) });
    } finally {
      if (alive.current && mine === seq.current) setLoading(false);
    }
  }, [petId, reloadPet]);

  const loadMedications = useCallback(async () => {
    if (!petId) return;
    const mine = ++medSeq.current;
    setMedications({ status: 'loading' });
    try {
      const items = (await petApi.listMedications(petId)) ?? [];
      if (alive.current && mine === medSeq.current) setMedications({ status: 'ready', items });
    } catch {
      // 약 목록만 실패해도 나머지 리포트는 보여 준다 (오류 문구가 본문과 공유 텍스트에 그대로 들어간다)
      if (alive.current && mine === medSeq.current) setMedications({ status: 'error' });
    }
  }, [petId]);

  useEffect(() => {
    void load();
    void loadMedications();
  }, [load, loadMedications]);

  const days = useMemo(() => (history ? reportDays(history.days, range) : []), [history, range]);
  const model = useMemo(
    () => (pet && history ? buildReport({ pet, recordDate: history.recordDate, days, medications, includeMemo }) : null),
    [pet, history, days, medications, includeMemo],
  );
  const recorded = model?.recorded ?? 0;
  const canShare = !!model && recorded > 0;
  const tableOpen = tableOverride ?? (screenReader || fontScale >= HUGE_FONT_SCALE);

  // 시스템 뒤로 = 확인 카드 닫기(화면은 유지). 한 번 더 누르면 나간다
  useEffect(() => {
    if (!confirmOpen) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setConfirmOpen(false);
      return true;
    });
    return () => sub.remove();
  }, [confirmOpen]);

  const chooseRange = (next: ReportRange) => {
    setRange(next);
    if (!history) return;
    const msg = rangeChangedNotice(next, reportDays(history.days, next));
    setRangeNotice(msg);
    AccessibilityInfo.announceForAccessibility?.(msg);
  };

  const openConfirm = () => {
    setShareMessage(null);
    setConfirmOpen(true);
    AccessibilityInfo.announceForAccessibility?.(T.shareConfirmTitle);
  };

  const doShare = async () => {
    if (!model || sharing) return;
    setSharing(true);
    try {
      const result = await Share.share({ message: toPlainText(model, days) });
      if (!alive.current) return;
      setConfirmOpen(false);
      setPreviewOpen(false);
      // 시트를 열었다가 그냥 닫은 경우(dismissedAction)는 아무 안내도 하지 않는다
      if (result.action !== Share.dismissedAction) setShareMessage({ text: T.shareOpened, failed: false });
    } catch {
      if (alive.current) setShareMessage({ text: T.shareFailed, failed: true });
    } finally {
      if (alive.current) setSharing(false);
    }
  };

  const errorText = error ? (error.network ? NETWORK_ERROR_MESSAGE : T.loadFailed) : '';
  const shareDisabledReason = !history
    ? T.printDisabledLoading
    : medications.status === 'loading'
      ? T.shareDisabledMedications
      : recorded === 0
        ? T.printDisabledEmpty
        : null;
  const medicationCount = medications.status === 'ready' ? medications.items.filter((m) => m.active).length : 0;
  const webPreview = Platform.OS === 'web';

  return (
    <Screen
      refreshControl={
        <RefreshControl refreshing={loading && history !== null} onRefresh={() => void load()} colors={[colors.primary]} />
      }
    >
      <ScreenTop
        backLabel={fromHistory ? '지난 기록으로' : '오늘로'}
        backA11yLabel={fromHistory ? '지난 기록 화면으로 돌아가기' : '오늘 화면으로 돌아가기'}
        onBack={() => goBackOr(router, fromHistory ? '/history' : '/')}
        title={T.title}
        lead={T.subtitle}
      />

      <View accessibilityRole="radiogroup" accessibilityLabel={T.rangeGroup} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
        {REPORT_RANGES.map((r) => (
          <ChoiceButton key={r} label={`${r}일`} selected={range === r} onPress={() => chooseRange(r)} grow tall />
        ))}
      </View>
      {rangeNotice !== '' && (
        <AppText variant="caption" accessibilityLiveRegion="polite">
          {rangeNotice}
        </AppText>
      )}

      {error && (
        <NoticeCard kind="info" alert>
          <AppText>{history && error.network ? staleNotice(loadedAt) : errorText}</AppText>
          <AppButton label={T.retry} variant="secondary" onPress={() => void load()} />
        </NoticeCard>
      )}

      {loading && !history && !error && (
        <View style={{ alignItems: 'center', gap: spacing.sm }} accessibilityState={{ busy: true }}>
          <ActivityIndicator color={colors.primary} />
          <AppText variant="secondary">{T.loading}</AppText>
        </View>
      )}

      {model && history && recorded === 0 && (
        <Card>
          <AppText style={{ fontWeight: '700' }}>{model.periodLine}</AppText>
          <AppText style={{ fontWeight: '700' }}>{T.emptyTitle}</AppText>
          <AppText variant="secondary">{T.emptyBody}</AppText>
          <AppButton label={T.goToday} onPress={() => router.replace('/' as never)} />
        </Card>
      )}

      {model && history && recorded > 0 && (
        <>
          <ReportCards
            model={model}
            days={days}
            tableOpen={tableOpen}
            onToggleTable={() => setTableOverride(!tableOpen)}
            onRetryMedications={() => void loadMedications()}
          />
          {!confirmOpen && <MemoSwitch value={includeMemo} onChange={setIncludeMemo} hint={T.memoSwitchHintApp} />}
        </>
      )}

      {webPreview ? (
        <AppText variant="secondary">{T.webOnlyShare}</AppText>
      ) : confirmOpen && model ? (
        <Card accent>
          <AppText variant="title" accessibilityRole="header">
            {T.shareConfirmTitle}
          </AppText>
          <AppText>{T.shareConfirmBody}</AppText>
          <AppText>{T.shareConfirmBody2}</AppText>
          <AppText style={{ fontWeight: '700' }}>{T.shareContents}</AppText>
          {shareContents(model, medicationCount).map((line) => (
            <AppText key={line}>{`· ${line}`}</AppText>
          ))}
          <MemoSwitch value={includeMemo} onChange={setIncludeMemo} hint={T.memoSwitchHintApp} />
          <AppButton
            label={previewOpen ? T.sharePreviewClose : T.sharePreview}
            variant="secondary"
            onPress={() => setPreviewOpen((v) => !v)}
          />
          {previewOpen && (
            <View accessibilityLabel={T.sharePreview} style={{ gap: spacing.sm }}>
              <AppText variant="secondary">{toPlainText(model, days)}</AppText>
            </View>
          )}
          <AppButton label={T.shareOpen} loading={sharing} disabled={sharing} onPress={() => void doShare()} />
          <AppButton label={T.shareCancel} variant="secondary" disabled={sharing} onPress={() => setConfirmOpen(false)} />
        </Card>
      ) : (
        <View style={{ gap: spacing.sm }}>
          <AppButton
            label={T.share}
            disabled={shareDisabledReason !== null}
            accessibilityHint={shareDisabledReason ?? undefined}
            onPress={openConfirm}
          />
          {shareDisabledReason ? (
            <AppText variant="secondary">{shareDisabledReason}</AppText>
          ) : (
            <AppText variant="secondary">{T.shareHint}</AppText>
          )}
        </View>
      )}

      {shareMessage && (
        <AppText accessibilityRole="alert" accessibilityLiveRegion="polite" style={{ fontWeight: '700' }}>
          {shareMessage.failed ? `! ${shareMessage.text}` : `✓ ${shareMessage.text}`}
        </AppText>
      )}

      <LinkButton label={T.toToday} onPress={() => router.replace('/' as never)} />
      <AppText variant="caption">{DISCLAIMER}</AppText>
    </Screen>
  );
}
