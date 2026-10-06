// 회원가입 화면 (이메일 + 비밀번호 8자 이상 + 확인)
import { AuthForm } from '../components/AuthForm';

export default function SignupScreen() {
  return <AuthForm mode="signup" />;
}
