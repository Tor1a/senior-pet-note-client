import { useCallback, useEffect, useRef, useState, type MouseEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import PetAvatar from '../components/PetAvatar';
import { ApiError, isNetworkError, NETWORK_ERROR_MESSAGE, toUserMessage } from '../lib/api';
import { petApi } from '../lib/client';
import { DISCLAIMER, MEMO_MAX_LENGTH } from '../lib/constants';
import {
  ageText,
  daysBetween,
  formatKg,
  formatRecordDate,
  formatTakenAt,
  formatTime,
  LEVEL_LABELS,
  withParticle,
} from '../lib/format';
import type { DailyLog, Dose, TodayResponse } from '../lib/petApi';
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
  stepWeight,
  tapLevel,
  validateTodayForm,
  type LevelField,
  type TodayForm,
} from '../lib/todayForm';
import { usePet } from '../pet';

// "오늘" 기록 화면 (design/today-wireframe.md 2장, 계약 docs/api-today.md)
// - 기록 날짜·제안값·새벽 4시 안내 문구는 서버(GET /today)가 준 값을 그대로 쓴다.
// - 투약 체크는 탭 즉시 저장(낙관적 업데이트), 일일 기록은 [저장]을 눌러야 확정한다.

/** 체크한 약 카드를 한 줄로 접기까지 기다리는 시간 (와이어프레임 개발자 메모 6) */
export const COLLAPSE_DELAY_MS = 300;
/** 접힌 뒤 아래 영역 입력을 조금 더 막아 잘못 탭하는 일을 줄인다 */
const SHIFT_GUARD_EXTRA_MS = 150;
const TOAST_MS = 3000;
const WATER_MODE_KEY = 'spn.waterMode';

interface DoseView extends Dose {
  /** 서버 응답을 기다리는 중 */
  pending: boolean;
  /** 한 줄로 접힘 */
  collapsed: boolean;
}

const doseKey = (d: Dose) => `${d.medicationId}@${d.scheduledTime}`;

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
  const [toast, setToast] = useState<string | null>(null);
  const [shifting, setShifting] = useState(false);
  const [memoOpen, setMemoOpen] = useState(false);

  // 10초 지표: 화면을 연 시각부터 저장까지의 탭 수와 시간
  const openedAt = useRef(performance.now());
  const taps = useRef(0);
  const openedSent = useRef(false);
  const timers = useRef<number[]>([]);

  const petId = pet?.id ?? null;

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
    setDoses(t.doses.map((d) => ({ ...d, pending: false, collapsed: d.taken })));
    setSavedLog(t.dailyLog);
    setForm(initialTodayForm(t, readPreferMl()));
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
  const syncDoses = useCallback(async () => {
    if (!petId) return;
    try {
      const t = await petApi.getToday(petId);
      setDoses(t.doses.map((d) => ({ ...d, pending: false, collapsed: d.taken })));
    } catch (err) {
      isPetGone(err);
    }
  }, [petId, isPetGone]);

  useEffect(() => {
    void load();
  }, [load]);

  // today_opened: 화면을 열 때 한 번. 실패해도 화면에는 영향 없음
  useEffect(() => {
    if (openedSent.current) return;
    openedSent.current = true;
    void petApi.sendEvent('today_opened', { source: params.get('source') === 'push' ? 'push' : 'direct' });
  }, [params]);

  // 저장 토스트는 3초 후 사라진다
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), TOAST_MS);
    return () => window.clearTimeout(t);
  }, [toast]);

  function countTap(e: MouseEvent) {
    const el = e.target as HTMLElement;
    if (el.closest('button, [role="checkbox"], [role="radio"]')) taps.current += 1;
  }

  function updateDose(key: string, patch: Partial<DoseView>) {
    setDoses((list) => list.map((d) => (doseKey(d) === key ? { ...d, ...patch } : d)));
  }

  async function toggleDose(dose: DoseView) {
    if (dose.pending) return;
    const key = doseKey(dose);
    setDoseMessage(null);

    if (!dose.taken) {
      // 낙관적 업데이트: 바로 체크 표시 → 0.3초 뒤 한 줄로 접기
      updateDose(key, { taken: true, pending: true, takenAt: new Date().toISOString() });
      setShifting(true);
      later(() => {
        setDoses((list) => list.map((d) => (doseKey(d) === key && d.taken ? { ...d, collapsed: true } : d)));
      }, COLLAPSE_DELAY_MS);
      later(() => setShifting(false), COLLAPSE_DELAY_MS + SHIFT_GUARD_EXTRA_MS);
      try {
        const log = await petApi.checkMed(dose.medicationId, dose.scheduledTime);
        updateDose(key, { pending: false, medLogId: log.id, takenAt: log.takenAt });
        void petApi.sendEvent('med_checked');
      } catch (err) {
        if (err instanceof ApiError && err.code === 'ALREADY_CHECKED') {
          // 다른 기기에서 이미 체크함 → 체크 상태 유지, 서버 값(medLogId)으로 맞춘다
          updateDose(key, { pending: false });
          setDoseMessage('이미 체크된 약이라 화면을 맞췄어요.');
          void syncDoses();
          return;
        }
        // 실패 → 되돌리고 안내
        updateDose(key, { taken: false, pending: false, takenAt: null, medLogId: null, collapsed: false });
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
    updateDose(key, { taken: false, pending: true, collapsed: false, takenAt: null });
    try {
      await petApi.uncheckMed(dose.medLogId);
      updateDose(key, { pending: false, medLogId: null });
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        // 이미 취소된 기록 → 서버와 맞춘다
        void syncDoses();
        return;
      }
      updateDose(key, { ...before, pending: false });
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
    const wasFirst = isFirstUse(today) && !savedLog;
    try {
      const log = await petApi.saveDailyLog(petId, today.recordDate, buildDailyLogBody(form));
      const next = { ...today, dailyLog: log };
      setToday(next);
      setSavedLog(log);
      setForm(initialTodayForm(next, form.waterMode === 'ml'));
      setToast(wasFirst ? '첫 기록을 남겼어요. 내일 이 시간쯤 다시 만나요.' : '오늘 기록을 남겼어요. 수고하셨어요');
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
        void load();
        return;
      }
      if (err instanceof ApiError && err.status === 401) return;
      setSaveError(toUserMessage(err, 'dailyLog'));
    } finally {
      setSaving(false);
    }
  }

  function setWaterMode(mode: 'level' | 'ml') {
    if (!form) return;
    writePreferMl(mode === 'ml');
    setForm({ ...form, waterMode: mode });
  }

  // ---------- 화면 ----------
  const name = pet?.name ?? '';
  const headerInfo = [name, pet && today ? ageText(pet.birthYear, today.recordDate) : '', pet?.conditions ?? '']
    .filter(Boolean)
    .join(' · ');
  const takenCount = doses.filter((d) => d.taken).length;
  const firstUse = today ? isFirstUse(today) : false;
  const saveLabel = saving ? '저장하는 중…' : savedLog ? '기록 수정하기' : firstUse ? '첫 기록 저장' : '오늘 기록 저장';

  return (
    <div className="today" onClickCapture={countTap}>
      <header className="today-header">
        <div className="row-between">
          <p className="today-date">{today ? formatRecordDate(today.recordDate) : '오늘'}</p>
          <Link to="/pet" className="btn-link menu-link" aria-label="메뉴: 프로필과 약 관리">
            ≡ 메뉴
          </Link>
        </div>
        <div className="pet-line">
          <PetAvatar pet={pet} size={40} />
          <span>{headerInfo}</span>
        </div>
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
                  <Link to="/medications" className="btn-link">
                    약 관리
                  </Link>
                )}
              </div>
              <p className="notice">{today.cutoffNotice}</p>

              {doses.length === 0 ? (
                <div className="card med-empty">
                  <p className="strong">💊 먹이는 약이 있나요?</p>
                  <p className="muted">등록하면 오늘 화면에서 한 번에 체크할 수 있어요.</p>
                  <Link to="/medications" className="btn-secondary link-button">
                    약 등록하기
                  </Link>
                </div>
              ) : (
                <>
                  {takenCount === doses.length && (
                    <p className="all-done">
                      <span aria-hidden="true">▣ </span>오늘 약 {doses.length}개 모두 먹였어요
                    </p>
                  )}
                  <ul className="dose-list">
                    {doses.map((d) => (
                      <li key={doseKey(d)}>
                        <DoseItem dose={d} onToggle={() => void toggleDose(d)} />
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
            </section>

            {/* 투약 카드가 접히는 동안 아래 영역 입력을 잠시 막는다 */}
            <div className={shifting ? 'below-doses shifting' : 'below-doses'} aria-busy={shifting || undefined}>
              <section className="section" aria-labelledby="food-title">
                <LevelPicker
                  id="food"
                  title="식사"
                  field={form.food}
                  suggestion={today.suggestions.foodLevel}
                  onTap={(v) => setForm({ ...form, food: tapLevel(form.food, v) })}
                />
              </section>

              <section className="section" aria-labelledby="water-title">
                {form.waterMode === 'level' ? (
                  <LevelPicker
                    id="water"
                    title="물"
                    field={form.water}
                    suggestion={today.suggestions.waterLevel}
                    onTap={(v) => setForm({ ...form, water: tapLevel(form.water, v) })}
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
                          setForm({
                            ...form,
                            waterMl: {
                              text: e.target.value.replace(/[^\d]/g, ''),
                              source: e.target.value ? 'confirmed' : 'empty',
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
                        onClick={() => setForm({ ...form, symptoms: toggleSymptom(form.symptoms, code) })}
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
                    onChange={(e) => setForm({ ...form, symptoms: { ...form.symptoms, other: e.target.value } })}
                  />
                )}
                <button
                  type="button"
                  aria-pressed={form.symptoms.none}
                  className={`tag tag-none ${form.symptoms.none ? 'is-confirmed' : ''}`}
                  onClick={() => setForm({ ...form, symptoms: toggleSymptomNone(form.symptoms) })}
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
                    onClick={() =>
                      setForm({ ...form, weight: { ...form.weight, text: stepWeight(form.weight.text, -0.1), measured: true } })
                    }
                  >
                    −
                  </button>
                  <div className="unit-input">
                    <input
                      inputMode="decimal"
                      aria-label="체중 (kg)"
                      className={!form.weight.measured && form.weight.suggested ? 'is-suggested' : form.weight.measured ? 'is-measured' : ''}
                      value={form.weight.text}
                      placeholder="-.-"
                      onChange={(e) => {
                        const text = e.target.value.replace(/[^\d.]/g, '');
                        setForm({ ...form, weight: { ...form.weight, text, measured: text !== '' } });
                      }}
                    />
                    <span>kg</span>
                  </div>
                  <button
                    type="button"
                    aria-label="0.1kg 더하기"
                    disabled={!form.weight.text}
                    onClick={() =>
                      setForm({ ...form, weight: { ...form.weight, text: stepWeight(form.weight.text, 0.1), measured: true } })
                    }
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
                  onClick={() => setForm({ ...form, weight: { ...form.weight, measured: !form.weight.measured } })}
                >
                  {form.weight.measured ? '✓ 오늘 쟀어요' : '오늘 쟀어요'}
                </button>
                {!form.weight.measured && <p className="muted small">[오늘 쟀어요]를 누르거나 숫자를 바꾸면 오늘 체중으로 저장돼요.</p>}
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
                  value={form.memo}
                  onFocus={() => setMemoOpen(true)}
                  onChange={(e) => setForm({ ...form, memo: e.target.value })}
                />
                <p className="muted small align-end">
                  {form.memo.length} / {MEMO_MAX_LENGTH}
                </p>
              </section>

              <p className="disclaimer">{DISCLAIMER}</p>
            </div>
          </>
        )}
      </main>

      <div className="save-bar">
        <div aria-live="polite" className="toast-slot">
          {toast && (
            <p className="toast">
              <span aria-hidden="true">✓ </span>
              {toast}
            </p>
          )}
        </div>
        {saveError && (
          <p role="alert" className="error">
            {saveError}
          </p>
        )}
        <button type="button" className="btn-primary save-btn" disabled={!form || saving} onClick={() => void save()}>
          {saveLabel}
        </button>
      </div>
    </div>
  );
}

function daysAgoText(days: number): string {
  if (days <= 0) return '오늘';
  if (days === 1) return '어제';
  return `${days}일 전`;
}

function DoseItem({ dose, onToggle }: { dose: DoseView; onToggle: () => void }) {
  const what = [dose.name, dose.doseText].filter(Boolean).join(' ');
  const time = formatTime(dose.scheduledTime);
  const takenText = dose.taken && dose.takenAt ? `${formatTakenAt(dose.takenAt)} 먹임` : '먹임';
  const label = dose.taken
    ? `${time} ${what}, ${takenText}. 누르면 체크를 취소해요`
    : `${time} ${what}, 아직 체크하지 않았어요. 누르면 먹였어요로 체크해요`;

  if (dose.taken && dose.collapsed) {
    return (
      <div
        role="checkbox"
        aria-checked="true"
        aria-label={label}
        aria-disabled={dose.pending || undefined}
        tabIndex={0}
        className="dose dose-collapsed"
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === ' ' || e.key === 'Enter') {
            e.preventDefault();
            onToggle();
          }
        }}
      >
        <span className="check is-on" aria-hidden="true">
          ✓
        </span>
        <span className="dose-line">
          {time} {what} · {takenText}
        </span>
        <span className="dose-action">취소</span>
      </div>
    );
  }

  return (
    <div
      role="checkbox"
      aria-checked={dose.taken}
      aria-label={label}
      aria-disabled={dose.pending || undefined}
      tabIndex={0}
      className={`dose dose-card ${dose.taken ? 'is-taken' : ''}`}
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
      <span className="dose-action">{dose.taken ? takenText : '먹였어요'}</span>
    </div>
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
