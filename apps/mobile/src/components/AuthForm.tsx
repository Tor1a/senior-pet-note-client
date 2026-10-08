// 로그인·회원가입 공통 폼
// 입력 검증 규칙(validateLoginForm)과 오류 문구(toUserMessage)는 웹과 같은 src/lib 을 쓴다.

import { useEffect, useRef, useState } from 'react';
import { Link } from 'expo-router';
import { AccessibilityInfo, findNodeHandle, Pressable, StyleSheet, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { toUserMessage } from '../lib/api';
import { DISCLAIMER } from '../lib/constants';
import { hasErrors, PASSWORD_MIN_LENGTH, validateLoginForm, type AuthMode, type LoginFormErrors } from '../lib/loginForm';
import { apiConfig } from '../services/client';
import { NoticeCard, NoticeTitle } from './NoticeCard';
import { colors, spacing, touch } from '../theme';
import { AppButton, AppText, Screen, TextField } from './ui';

export function AuthForm({ mode }: { mode: AuthMode }) {
  const { authenticate, farewell, clearFarewell } = useAuth();
  const farewellRef = useRef<View>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [errors, setErrors] = useState<LoginFormErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const isSignup = mode === 'signup';

  // 로그인·가입 화면을 떠나면(모드 전환 포함) 탈퇴 안내는 사라진다
  useEffect(() => clearFarewell, [clearFarewell]);

  // 탈퇴 직후에는 완료 안내로 스크린리더 초점을 옮긴다(이메일 칸보다 먼저 읽힌다)
  useEffect(() => {
    if (!farewell) return;
    const t = setTimeout(() => {
      const node = farewellRef.current ? findNodeHandle(farewellRef.current) : null;
      if (node) AccessibilityInfo.setAccessibilityFocus(node);
    }, 100);
    return () => clearTimeout(t);
  }, [farewell]);

  async function submit() {
    const nextErrors = validateLoginForm({ email, password, passwordConfirm }, mode);
    setErrors(nextErrors);
    setServerError(null);
    if (hasErrors(nextErrors)) return;
    setSubmitting(true);
    try {
      await authenticate(mode, email, password);
      // 성공하면 _layout 의 Stack.Protected 가 오늘 화면으로 보낸다
    } catch (err) {
      setServerError(toUserMessage(err, mode));
      setSubmitting(false);
    }
  }

  return (
    <Screen>
      <AppText variant="title" accessibilityRole="header">
        {isSignup ? '회원가입' : '시니어펫 노트 로그인'}
      </AppText>

      {farewell ? (
        <View ref={farewellRef} accessible accessibilityLabel="탈퇴가 끝났어요. 계정과 기록을 모두 지웠어요. 이용해 주셔서 감사합니다.">
          <NoticeCard kind="ok">
            <NoticeTitle ok>탈퇴가 끝났어요.</NoticeTitle>
            <AppText>계정과 기록을 모두 지웠어요.</AppText>
            <AppText>이용해 주셔서 감사합니다.</AppText>
          </NoticeCard>
        </View>
      ) : null}

      {!apiConfig.ok ? (
        <AppText style={styles.notice} accessibilityRole="alert">
          {`환경변수 설정이 필요해요: ${apiConfig.message}`}
        </AppText>
      ) : null}

      <TextField
        label="이메일"
        value={email}
        onChangeText={setEmail}
        error={errors.email}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        keyboardType="email-address"
        textContentType="emailAddress"
        placeholder="you@example.com"
      />
      <TextField
        label={isSignup ? `비밀번호 (${PASSWORD_MIN_LENGTH}자 이상)` : '비밀번호'}
        value={password}
        onChangeText={setPassword}
        error={errors.password}
        secureTextEntry
        autoCapitalize="none"
        autoComplete={isSignup ? 'new-password' : 'current-password'}
        textContentType={isSignup ? 'newPassword' : 'password'}
      />
      {isSignup ? (
        <TextField
          label="비밀번호 확인"
          value={passwordConfirm}
          onChangeText={setPasswordConfirm}
          error={errors.passwordConfirm}
          secureTextEntry
          autoCapitalize="none"
          autoComplete="new-password"
          textContentType="newPassword"
        />
      ) : null}

      {serverError ? (
        <AppText style={styles.notice} accessibilityRole="alert">
          {serverError}
        </AppText>
      ) : null}

      <AppButton label={isSignup ? '가입하기' : '로그인'} onPress={submit} loading={submitting} />

      <View style={styles.switchRow}>
        <AppText variant="secondary">{isSignup ? '이미 계정이 있나요?' : '처음이신가요?'}</AppText>
        <Link href={isSignup ? '/login' : '/signup'} replace asChild>
          <Pressable style={styles.link} accessibilityRole="link" hitSlop={4}>
            <AppText style={styles.linkText}>{isSignup ? '로그인하기' : '회원가입하기'}</AppText>
          </Pressable>
        </Link>
      </View>

      <AppText variant="caption" style={styles.disclaimer}>
        {DISCLAIMER}
      </AppText>
    </Screen>
  );
}

const styles = StyleSheet.create({
  notice: {
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: 10,
    padding: spacing.sm,
    backgroundColor: colors.surface,
  },
  switchRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: touch.gap },
  // 링크도 터치 영역 48 이상
  link: { minHeight: touch.minSize, minWidth: touch.minSize, justifyContent: 'center', paddingHorizontal: 4 },
  linkText: { fontWeight: '700', textDecorationLine: 'underline' },
  disclaimer: { marginTop: 'auto' },
});
