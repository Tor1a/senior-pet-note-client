import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { ApiError, toUserMessage } from '../lib/api';
import { petApi, reminderApi } from '../lib/client';
import { DISCLAIMER } from '../lib/constants';
import { formatTime } from '../lib/format';
import type { Medication, MedicationInput } from '../lib/petApi';
import type { Reminder } from '../lib/reminderApi';
import { reminderStatus } from '../lib/reminderForm';
import { cannotReceive, usePush } from '../push/PushProvider';
import { usePet } from '../pet';

// 약 관리 (/medications, 온보딩 2/2 이면 ?onboarding=1, ?edit=<약 id> 면 그 약 고치기 폼을 연 상태)
// 이름(필수), 용량(선택), 하루 시각 1~3개(서로 달라야 함)
// 약 카드마다 알림 상태 줄 + [알림 설정] (화면 설계 3장). 목록 API 에 알림 정보가 없어 약마다 GET reminder 를 병렬로 부른다.
const NAME_MAX = 50;
const DOSE_MAX = 50;
const MAX_TIMES = 3;

interface Draft {
  id: string | null; // null 이면 새 약
  name: string;
  doseText: string;
  times: string[];
}

const EMPTY_DRAFT: Draft = { id: null, name: '', doseText: '', times: ['08:00'] };

/** 입력 확인. 문제가 있으면 안내 문구 */
export function validateMedicationDraft(d: Draft): string | null {
  if (!d.name.trim()) return '약 이름을 적어 주세요.';
  if (d.name.trim().length > NAME_MAX) return `약 이름은 ${NAME_MAX}자까지 적을 수 있어요.`;
  if (d.times.length < 1 || d.times.length > MAX_TIMES) return '먹이는 시각을 1~3개 정해 주세요.';
  if (d.times.some((t) => !/^\d{2}:\d{2}$/.test(t))) return '먹이는 시각을 모두 골라 주세요.';
  if (new Set(d.times).size !== d.times.length) return '같은 시각이 두 번 들어갔어요. 서로 다른 시각으로 골라 주세요.';
  return null;
}

export default function MedicationsPage() {
  const { pet, reload } = usePet();
  const [params, setParams] = useSearchParams();
  const onboarding = params.get('onboarding') === '1';
  const editId = params.get('edit');
  const location = useLocation();
  const push = usePush();

  const [meds, setMeds] = useState<Medication[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  // 알림 설정 화면에서 "목록에서 뺀 약"으로 돌아온 경우 그 안내를 보여 준다
  const [notice, setNotice] = useState<string | null>(
    () => (location.state as { notice?: string } | null)?.notice ?? null,
  );
  /** 방금 등록한 약 id (등록 직후 "알림 설정하기" 진입점) */
  const [createdId, setCreatedId] = useState<string | null>(null);
  /** 약별 알림 설정. 'error' 면 상태 줄을 숨긴다 */
  const [reminders, setReminders] = useState<Record<string, Reminder | 'error'>>({});

  const handleError = useCallback(
    (err: unknown, set: (m: string) => void) => {
      if (err instanceof ApiError && err.status === 404) {
        // 반려동물이 없어졌거나 약이 이미 지워짐 → 다시 읽는다
        void reload();
        return;
      }
      set(toUserMessage(err, 'medication'));
    },
    [reload],
  );

  const load = useCallback(async () => {
    if (!pet) return;
    setLoadError(null);
    try {
      const list = (await petApi.listMedications(pet.id)) ?? [];
      setMeds(list);
      // 하나가 실패해도 다른 카드는 표시한다
      void Promise.all(
        list.map((m) =>
          reminderApi.getReminder(m.id).then(
            (r): [string, Reminder | 'error'] => [m.id, r],
            (): [string, Reminder | 'error'] => [m.id, 'error'],
          ),
        ),
      ).then((entries) => setReminders(Object.fromEntries(entries)));
    } catch (err) {
      handleError(err, setLoadError);
    }
  }, [pet, handleError]);

  useEffect(() => {
    void load();
  }, [load]);

  // ?edit=<id>: 알림 설정 화면의 "먹이는 시각 바꾸기"에서 왔다 → 그 약 고치기 폼을 연다(한 번만)
  useEffect(() => {
    if (!meds || !editId) return;
    const m = meds.find((x) => x.id === editId);
    if (m) setDraft({ id: m.id, name: m.name, doseText: m.doseText ?? '', times: [...m.times] });
    const next = new URLSearchParams(params);
    next.delete('edit');
    setParams(next, { replace: true });
  }, [meds, editId]);

  // 약이 하나도 없으면 바로 입력 폼을 연다
  useEffect(() => {
    if (meds && meds.length === 0 && draft === null) setDraft({ ...EMPTY_DRAFT });
  }, [meds]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!draft || !pet || busy) return;
    const problem = validateMedicationDraft(draft);
    setFormError(problem);
    if (problem) return;
    const input: MedicationInput = {
      name: draft.name.trim(),
      doseText: draft.doseText.trim() ? draft.doseText.trim() : null,
      times: [...draft.times].sort(),
    };
    setBusy(true);
    try {
      if (draft.id) {
        await petApi.updateMedication(draft.id, input);
        setCreatedId(null);
      } else {
        const created = await petApi.createMedication(pet.id, input);
        setCreatedId(created?.id ?? null);
      }
      setNotice(draft.id ? `${input.name} 정보를 고쳤어요.` : `${input.name}을(를) 등록했어요.`);
      setDraft(null);
      await load();
    } catch (err) {
      handleError(err, setFormError);
    } finally {
      setBusy(false);
    }
  }

  async function remove(med: Medication) {
    if (busy) return;
    setBusy(true);
    try {
      await petApi.deleteMedication(med.id);
      setConfirmDeleteId(null);
      setCreatedId(null);
      setNotice(`${med.name}을(를) 목록에서 뺐어요. 지난 기록은 그대로 남아요.`);
      await load();
    } catch (err) {
      handleError(err, setLoadError);
    } finally {
      setBusy(false);
    }
  }

  function setTime(i: number, value: string) {
    if (!draft) return;
    setDraft({ ...draft, times: draft.times.map((t, idx) => (idx === i ? value : t)) });
  }

  return (
    <div>
      <header className="topbar">
        {onboarding ? <span className="step">2 / 2</span> : <Link to="/today" className="btn-link">← 오늘로</Link>}
      </header>
      <main className="page">
        <h1>먹이는 약</h1>
        <p className="lead">
          {onboarding ? '먹이는 약이 있으면 등록해 주세요. 없으면 건너뛰어도 괜찮아요.' : '약을 추가하거나 고칠 수 있어요.'}
        </p>

        {loadError && (
          <p role="alert" className="error">
            {loadError}
          </p>
        )}
        {notice && (
          <div role="status" className="ok">
            <p>{notice}</p>
            {createdId && (
              <>
                <p>먹일 시간에 알림을 받아 볼까요?</p>
                <Link to={`/medications/${encodeURIComponent(createdId)}/reminder`} className="btn-secondary link-button">
                  알림 설정하기 ›
                </Link>
              </>
            )}
          </div>
        )}
        {meds === null && !loadError && <p aria-busy="true">불러오는 중…</p>}

        {meds && meds.length > 0 && (
          <ul className="med-list">
            {meds.map((m) => (
              <li key={m.id} className="card">
                <p className="med-name">
                  {m.name}
                  {m.doseText && <span className="muted"> · {m.doseText}</span>}
                </p>
                <p className="muted">{m.times.map(formatTime).join(' · ')}</p>
                <ReminderStatusLine
                  med={m}
                  reminder={reminders[m.id]}
                  deviceCannotReceive={cannotReceive(push.state)}
                />
                {confirmDeleteId === m.id ? (
                  <div className="row">
                    <span>목록에서 뺄까요? 지난 기록은 남아요.</span>
                    <button type="button" className="btn-secondary" onClick={() => remove(m)} disabled={busy}>
                      빼기
                    </button>
                    <button type="button" className="btn-link" onClick={() => setConfirmDeleteId(null)}>
                      그대로 두기
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="row">
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => {
                          setFormError(null);
                          setDraft({ id: m.id, name: m.name, doseText: m.doseText ?? '', times: [...m.times] });
                        }}
                      >
                        고치기
                      </button>
                      <Link
                        to={`/medications/${encodeURIComponent(m.id)}/reminder`}
                        className="btn-secondary link-button"
                      >
                        알림 설정
                      </Link>
                    </div>
                    {/* 지우는 동작이라 다음 줄 링크로 내려 실수 탭을 줄인다(화면 설계 3-1) */}
                    <button type="button" className="btn-link align-start" onClick={() => setConfirmDeleteId(m.id)}>
                      목록에서 빼기
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}

        {draft ? (
          <form className="card" onSubmit={onSubmit} noValidate aria-labelledby="med-form-title">
            <h2 id="med-form-title">{draft.id ? '약 고치기' : '약 추가'}</h2>
            <label htmlFor="med-name">약 이름</label>
            <input
              id="med-name"
              value={draft.name}
              maxLength={NAME_MAX}
              placeholder="예: 레나메진"
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
            <label htmlFor="med-dose">용량 (선택)</label>
            <input
              id="med-dose"
              value={draft.doseText}
              maxLength={DOSE_MAX}
              placeholder="예: 1포, 1/2정, 0.5ml"
              onChange={(e) => setDraft({ ...draft, doseText: e.target.value })}
            />
            <fieldset className="plain">
              <legend>하루에 먹이는 시각 (1~3개)</legend>
              {draft.id && <p className="notice">시각을 바꾸면 알림 시각도 같이 바뀌어요.</p>}
              {draft.times.map((t, i) => (
                <div className="row" key={i}>
                  <input
                    type="time"
                    aria-label={`${i + 1}번째 시각`}
                    value={t}
                    onChange={(e) => setTime(i, e.target.value)}
                  />
                  {draft.times.length > 1 && (
                    <button
                      type="button"
                      className="btn-link"
                      onClick={() => setDraft({ ...draft, times: draft.times.filter((_, idx) => idx !== i) })}
                    >
                      이 시각 빼기
                    </button>
                  )}
                </div>
              ))}
              {draft.times.length < MAX_TIMES && (
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setDraft({ ...draft, times: [...draft.times, '20:00'].slice(0, MAX_TIMES) })}
                >
                  + 시각 추가
                </button>
              )}
            </fieldset>
            <button type="submit" className="btn-primary" disabled={busy}>
              {busy ? '잠시만요…' : draft.id ? '고친 내용 저장' : '약 등록'}
            </button>
            {(meds?.length ?? 0) > 0 && (
              <button type="button" className="btn-link" onClick={() => setDraft(null)}>
                닫기
              </button>
            )}
            {formError && (
              <p role="alert" className="error">
                {formError}
              </p>
            )}
          </form>
        ) : (
          <button
            type="button"
            className="btn-secondary block"
            onClick={() => {
              setFormError(null);
              setNotice(null);
              setDraft({ ...EMPTY_DRAFT });
            }}
          >
            + 약 추가
          </button>
        )}

        <Link to="/today" className={`btn-primary block link-button ${onboarding ? '' : 'secondary-gap'}`}>
          {onboarding ? ((meds?.length ?? 0) > 0 ? '오늘 기록 시작하기' : '나중에 할게요 · 오늘 기록으로') : '오늘 화면으로'}
        </Link>
        <p className="disclaimer">{DISCLAIMER}</p>
      </main>
    </div>
  );
}

/** 약 카드의 알림 상태 줄 (화면 설계 3-2). 누르면 알림 설정으로 간다 */
function ReminderStatusLine({
  med,
  reminder,
  deviceCannotReceive,
}: {
  med: Medication;
  reminder: Reminder | 'error' | undefined;
  deviceCannotReceive: boolean;
}) {
  if (reminder === 'error') return null; // 불러오기 실패: 숨김([알림 설정] 버튼은 그대로)
  if (!reminder) {
    return (
      <p className="muted reminder-line" aria-busy="true">
        알림 확인 중…
      </p>
    );
  }
  const status = reminderStatus(reminder);
  const showDeviceLine = status.kind === 'on' && deviceCannotReceive;
  const times = med.times.map(formatTime).join('와 ');
  const label = [
    `${med.name} ${status.text.replace(/ · /g, ', ')}`,
    status.kind === 'on' ? times : '',
    showDeviceLine ? '이 기기에서는 받을 수 없어요' : '',
    '누르면 알림 설정으로 가요',
  ]
    .filter(Boolean)
    .join('. ');
  return (
    <Link
      to={`/medications/${encodeURIComponent(med.id)}/reminder`}
      className={`reminder-line is-${status.kind}`}
      aria-label={label}
    >
      <span>
        <span aria-hidden="true">{status.kind === 'off' ? '🔕 ' : '🔔 '}</span>
        {status.text}
      </span>
      {showDeviceLine && <span className="field-hint">이 기기에서는 받을 수 없어요 ›</span>}
    </Link>
  );
}
