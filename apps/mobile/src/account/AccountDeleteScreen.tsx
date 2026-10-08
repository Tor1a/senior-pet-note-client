// 회원 탈퇴 (/account/delete) — 설계 5장. 3단계: 지워지는 내용 읽기(info) → 비밀번호 + 확인 체크(confirm) → 삭제 중(deleting)
// 되돌릴 수 없으므로 [그대로 두기]가 눈에 띄는 쪽(primary)이고, 삭제 중에는 입력·뒤로(시스템 뒤로·스와이프)를 잠근다.
// 입력 단계에서도 Screen 의 footer 를 쓰지 않는다(키보드·큰 글씨에서 버튼이 가려지지 않게).
import { useNavigation, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, findNodeHandle, Platform, View, type TextInput } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { NoticeCard } from '../components/NoticeCard';
import { AppButton, AppText, Card, ChoiceButton, LinkButton, Screen } from '../components/ui';
import { classifyAccountError, hasFormErrors, validateWithdraw, type WithdrawErrors } from '../lib/accountForm';
import { goBackOr } from '../medications/routes';
import { accountApi } from '../services/client';
import { PasswordField, PrivacyLink, ShowPasswordToggle, useLockout } from './AccountParts';
import { ACCOUNT_HREF } from './routes';

type Step = 'info' | 'confirm' | 'deleting';

export const SCOPE_ITEMS = [
  '계정(이메일, 비밀번호)',
  '반려동물 프로필과 사진',
  '등록한 약과 먹임 체크 기록',
  '매일 적은 체중·식사·물·증상·메모',
  '투약 알림 설정',
  '알림을 받던 기기 연결(이 휴대폰과 다른 기기 모두)',
];

const CONFIRM_TEXT = '지워지는 내용을 읽었고, 되돌릴 수 없다는 것을 알아요.';

export default function AccountDeleteScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { finishWithdrawal } = useAuth();
  const [step, setStep] = useState<Step>('info');
  const [password, setPassword] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [show, setShow] = useState(false);
  const [errors, setErrors] = useState<WithdrawErrors>({});
  const [failure, setFailure] = useState<{ message: string; note: string | null } | null>(null);
  const [slow, setSlow] = useState(false);
  const [backBlocked, setBackBlocked] = useState(false);
  const [locked, lock] = useLockout();
  const deleting = step === 'deleting';
  const deletingRef = useRef(false);
  const submittingRef = useRef(false);
  const headingRef = useRef<View>(null);
  const passwordRef = useRef<TextInput>(null);

  // 삭제 중에는 시스템 뒤로가기·iOS 스와이프 뒤로를 막는다
  useEffect(() => {
    const off = navigation.addListener('beforeRemove' as never, ((e: { preventDefault: () => void }) => {
      if (!deletingRef.current) return;
      e.preventDefault();
      setBackBlocked(true);
    }) as never);
    return off as unknown as () => void;
  }, [navigation]);
  useEffect(() => {
    (navigation as unknown as { setOptions?: (o: object) => void }).setOptions?.({ gestureEnabled: !deleting });
  }, [navigation, deleting]);

  // 3초 넘으면 "조금 오래 걸리고 있어요"
  useEffect(() => {
    if (!deleting) return;
    const t = setTimeout(() => setSlow(true), 3000);
    return () => clearTimeout(t);
  }, [deleting]);

  // 단계가 바뀌면 스크린리더 초점을 새 제목으로(비밀번호 칸에는 자동 포커스를 주지 않는다)
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const t = setTimeout(() => {
      const node = headingRef.current ? findNodeHandle(headingRef.current) : null;
      if (node) AccessibilityInfo.setAccessibilityFocus(node);
    }, 100);
    return () => clearTimeout(t);
  }, [step === 'info']); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (deleting) AccessibilityInfo.announceForAccessibility('계정과 기록을 지우는 중이에요');
  }, [deleting]);

  function backToStart() {
    setPassword('');
    setConfirmed(false);
    setShow(false);
    setErrors({});
    setFailure(null);
    setStep('info');
  }

  const stayAsIs = () => goBackOr(router, ACCOUNT_HREF);

  async function onSubmit() {
    if (submittingRef.current || locked) return;
    const found = validateWithdraw({ password, confirmed });
    setErrors(found);
    setFailure(null);
    if (hasFormErrors(found)) {
      if (found.password) passwordRef.current?.focus();
      return;
    }
    submittingRef.current = true;
    deletingRef.current = true;
    setSlow(false);
    setBackBlocked(false);
    setStep('deleting');
    try {
      await accountApi.withdraw(password);
    } catch (err) {
      deletingRef.current = false;
      submittingRef.current = false;
      const f = classifyAccountError(err, 'withdraw');
      setStep('confirm');
      if (f.sessionExpired) return; // 401: AuthContext 가 로그인 화면으로 보낸다
      if (f.field === 'current') {
        setErrors({ password: f.message });
        setPassword('');
        setTimeout(() => passwordRef.current?.focus(), 0);
      } else {
        setFailure({ message: f.message, note: f.note });
      }
      if (f.lockSeconds !== null) lock(f.lockSeconds);
      return;
    }
    deletingRef.current = false; // 화면이 정리될 때 beforeRemove 가 막지 않게
    setPassword('');
    await finishWithdrawal();
  }

  if (step === 'info') {
    return (
      <Screen>
        <LinkButton label="← 계정으로" accessibilityLabel="계정으로 돌아가기" onPress={stayAsIs} />
        <View ref={headingRef} accessible accessibilityRole="header">
          <AppText variant="title">회원 탈퇴</AppText>
        </View>
        <AppText style={{ fontWeight: '700' }}>탈퇴하면 계정과 모든 기록이 지워져요.</AppText>
        <AppText style={{ fontWeight: '700' }}>한 번 지우면 되돌릴 수 없어요.</AppText>

        <Card accent>
          <AppText accessibilityRole="header" style={{ fontWeight: '700' }}>
            지워지는 내용
          </AppText>
          {SCOPE_ITEMS.map((item) => (
            <AppText key={item}>{`・ ${item}`}</AppText>
          ))}
        </Card>
        <AppText variant="secondary">지운 기록은 다시 가져올 수 없어요.</AppText>

        <PrivacyLink />

        <AppButton label="그대로 두기" onPress={stayAsIs} />
        <AppButton label="탈퇴 계속하기 ›" accessibilityLabel="탈퇴 계속하기" variant="secondary" onPress={() => setStep('confirm')} />
      </Screen>
    );
  }

  return (
    <Screen>
      <LinkButton label="← 처음으로" accessibilityLabel="처음으로 돌아가기" disabled={deleting} onPress={backToStart} />
      <View ref={headingRef} accessible accessibilityRole="header">
        <AppText variant="title">탈퇴 확인</AppText>
      </View>
      <AppText variant="secondary">본인 확인을 위해 비밀번호를 입력해 주세요.</AppText>

      <PasswordField
        label="비밀번호"
        kind="current"
        show={show}
        inputRef={passwordRef}
        value={password}
        editable={!deleting}
        error={errors.password}
        returnKeyType="done"
        onSubmitEditing={() => void onSubmit()}
        onChangeText={(v) => {
          setPassword(v);
          setErrors((x) => ({ ...x, password: undefined }));
        }}
      />
      <ShowPasswordToggle checked={show} onChange={setShow} disabled={deleting} />

      <ChoiceButton
        role="checkbox"
        tall
        label={CONFIRM_TEXT}
        selected={confirmed}
        disabled={deleting}
        onPress={() => {
          setConfirmed(!confirmed);
          setErrors((x) => ({ ...x, confirmed: undefined }));
        }}
      />
      {errors.confirmed ? (
        <AppText variant="secondary" accessibilityLiveRegion="polite">{`! ${errors.confirmed}`}</AppText>
      ) : null}

      {deleting ? (
        <NoticeCard kind="info">
          <AppText>계정과 기록을 지우는 중이에요.</AppText>
          <AppText>끝날 때까지 이 화면을 닫지 말아 주세요.</AppText>
          {slow ? <AppText>조금 오래 걸리고 있어요.</AppText> : null}
          {backBlocked ? <AppText>지우는 중이라 화면을 닫을 수 없어요.</AppText> : null}
        </NoticeCard>
      ) : null}
      {failure ? (
        <NoticeCard kind="info" alert>
          <AppText style={{ fontWeight: '700' }}>{failure.message}</AppText>
          {failure.note ? <AppText>{failure.note}</AppText> : null}
        </NoticeCard>
      ) : null}

      <AppButton label="그대로 두기" disabled={deleting} onPress={stayAsIs} />
      <AppButton
        label={deleting ? '탈퇴하는 중…' : '탈퇴하기'}
        accessibilityLabel={deleting ? '탈퇴하는 중' : '탈퇴하기'}
        variant="secondary"
        loading={deleting}
        disabled={locked}
        onPress={() => void onSubmit()}
      />
    </Screen>
  );
}
