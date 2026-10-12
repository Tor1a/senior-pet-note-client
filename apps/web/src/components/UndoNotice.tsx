import { useEffect, useRef, useState } from 'react';

// 되돌리기 안내 (설계 .company/design/저장-되돌리기.md 3-6, 8장). 일일 기록 저장 되돌리기와 투약 [다시 체크]가 함께 쓴다.
// - ok 는 `.ok`(✓ 글자 + 초록 테두리), 실패(error)는 `.error`(ⓘ 안내). 빨강·검정 토스트를 쓰지 않는다.
// - autoDismissMs 가 있으면 그 시간 뒤 onDismiss. 마우스를 올리거나 키보드 포커스가 안에 있는 동안은 멈춘다.
// - 되돌리기 버튼이 있는 안내는 시간 제한을 두지 않는다(autoDismissMs 생략). Esc 로 닫히지 않는다(실수로 치우지 않게).

export interface UndoNoticeProps {
  message: string;
  /** ok: 성공·결과 / error: 되돌리지 못함(role=alert) */
  tone?: 'ok' | 'error';
  actionLabel?: string;
  onAction?: () => void;
  /** 되돌리는 중: 버튼 이름을 busyLabel 로 바꾸고 누를 수 없게 한다 */
  busy?: boolean;
  busyLabel?: string;
  /** 다른 작업(저장 중 등) 때문에 지금은 누를 수 없음: 버튼을 비활성으로 하고 disabledNote 를 보여 준다 */
  disabled?: boolean;
  disabledNote?: string;
  closeLabel?: string;
  onClose?: () => void;
  autoDismissMs?: number;
  onDismiss?: () => void;
}

export default function UndoNotice({
  message,
  tone = 'ok',
  actionLabel,
  onAction,
  busy = false,
  busyLabel,
  disabled = false,
  disabledNote,
  closeLabel = '닫기',
  onClose,
  autoDismissMs,
  onDismiss,
}: UndoNoticeProps) {
  // 마우스 올림과 키보드 포커스를 따로 센다(한쪽이 풀려도 다른 쪽이 남아 있으면 계속 멈춘다)
  const [hover, setHover] = useState(false);
  const [focusIn, setFocusIn] = useState(false);
  const paused = hover || focusIn;
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;

  useEffect(() => {
    if (!autoDismissMs || paused) return;
    const t = window.setTimeout(() => dismissRef.current?.(), autoDismissMs);
    return () => window.clearTimeout(t);
  }, [autoDismissMs, paused, message]);

  return (
    <div
      className={`undo-notice ${tone === 'ok' ? 'ok' : 'error'}`}
      role={tone === 'error' ? 'alert' : 'status'}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocus={() => setFocusIn(true)}
      onBlur={(e) => {
        // 안내 안의 버튼 사이로 Tab 이동할 때는 계속 멈춰 둔다. 포커스가 밖으로 나갈 때만 푼다
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocusIn(false);
      }}
    >
      <p className="undo-message">
        {tone === 'ok' && <span aria-hidden="true">✓ </span>}
        {message}
      </p>
      {actionLabel && disabled && disabledNote && <p className="muted undo-note">{disabledNote}</p>}
      {(actionLabel || onClose) && (
        <div className="undo-actions">
          {actionLabel && (
            <button
              type="button"
              className="btn-secondary"
              disabled={disabled}
              aria-disabled={busy || undefined}
              onClick={() => {
                if (!busy && !disabled) onAction?.();
              }}
            >
              {busy ? (busyLabel ?? actionLabel) : actionLabel}
            </button>
          )}
          {onClose && (
            <button type="button" className="btn-secondary" onClick={onClose}>
              {closeLabel}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
