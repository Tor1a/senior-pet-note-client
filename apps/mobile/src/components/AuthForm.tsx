// 로그인·회원가입 공통 폼
// 입력 검증 규칙(validateLoginForm)과 오류 문구(toUserMessage)는 웹과 같은 src/lib 을 쓴다.

import { useState } from 'react';
import { Link } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { toUserMessage } from '../lib/api';
import { DISCLAIMER } from '../lib/constants';
import { hasErrors, PASSWORD_MIN_LENGTH, validateLoginForm, type AuthMode, type LoginFormErrors } from '../lib/loginForm';
import { apiConfig } from '../services/client';
import { colors, spacing, touch } from '../theme';
import { AppButton, AppText, Screen, TextField } from './ui';

export function AuthForm({ mode }: { mode: AuthMode }) {
  const { authenticate } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [errors, setErrors] = useState<LoginFormErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const isSignup = mode === 'signup';

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
