import { Navigate, Outlet, Route, Routes } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from './auth';
import { apiConfig } from './lib/config';
import { PetProvider, usePet } from './pet';
import LoginPage from './pages/LoginPage';
import TodayPage from './pages/TodayPage';
import PetFormPage from './pages/PetFormPage';
import MedicationsPage from './pages/MedicationsPage';
import ReminderPage from './pages/ReminderPage';
import HistoryPage from './pages/HistoryPage';
import HistoryDayPage from './pages/HistoryDayPage';
import ReportPage from './pages/ReportPage';
import AccountPage from './pages/AccountPage';
import PasswordChangePage from './pages/PasswordChangePage';
import AccountDeletePage from './pages/AccountDeletePage';
import { PushProvider } from './push/PushProvider';
import SetupNeededPage from './pages/SetupNeededPage';
import ServerDownPage from './pages/ServerDownPage';

// 라우팅
//   /login       : 로그인·회원가입 (이미 로그인돼 있으면 /today 로)
//   /pets/new    : 반려동물 등록 (온보딩 1/2). 이미 있으면 /today 로
//   /medications : 약 관리 (온보딩 2/2 이면 ?onboarding=1, 약 고치기 폼 바로 열기 ?edit=<약 id>)
//   /medications/:id/reminder : 투약 알림 설정
//   /history     : 지난 기록 보기(7일/30일, 체중 그래프)
//   /history/:recordDate : 하루 상세(읽기 전용)
//   /report      : 병원 방문 리포트(7/14/30일, 인쇄). ?range=7|14|30&from=history
//   /pet         : 프로필 수정(사진 교체·삭제, 로그아웃)
//   /account, /account/password, /account/delete : 계정 · 비밀번호 바꾸기 · 회원 탈퇴 (반려동물이 없어도 열린다)
//   /today       : "오늘" 기록 화면 (알림을 눌러 열면 ?source=push)
//   로그인 안 됨 → /login, 반려동물 없음 → /pets/new
//   로그인한 화면은 PushProvider 안에 있다(이 기기 알림 상태, 기기 등록, 포그라운드 배너)
export default function App() {
  // API 주소 환경변수가 잘못되면 앱이 죽지 않고 안내 화면만 보여 준다
  if (!apiConfig.ok) return <SetupNeededPage message={apiConfig.message} />;

  return (
    <Routes>
      <Route
        path="/login"
        element={
          <GuestOnly>
            <LoginPage />
          </GuestOnly>
        }
      />
      <Route
        element={
          <RequireAuth>
            <PushProvider>
              <PetProvider>
                <Outlet />
              </PetProvider>
            </PushProvider>
          </RequireAuth>
        }
      >
        <Route
          path="/pets/new"
          element={
            <PetGate need="any">
              <PetFormPage mode="new" />
            </PetGate>
          }
        />
        <Route path="/account" element={<AccountPage />} />
        <Route path="/account/password" element={<PasswordChangePage />} />
        <Route path="/account/delete" element={<AccountDeletePage />} />
        <Route
          path="/pet"
          element={
            <PetGate need="ready">
              <PetFormPage mode="edit" />
            </PetGate>
          }
        />
        <Route
          path="/medications"
          element={
            <PetGate need="ready">
              <MedicationsPage />
            </PetGate>
          }
        />
        <Route
          path="/medications/:id/reminder"
          element={
            <PetGate need="ready">
              <ReminderPage />
            </PetGate>
          }
        />
        <Route
          path="/history"
          element={
            <PetGate need="ready">
              <HistoryPage />
            </PetGate>
          }
        />
        <Route
          path="/history/:recordDate"
          element={
            <PetGate need="ready">
              <HistoryDayPage />
            </PetGate>
          }
        />
        <Route
          path="/report"
          element={
            <PetGate need="ready">
              <ReportPage />
            </PetGate>
          }
        />
        <Route
          path="/today"
          element={
            <PetGate need="ready">
              <TodayPage />
            </PetGate>
          }
        />
      </Route>
      <Route path="*" element={<Navigate to="/today" replace />} />
    </Routes>
  );
}

function Loading() {
  return (
    <main className="page center" aria-busy="true">
      <p>불러오는 중…</p>
    </main>
  );
}

function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  if (status === 'loading') return <Loading />;
  if (status === 'offline') return <ServerDownPage />;
  if (status === 'signedOut') return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function GuestOnly({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  if (status === 'loading') return <Loading />;
  if (status === 'offline') return <ServerDownPage />;
  if (status === 'signedIn') return <Navigate to="/today" replace />;
  return <>{children}</>;
}

/** 반려동물 유무에 따라 화면을 보낸다. need=ready 는 pet 필요, any 는 로딩만 기다린다(등록 화면은 스스로 판단) */
function PetGate({ need, children }: { need: 'ready' | 'any'; children: ReactNode }) {
  const { status, reload } = usePet();
  if (status === 'loading') return <Loading />;
  if (status === 'offline') return <ServerDownPage onRetry={() => void reload()} />;
  if (status === 'error') {
    return (
      <main className="page" role="alert">
        <h1>정보를 불러오지 못했어요</h1>
        <p>잠시 후 다시 시도해 주세요.</p>
        <button type="button" className="btn-primary block" onClick={() => void reload()}>
          다시 시도
        </button>
      </main>
    );
  }
  if (need === 'ready' && status === 'none') return <Navigate to="/pets/new" replace />;
  return <>{children}</>;
}
