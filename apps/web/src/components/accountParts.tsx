import { useEffect, useState } from 'react';
import { resolvePrivacyPolicyUrl } from '../lib/privacyConfig';

// 계정 화면들이 함께 쓰는 부품 (설계서 10장: PasswordField, ShowPasswordToggle, 처리방침 링크)

/** 라벨 + 비밀번호 입력칸 + 칸 오류. 보기 상태는 부모가 내려 준다 */
export function PasswordField({
  id,
  label,
  value,
  onChange,
  show,
  autoComplete,
  error,
  disabled,
  inputRef,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  show: boolean;
  autoComplete: 'current-password' | 'new-password';
  error?: string;
  disabled?: boolean;
  inputRef?: (el: HTMLInputElement | null) => void;
}) {
  return (
    <>
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        name={id}
        ref={inputRef}
        type={show ? 'text' : 'password'}
        autoComplete={autoComplete}
        autoCapitalize="off"
        spellCheck={false}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
      />
      {error && (
        <p id={`${id}-error`} className="field-error">
          <span aria-hidden="true">! </span>
          {error}
        </p>
      )}
    </>
  );
}

/** 칸 전체를 한 번에 보이게 하는 체크박스 */
export function ShowPasswordToggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="check-row">
      <label className="check-label">
        <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
        <span>비밀번호 보기</span>
      </label>
      {checked && <p className="muted small">비밀번호가 화면에 보이고 있어요.</p>}
    </div>
  );
}

/** 개인정보 처리방침 링크. 주소가 설정되지 않았으면 줄 전체를 그리지 않는다 */
export function PrivacyLink() {
  const url = resolvePrivacyPolicyUrl(import.meta.env.VITE_PRIVACY_POLICY_URL);
  if (!url) return null;
  return (
    <p className="privacy-row">
      <a href={url} target="_blank" rel="noopener noreferrer" className="btn-link privacy-link">
        개인정보 처리방침 <span aria-hidden="true">↗</span>
        <span className="sr-only"> 새 창에서 열려요</span>
      </a>
    </p>
  );
}

/** 잠금(429): lock(초)을 주면 그 시간 동안 true. 0/null 이면 풀림 */
export function useLockout(): [boolean, (seconds: number) => void] {
  const [until, setUntil] = useState<number | null>(null);
  const [locked, setLocked] = useState(false);
  useEffect(() => {
    if (until === null) return;
    const left = until - Date.now();
    if (left <= 0) {
      setLocked(false);
      return;
    }
    setLocked(true);
    const timer = setTimeout(() => {
      setLocked(false);
      setUntil(null);
    }, left);
    return () => clearTimeout(timer);
  }, [until]);
  return [locked, (seconds) => setUntil(Date.now() + seconds * 1000)];
}
