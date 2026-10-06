import { Navigate, Outlet, Route, Routes } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from './auth';
import { apiConfig } from './lib/config';
import { PetProvider, usePet } from './pet';
import LoginPage from './pages/LoginPage';
import TodayPage from './pages/TodayPage';
import PetFormPage from './pages/PetFormPage';
import MedicationsPage from './pages/MedicationsPage';
import SetupNeededPage from './pages/SetupNeededPage';
import ServerDownPage from './pages/ServerDownPage';

// 라우팅
//   /login       : 로그인·회원가입 (이미 로그인돼 있으면 /today 로)
//   /pets/new    : 반려동물 등록 (온보딩 1/2). 이미 있으면 /today 로
//   /medications : 약 관리 (온보딩 2/2 이면 ?onboarding=1)
//   /pet         : 프로필 수정(사진 교체·삭제, 로그아웃)
//   /today       : "오늘" 기록 화면
//   로그인 안 됨 → /login, 반려동물 없음 → /pets/new
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
            <PetProvider>
              <Outlet />
            </PetProvider>
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
