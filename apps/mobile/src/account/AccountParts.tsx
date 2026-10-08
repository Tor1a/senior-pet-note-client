// 계정 화면들이 함께 쓰는 부품 (설계서 10장: PasswordField, ShowPasswordToggle, 처리방침 링크)
import { useEffect, useState } from 'react';
import { Linking, type TextInput, type TextInputProps } from 'react-native';
import type { RefObject } from 'react';
import { ChoiceButton, AppText, LinkButton, TextField } from '../components/ui';
import { NoticeCard } from '../components/NoticeCard';
import { PRIVACY_POLICY_URL } from './privacy';

/** 라벨 + 비밀번호 입력칸 + 칸 오류. 보기 상태는 부모가 내려 준다 */
export function PasswordField({
  label,
  show,
  kind,
  inputRef,
  ...rest
}: Omit<TextInputProps, 'secureTextEntry'> & {
  label: string;
  show: boolean;
  /** current: 현재/탈퇴 확인 비밀번호, new: 새 비밀번호 */
  kind: 'current' | 'new';
  error?: string;
  inputRef?: RefObject<TextInput | null>;
}) {
  return (
    <TextField
      {...rest}
      label={label}
      inputRef={inputRef}
      secureTextEntry={!show}
      autoCapitalize="none"
      autoCorrect={false}
      autoComplete={kind === 'current' ? 'current-password' : 'new-password'}
      textContentType={kind === 'current' ? 'password' : 'newPassword'}
    />
  );
}

/** 칸 전체를 한 번에 보이게 하는 체크 (높이 48 이상) */
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
    <>
      <ChoiceButton
        role="checkbox"
        label="비밀번호 보기"
        selected={checked}
        disabled={disabled}
        onPress={() => onChange(!checked)}
      />
      {checked ? <AppText variant="secondary">비밀번호가 화면에 보이고 있어요.</AppText> : null}
    </>
  );
}

/** 개인정보 처리방침 링크. 주소가 설정되지 않았으면 줄 전체를 그리지 않는다 */
export function PrivacyLink({ url = PRIVACY_POLICY_URL }: { url?: string | null }) {
  const [failed, setFailed] = useState(false);
  if (!url) return null;
  return (
    <>
      <LinkButton
        label="개인정보 처리방침 ↗"
        accessibilityLabel="개인정보 처리방침 보기, 브라우저에서 열려요"
        onPress={() => {
          setFailed(false);
          Linking.openURL(url).catch(() => setFailed(true));
        }}
      />
      {failed ? (
        <NoticeCard kind="info" alert>
          <AppText>링크를 열지 못했어요. 잠시 후 다시 시도해 주세요.</AppText>
        </NoticeCard>
      ) : null}
    </>
  );
}

/** 잠금(429): lock(초)을 주면 그 시간 동안 true */
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
