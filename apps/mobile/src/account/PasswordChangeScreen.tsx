// 비밀번호 바꾸기 (/account/password) — 설계 4장
// 성공하면 응답의 새 accessToken 으로 즉시 교체한다(이전 토큰은 모두 401 이라 안 바꾸면 로그아웃된다).
// 입력칸이 3개라 Screen 의 footer 를 쓰지 않고 버튼을 스크롤 안 맨 아래에 둔다(키보드·큰 글씨에서 가려지지 않게).
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { AccessibilityInfo, Platform, type TextInput } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { NoticeCard, NoticeTitle } from '../components/NoticeCard';
import { AppButton, AppText, LinkButton, Screen } from '../components/ui';
import { classifyAccountError, hasFormErrors, validatePasswordChange, type PasswordChangeErrors } from '../lib/accountForm';
import { PASSWORD_MIN_LENGTH } from '../lib/loginForm';
import { useLeaveGuard } from '../medications/useLeaveGuard';
import { ScreenTop } from '../medications/ScreenTop';
import { accountApi } from '../services/client';
import { PasswordField, ShowPasswordToggle, useLockout } from './AccountParts';
import { ACCOUNT_HREF } from './routes';

export default function PasswordChangeScreen() {
  const router = useRouter();
  const { replaceToken } = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [errors, setErrors] = useState<PasswordChangeErrors>({});
  const [failure, setFailure] = useState<{ message: string; note: string | null } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [unsaved, setUnsaved] = useState(false); // 새 토큰을 기기에 저장하지 못함
  const [locked, lock] = useLockout();
  const submittingRef = useRef(false);
  const currentRef = useRef<TextInput>(null);
  const nextRef = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);

  const dirty = !done && Boolean(current || next || confirm);
  const { leaving, confirmLeave, stay, guard } = useLeaveGuard(dirty);
  const goAccount = () => guard(() => router.back());

  function clearError(key: keyof PasswordChangeErrors) {
    setErrors((e) => (e[key] ? { ...e, [key]: undefined } : e));
  }

  async function onSubmit() {
    if (submittingRef.current || locked) return;
    const found = validatePasswordChange({ currentPassword: current, newPassword: next, newPasswordConfirm: confirm });
    setErrors(found);
    setFailure(null);
    if (hasFormErrors(found)) {
      (found.currentPassword ? currentRef : found.newPassword ? nextRef : confirmRef).current?.focus();
      return;
    }
    submittingRef.current = true;
    setSubmitting(true);
    try {
      const res = await accountApi.changePassword({ currentPassword: current, newPassword: next });
      setUnsaved((await replaceToken(res.accessToken)) === false);
      setCurrent('');
      setNext('');
      setConfirm('');
      setShow(false);
      setDone(true);
      if (Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility('비밀번호를 바꿨어요.');
    } catch (err) {
      const f = classifyAccountError(err, 'password');
      if (f.sessionExpired) return; // 401: AuthContext 가 로그인 화면으로 보낸다
      if (f.field === 'current') {
        setErrors({ currentPassword: f.message });
        setCurrent('');
        currentRef.current?.focus();
      } else if (f.field === 'new') {
        setErrors({ newPassword: f.message });
        nextRef.current?.focus();
      } else {
        setFailure({ message: f.message, note: f.note });
      }
      if (f.lockSeconds !== null) lock(f.lockSeconds);
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <Screen>
        <ScreenTop backLabel="계정으로" backA11yLabel="계정으로 돌아가기" onBack={() => router.dismissTo({ pathname: ACCOUNT_HREF, params: { notice: 'password' } } as never)} title="비밀번호 바꾸기" />
        <NoticeCard kind="ok">
          <NoticeTitle ok>비밀번호를 바꿨어요.</NoticeTitle>
          <AppText>다음에 로그인할 때부터 새 비밀번호를 써 주세요.</AppText>
          {unsaved ? (
            <AppText>이 기기에 로그인 정보를 저장하지 못했어요. 앱을 다시 켜면 새 비밀번호로 로그인해 주세요.</AppText>
          ) : null}
        </NoticeCard>
        <AppButton
          label="계정으로 돌아가기"
          onPress={() => router.dismissTo({ pathname: ACCOUNT_HREF, params: { notice: 'password' } } as never)}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <ScreenTop
        backLabel="계정으로"
        backA11yLabel="계정으로 돌아가기"
        onBack={goAccount}
        title="비밀번호 바꾸기"
        lead={`새 비밀번호는 ${PASSWORD_MIN_LENGTH}자 이상으로 정해 주세요.`}
      />

      <PasswordField
        label="현재 비밀번호"
        kind="current"
        show={show}
        inputRef={currentRef}
        value={current}
        editable={!submitting}
        error={errors.currentPassword}
        returnKeyType="next"
        blurOnSubmit={false}
        onSubmitEditing={() => nextRef.current?.focus()}
        onChangeText={(v) => {
          setCurrent(v);
          clearError('currentPassword');
        }}
      />
      <PasswordField
        label={`새 비밀번호 (${PASSWORD_MIN_LENGTH}자 이상)`}
        kind="new"
        show={show}
        inputRef={nextRef}
        value={next}
        editable={!submitting}
        error={errors.newPassword}
        returnKeyType="next"
        blurOnSubmit={false}
        onSubmitEditing={() => confirmRef.current?.focus()}
        onChangeText={(v) => {
          setNext(v);
          clearError('newPassword');
        }}
      />
      <PasswordField
        label="새 비밀번호 확인"
        kind="new"
        show={show}
        inputRef={confirmRef}
        value={confirm}
        editable={!submitting}
        error={errors.newPasswordConfirm}
        returnKeyType="done"
        onSubmitEditing={() => void onSubmit()}
        onChangeText={(v) => {
          setConfirm(v);
          clearError('newPasswordConfirm');
        }}
      />
      <ShowPasswordToggle checked={show} onChange={setShow} disabled={submitting} />

      {failure ? (
        <NoticeCard kind="info" alert>
          <AppText style={{ fontWeight: '700' }}>{failure.message}</AppText>
          {failure.note ? <AppText>{failure.note}</AppText> : null}
        </NoticeCard>
      ) : null}

      <AppButton
        label={submitting ? '바꾸는 중…' : '비밀번호 바꾸기'}
        accessibilityLabel={submitting ? '바꾸는 중' : '비밀번호 바꾸기'}
        loading={submitting}
        disabled={locked}
        onPress={() => void onSubmit()}
      />
      <LinkButton label="취소" center onPress={goAccount} />

      {leaving ? (
        <NoticeCard kind="info" alert>
          <AppText style={{ fontWeight: '700' }}>저장하지 않고 나갈까요?</AppText>
          <AppButton label="계속 고치기" onPress={stay} />
          <AppButton label="나가기" variant="secondary" onPress={confirmLeave} />
        </NoticeCard>
      ) : null}
    </Screen>
  );
}
