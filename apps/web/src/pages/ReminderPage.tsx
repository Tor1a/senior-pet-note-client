import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ApiError, toUserMessage } from '../lib/api';
import { petApi, reminderApi } from '../lib/client';
import { addDays, formatSeoulDateTime, formatTime, seoulDateString } from '../lib/format';
import type { Medication } from '../lib/petApi';
import { DAYS_OF_WEEK, INTERVAL_DAYS_MAX, INTERVAL_DAYS_MIN, type Reminder, type RepeatType } from '../lib/reminderApi';
import {
  buildReminderBody,
  DAY_LABELS,
  DAY_NAMES,
  dawnNotice,
  formFromReminder,
  intervalHint,
  nextFireText,
  REPEAT_LABELS,
  sameReminderBody,
  stepInterval,
  summaryText,
  toggleDay,
  validateReminderForm,
  type ReminderField,
  type ReminderForm,
  type ReminderProblem,
} from '../lib/reminderForm';
import { usePet } from '../pet';
import { cannotReceive, usePush, type PushDeviceState } from '../push/PushProvider';

// 투약 알림 설정 (/medications/:id/reminder) — 화면 설계 4장(S2)·5장(S3)·6~8장(S4~S6), 계약 docs/api-reminders.md 2장
// - 알림 시각 = 약의 투약 시각(읽기 전용). 시각은 약 고치기에서 바꾼다.
// - 다음 알림 시각(nextFireAt)은 서버 값만 표시한다. 반복 규칙은 계산하지 않는다.
// - [저장]을 눌러야 확정(전체 교체 PUT). 권한이 없어도 설정 저장은 항상 한다(계정 단위, 다른 기기에서 받을 수 있음).
// - 권한 창은 사전 안내 대화상자의 [알림 허용하기]를 누른 뒤에만 띄운다.

const REPEATS: RepeatType[] = ['daily', 'weekly', 'interval'];
/** 시작일 상한: 서버는 400일 안에 회차가 없으면 nextFireAt 을 null 로 준다(설계 G2 의견 2) */
const START_DATE_MAX_DAYS = 365;

const SAVE_FAILED_400 = '알림 설정을 저장하지 못했어요. 고른 내용을 다시 확인해 주세요.';
const GONE_NOTICE = '목록에서 뺀 약이에요. 약 목록으로 돌아왔어요.';

type DialogPurpose = 'save' | 'device';

function saveMessage(r: Reminder, device: PushDeviceState): string {
  if (!r.enabled) return '알림을 껐어요. 고른 설정은 그대로 남아 있어요.';
  if (cannotReceive(device)) return '알림을 저장했어요. 다만 이 기기에서는 알림을 받을 수 없어요.';
  return r.nextFireAt ? `알림을 저장했어요. 다음 알림: ${formatSeoulDateTime(r.nextFireAt)}` : '알림을 저장했어요.';
}

export default function ReminderPage() {
  const { id = '' } = useParams();
  const { pet } = usePet();
  const push = usePush();
  const navigate = useNavigate();

  const [med, setMed] = useState<Medication | null>(null);
  const [saved, setSaved] = useState<Reminder | null>(null);
  const [form, setForm] = useState<ReminderForm | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [problem, setProblem] = useState<ReminderProblem | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogPurpose | null>(null);
  const [leaveTo, setLeaveTo] = useState<string | null>(null);
  const [iosOpen, setIosOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const saveBtnRef = useRef<HTMLButtonElement>(null);
  const fieldRefs = useRef<Partial<Record<ReminderField, HTMLElement | null>>>({});
  const prevDevice = useRef<PushDeviceState>(push.state);

  const goneToList = useCallback(() => {
    navigate('/medications', { replace: true, state: { notice: GONE_NOTICE } });
  }, [navigate]);

  const load = useCallback(async () => {
    if (!pet) return;
    setLoadError(null);
    try {
      const [meds, reminder] = await Promise.all([petApi.listMedications(pet.id), reminderApi.getReminder(id)]);
      const found = (meds ?? []).find((m) => m.id === id) ?? null;
      if (!found) {
        goneToList();
        return;
      }
      setMed(found);
      setSaved(reminder);
      setForm(formFromReminder(reminder));
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        goneToList();
        return;
      }
      if (err instanceof ApiError && err.status === 401) return;
      setLoadError(toUserMessage(err));
    }
  }, [pet, id, goneToList]);

  useEffect(() => {
    void load();
  }, [load]);

  // 브라우저 설정에서 알림을 허용하고 돌아와 등록되면 알려 준다(설계 6-2)
  useEffect(() => {
    if (push.state === 'registered' && (prevDevice.current === 'denied' || prevDevice.current === 'default') && !dialog) {
      setNotice('이제 이 기기에서도 알림을 받아요.');
    }
    prevDevice.current = push.state;
  }, [push.state, dialog]);

  const dirty = !!form && !!saved && !sameReminderBody(form, formFromReminder(saved));

  function change(patch: Partial<ReminderForm>) {
    if (!form || saving) return;
    setForm({ ...form, ...patch });
    setNotice(null);
    if (problem) {
      setProblem(null);
      setSaveError(null);
    }
  }

  function leave(to: string) {
    if (dirty) setLeaveTo(to);
    else navigate(to);
  }

  async function doSave(device: PushDeviceState) {
    if (!form || !saved) return;
    // 끈 상태로 저장할 때 숨겨 둔 값이 잘못돼 있으면(예: 요일 0개) 마지막으로 저장된 규칙을 유지한다
    const body =
      !form.enabled && validateReminderForm(form)
        ? { ...buildReminderBody(formFromReminder(saved)), enabled: false }
        : buildReminderBody(form);
    setSaving(true);
    setSaveError(null);
    try {
      const r = await reminderApi.putReminder(id, body);
      setSaved(r);
      setForm(formFromReminder(r));
      setNotice(saveMessage(r, device));
      if (r.enabled && device === 'ios-browser') setIosOpen(true);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        goneToList();
        return;
      }
      if (err instanceof ApiError && err.status === 401) return;
      setSaveError(err instanceof ApiError && err.status === 400 ? SAVE_FAILED_400 : toUserMessage(err));
    } finally {
      setSaving(false);
    }
  }

  function onSave() {
    if (!form || saving) return;
    setNotice(null);
    if (form.enabled) {
      const p = validateReminderForm(form);
      setProblem(p);
      setSaveError(p?.message ?? null);
      if (p) {
        fieldRefs.current[p.field]?.focus();
        return;
      }
      // 아직 안 물어봄 → 먼저 설명(S3), 권한 창은 그 대화상자 버튼에서
      if (push.state === 'default') {
        setDialog('save');
        return;
      }
    }
    void doSave(push.state);
  }

  function closeDialog() {
    setDialog(null);
    saveBtnRef.current?.focus();
  }

  function onDialogAllow() {
    const purpose = dialog;
    closeDialog();
    // 클릭 처리 안에서 바로 권한 창을 띄운다
    const asked = push.requestPermission();
    void asked.then((state) => {
      if (purpose === 'save') void doSave(state);
      else if (state === 'registered') setNotice('이제 이 기기에서도 알림을 받아요.');
    });
  }

  function onDialogLater() {
    const purpose = dialog;
    closeDialog();
    if (purpose === 'save') void doSave(push.state);
  }

  // ---------- 화면 ----------
  const times = saved?.times ?? med?.times ?? [];
  const today = seoulDateString();

  return (
    <div className="reminder-page">
      <header className="topbar">
        <button type="button" className="btn-link" onClick={() => leave('/medications')}>
          ← 약 목록으로
        </button>
      </header>
      <main className="page">
        <h1>투약 알림</h1>
        {med && (
          <p className="lead">
            {med.name}
            {med.doseText ? ` · ${med.doseText}` : ''}
          </p>
        )}

        {leaveTo && (
          <div className="card confirm-card" role="alertdialog" aria-labelledby="leave-title">
            <p id="leave-title" className="strong">
              저장하지 않고 나갈까요?
            </p>
            <div className="row">
              <button type="button" className="btn-secondary" onClick={() => navigate(leaveTo)}>
                나가기
              </button>
              <button type="button" className="btn-primary" autoFocus onClick={() => setLeaveTo(null)}>
                계속 고치기
              </button>
            </div>
          </div>
        )}

        {loadError && (
          <div role="alert" className="error">
            <p>{loadError}</p>
            <button type="button" className="btn-secondary" onClick={() => void load()}>
              다시 불러오기
            </button>
          </div>
        )}
        {!form && !loadError && <p aria-busy="true">불러오는 중…</p>}

        {form && saved && (
          <>
            <DeviceCard
              state={push.state}
              savedEnabled={saved.enabled}
              isMobile={push.isMobile}
              iosOpen={iosOpen}
              setIosOpen={setIosOpen}
              copied={copied}
              onCopy={() => {
                void navigator.clipboard?.writeText(window.location.href).then(
                  () => setCopied(true),
                  () => setCopied(false),
                );
              }}
              onAllow={() => setDialog('device')}
              onRetry={() => void push.recheck()}
            />

            <button
              type="button"
              role="switch"
              aria-checked={form.enabled}
              className={form.enabled ? 'switch-row is-on' : 'switch-row'}
              onClick={() => change({ enabled: !form.enabled })}
              disabled={saving}
            >
              <span className="strong">알림 받기</span>
              <span className="switch-state">
                <span aria-hidden="true">{form.enabled ? '🔔 ' : '🔕 '}</span>
                {form.enabled ? '켜짐' : '꺼짐'}
              </span>
            </button>

            {!form.enabled ? (
              <p className="muted">알림을 켜면 얼마나 자주, 언제까지 받을지 정할 수 있어요.</p>
            ) : (
              <>
                <section className="section" aria-labelledby="time-title">
                  <h2 id="time-title">알림 시각</h2>
                  <div className="card tight">
                    <p className="strong">{times.map(formatTime).join(' · ')}</p>
                    <p className="muted">먹이는 시각에 맞춰 알려 드려요.</p>
                    <button
                      type="button"
                      className="btn-link align-start"
                      onClick={() => leave(`/medications?edit=${encodeURIComponent(id)}`)}
                    >
                      먹이는 시각 바꾸기 ›
                    </button>
                  </div>
                </section>

                <section className="section" aria-labelledby="repeat-title">
                  <h2 id="repeat-title">얼마나 자주</h2>
                  <RadioGroup
                    labelledBy="repeat-title"
                    value={form.repeat}
                    options={REPEATS.map((r) => ({ value: r, label: REPEAT_LABELS[r] }))}
                    onChange={(repeat) => change({ repeat })}
                  />

                  {form.repeat === 'weekly' && (
                    <>
                      <div className="day-grid" role="group" aria-label="알림 받을 요일">
                        {DAYS_OF_WEEK.map((d, i) => {
                          const on = form.daysOfWeek.includes(d);
                          return (
                            <button
                              key={d}
                              type="button"
                              ref={i === 0 ? (el) => void (fieldRefs.current.daysOfWeek = el) : undefined}
                              className={on ? 'choice is-confirmed' : 'choice'}
                              aria-pressed={on}
                              aria-label={DAY_NAMES[d]}
                              onClick={() => change({ daysOfWeek: toggleDay(form.daysOfWeek, d) })}
                            >
                              {on ? `✓ ${DAY_LABELS[d]}` : DAY_LABELS[d]}
                            </button>
                          );
                        })}
                      </div>
                      {problem?.field === 'daysOfWeek' && <p className="field-error">{problem.message}</p>}
                    </>
                  )}

                  {form.repeat === 'interval' && (
                    <>
                      <div className="stepper">
                        <button
                          type="button"
                          aria-label="하루 줄이기"
                          ref={(el) => void (fieldRefs.current.intervalDays = el)}
                          disabled={form.intervalDays <= INTERVAL_DAYS_MIN}
                          onClick={() => change({ intervalDays: stepInterval(form.intervalDays, -1) })}
                        >
                          −
                        </button>
                        <span className="interval-value" aria-live="polite">
                          {form.intervalDays}일마다
                        </span>
                        <button
                          type="button"
                          aria-label="하루 늘리기"
                          disabled={form.intervalDays >= INTERVAL_DAYS_MAX}
                          onClick={() => change({ intervalDays: stepInterval(form.intervalDays, 1) })}
                        >
                          +
                        </button>
                      </div>
                      <p className="muted">{intervalHint(form.intervalDays)}</p>
                      {problem?.field === 'intervalDays' && <p className="field-error">{problem.message}</p>}
                    </>
                  )}
                </section>

                <section className="section" aria-labelledby="period-title">
                  <h2 id="period-title">기간</h2>
                  <label htmlFor="start-date">시작하는 날</label>
                  {form.repeat === 'interval' && (
                    <p className="muted" id="start-hint">
                      이 날이 첫 알림 날이에요.
                    </p>
                  )}
                  <input
                    id="start-date"
                    type="date"
                    ref={(el) => void (fieldRefs.current.startDate = el)}
                    value={form.startDate}
                    max={addDays(today, START_DATE_MAX_DAYS)}
                    aria-invalid={problem?.field === 'startDate' || undefined}
                    aria-describedby={form.repeat === 'interval' ? 'start-hint' : undefined}
                    onChange={(e) => change({ startDate: e.target.value })}
                  />
                  {problem?.field === 'startDate' && <p className="field-error">{problem.message}</p>}

                  <p className="label" id="end-title">
                    끝나는 날
                  </p>
                  <RadioGroup
                    labelledBy="end-title"
                    value={form.hasEndDate ? 'set' : 'none'}
                    options={[
                      { value: 'none', label: '정하지 않음(계속 알림)' },
                      { value: 'set', label: '날짜 정하기' },
                    ]}
                    onChange={(v) => change({ hasEndDate: v === 'set' })}
                  />
                  {form.hasEndDate && (
                    <>
                      <label htmlFor="end-date">끝나는 날짜</label>
                      <input
                        id="end-date"
                        type="date"
                        ref={(el) => void (fieldRefs.current.endDate = el)}
                        value={form.endDate}
                        min={form.startDate || undefined}
                        aria-invalid={problem?.field === 'endDate' || undefined}
                        onChange={(e) => change({ endDate: e.target.value })}
                      />
                      <p className="muted">이 날까지 알려 드려요.</p>
                    </>
                  )}
                  {problem?.field === 'endDate' && <p className="field-error">{problem.message}</p>}
                </section>

                <div className="summary-box" aria-live="polite">
                  <p className="strong">{summaryText(form, times, today)}</p>
                  <p>{dirty ? '저장하면 다음 알림 시각을 알려 드려요.' : nextFireText(saved)}</p>
                </div>
                {form.repeat !== 'daily' && (
                  <p className="notice">
                    ⓘ 오늘 화면에는 이 약이 매일 보여요. 먹이지 않는 날은 체크하지 않아도 돼요.
                  </p>
                )}
                {dawnNotice(form, times) && <p className="notice">ⓘ {dawnNotice(form, times)}</p>}
              </>
            )}

            <p className="notice">이 계정으로 로그인한 모든 기기에 알림이 가요.</p>
            {!push.isMobile && <p className="notice">컴퓨터에서는 브라우저가 켜져 있을 때만 알림이 와요.</p>}
          </>
        )}
      </main>

      <div className="save-bar">
        {saveError && (
          <p role="alert" className="error">
            {saveError}
          </p>
        )}
        {notice && (
          <p role="status" className="ok">
            {notice}
          </p>
        )}
        <button
          type="button"
          ref={saveBtnRef}
          className="btn-primary save-btn"
          disabled={!form || saving}
          onClick={onSave}
        >
          {saving ? '저장하는 중…' : '저장'}
        </button>
      </div>

      {dialog && (
        <PermissionDialog
          medName={med?.name ?? ''}
          isMobile={push.isMobile}
          onAllow={onDialogAllow}
          onLater={onDialogLater}
        />
      )}
    </div>
  );
}

/** 라디오 행(세로). 방향키로 이동 */
function RadioGroup<T extends string>({
  labelledBy,
  value,
  options,
  onChange,
}: {
  labelledBy: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  function onKeyDown(e: KeyboardEvent) {
    const delta = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : 0;
    if (!delta) return;
    e.preventDefault();
    const i = options.findIndex((o) => o.value === value);
    const next = (i + delta + options.length) % options.length;
    onChange(options[next].value);
    refs.current[next]?.focus();
  }
  return (
    <div role="radiogroup" aria-labelledby={labelledBy} className="radio-rows" onKeyDown={onKeyDown}>
      {options.map((o, i) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            ref={(el) => void (refs.current[i] = el)}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            className={on ? 'choice radio-row is-confirmed' : 'choice radio-row'}
            onClick={() => onChange(o.value)}
          >
            <span aria-hidden="true">{on ? '◉ ' : '○ '}</span>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** S3 알림 허용 사전 안내. 열리면 제목에 포커스, Esc = 나중에 */
function PermissionDialog({
  medName,
  isMobile,
  onAllow,
  onLater,
}: {
  medName: string;
  isMobile: boolean;
  onAllow: () => void;
  onLater: () => void;
}) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    titleRef.current?.focus();
  }, []);
  return (
    <div className="dialog-backdrop">
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="perm-title"
        onKeyDown={(e) => {
          if (e.key === 'Escape') onLater();
        }}
      >
        <p className="dialog-icon" aria-hidden="true">
          🔔
        </p>
        <h2 id="perm-title" tabIndex={-1} ref={titleRef}>
          약 먹일 시간에 알려 드릴게요
        </h2>
        <p>
          {medName ? `${medName}을(를) ` : '약을 '}먹일 시각이 되면 {isMobile ? '이 휴대폰으로' : '이 기기로'} 알림을 보내요.
        </p>
        <p className="muted">잠금화면에 반려동물과 약 이름이 보여요.</p>
        <p className="strong">다음 화면에서 [허용]을 눌러 주세요.</p>
        <button type="button" className="btn-primary" onClick={onAllow}>
          알림 허용하기
        </button>
        <button type="button" className="btn-link" onClick={onLater}>
          나중에
        </button>
      </div>
    </div>
  );
}

function InfoCard({ children }: { children: ReactNode }) {
  return <div className="error device-card">{children}</div>;
}

/** 4-7 이 기기 알림 상태 카드 (허용됨이면 없음) */
function DeviceCard({
  state,
  savedEnabled,
  isMobile,
  iosOpen,
  setIosOpen,
  copied,
  onCopy,
  onAllow,
  onRetry,
}: {
  state: PushDeviceState;
  savedEnabled: boolean;
  isMobile: boolean;
  iosOpen: boolean;
  setIosOpen: (v: boolean) => void;
  copied: boolean;
  onCopy: () => void;
  onAllow: () => void;
  onRetry: () => void;
}) {
  switch (state) {
    case 'default':
      if (!savedEnabled) return null;
      return (
        <InfoCard>
          <p className="strong">이 기기에서는 아직 알림을 받을 수 없어요.</p>
          <button type="button" className="btn-primary" onClick={onAllow}>
            알림 허용하기
          </button>
        </InfoCard>
      );
    case 'denied':
      return (
        <InfoCard>
          <p className="strong">이 기기에서 알림이 꺼져 있어요.</p>
          <p>기기 설정에서 알림을 켜야 받을 수 있어요.</p>
          <details>
            <summary className="details-summary">켜는 방법 보기</summary>
            <ol className="steps">
              {isMobile ? (
                <>
                  <li>주소창 왼쪽 아이콘을 눌러요.</li>
                  <li>"권한" → "알림"을 "허용"으로 바꿔요.</li>
                </>
              ) : (
                <>
                  <li>주소창 왼쪽 자물쇠(또는 ⓘ)를 눌러요.</li>
                  <li>"알림"을 "허용"으로 바꿔요.</li>
                </>
              )}
              <li>이 화면으로 돌아오면 자동으로 확인해요.</li>
            </ol>
            <p className="muted">홈 화면에 추가한 iPhone 앱이면: iPhone "설정" 앱 → "알림" → "펫노트"에서 "알림 허용"을 켜요.</p>
          </details>
        </InfoCard>
      );
    case 'ios-browser':
      return (
        <InfoCard>
          <p className="strong">iPhone에서는 홈 화면에 추가하면 알림을 받을 수 있어요.</p>
          {iosOpen ? (
            <>
              <ol className="steps">
                <li>화면 아래(iPad는 주소창)의 공유 버튼 [□↑ 공유]을 눌러요.</li>
                <li>"홈 화면에 추가"를 눌러요.</li>
                <li>홈 화면에 생긴 "펫노트" 아이콘으로 다시 열어요.</li>
                <li>다시 로그인한 뒤 알림 설정에서 [알림 허용하기]를 눌러요.</li>
              </ol>
              <p className="muted">iOS 16.4 이상에서만 돼요. 알림 설정은 저장해 둘 수 있어요.</p>
              <button type="button" className="btn-link align-start" onClick={() => setIosOpen(false)}>
                닫기
              </button>
            </>
          ) : (
            <button type="button" className="btn-secondary" onClick={() => setIosOpen(true)}>
              방법 보기
            </button>
          )}
        </InfoCard>
      );
    case 'ios-outdated':
      return (
        <InfoCard>
          <p className="strong">이 기기에서는 알림을 받을 수 없어요.</p>
          <p>iOS를 최신 버전(16.4 이상)으로 업데이트하면 받을 수 있어요.</p>
        </InfoCard>
      );
    case 'unsupported':
      return (
        <InfoCard>
          <p className="strong">이 브라우저에서는 알림을 받을 수 없어요.</p>
          <p>Chrome이나 Safari에서 이 주소를 열어 주세요.</p>
          <button type="button" className="btn-secondary" onClick={onCopy}>
            주소 복사하기
          </button>
          {copied && <p role="status">주소를 복사했어요.</p>}
        </InfoCard>
      );
    case 'unavailable':
      return (
        <InfoCard>
          <p className="strong">이 환경에서는 알림이 설정되지 않았어요(개발 환경).</p>
          <p>알림 설정은 저장할 수 있어요. 이 기기로 알림이 가지는 않아요.</p>
        </InfoCard>
      );
    case 'error':
      return (
        <InfoCard>
          <p className="strong">이 기기를 알림 받을 기기로 등록하지 못했어요.</p>
          <button type="button" className="btn-secondary" onClick={onRetry}>
            다시 시도
          </button>
        </InfoCard>
      );
    default:
      return null;
  }
}

