import { useEffect, useId, useRef, type ReactNode } from 'react';

// 확인 카드 틀 (설계 .company/design/저장-되돌리기.md 4-3, 7-3). 체중 숫자 확인(인라인)과 이탈 확인(대화상자 안)이 함께 쓴다.
// - 제목·본문·버튼 2개. 안전한 쪽이 위·주 버튼(primary), 반대쪽은 secondary. 버튼은 항상 세로.
// - 열리면 제목으로 포커스를 옮긴다(첫 Tab 은 주 버튼). 색만으로 구분하지 않도록 `.error` 의 "ⓘ 안내" 글자를 쓴다.
// - Esc 는 아무 일도 하지 않는다(onEscape 를 주면 그 동작). 닫기·고르기는 사용자가 버튼으로만 한다.

export interface ConfirmCardProps {
  title: string;
  children?: ReactNode;
  primaryLabel: string;
  onPrimary: () => void;
  secondaryLabel: string;
  onSecondary: () => void;
  /** 열릴 때 제목에 포커스(기본 true) */
  focusOnOpen?: boolean;
  /** 대화상자 안이면 alertdialog, 인라인이면 alert */
  role?: 'alert' | 'alertdialog';
  onEscape?: () => void;
  /** 스크린리더가 카드에 들어올 때 읽을 전체 문장(없으면 제목+본문) */
  speech?: string;
  /** 인라인 카드가 열릴 때 화면 가운데로 */
  scrollIntoView?: boolean;
  disabled?: boolean;
}

export default function ConfirmCard({
  title,
  children,
  primaryLabel,
  onPrimary,
  secondaryLabel,
  onSecondary,
  focusOnOpen = true,
  role = 'alert',
  onEscape,
  speech,
  scrollIntoView = false,
  disabled = false,
}: ConfirmCardProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLParagraphElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (scrollIntoView) rootRef.current?.scrollIntoView?.({ block: 'center' });
    if (focusOnOpen) titleRef.current?.focus({ preventScroll: true });
  }, [focusOnOpen, scrollIntoView]);

  return (
    <div
      ref={rootRef}
      className="error confirm-card-box"
      role={role}
      aria-modal={role === 'alertdialog' ? true : undefined}
      aria-label={speech}
      aria-labelledby={speech ? undefined : titleId}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && onEscape) {
          e.stopPropagation();
          onEscape();
        }
      }}
    >
      <p id={titleId} className="strong confirm-title" tabIndex={-1} ref={titleRef}>
        {title}
      </p>
      {children}
      <button type="button" className="btn-primary" disabled={disabled} onClick={onPrimary}>
        {primaryLabel}
      </button>
      <button type="button" className="btn-secondary" disabled={disabled} onClick={onSecondary}>
        {secondaryLabel}
      </button>
    </div>
  );
}
