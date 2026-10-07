import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import { AuthProvider } from './auth';
import { setServiceWorkerRegistration } from './push/webPush';
import './styles.css';

// 서비스워커 등록 (오프라인에서도 앱 껍데기를 표시 + 투약 알림 수신).
// 등록 결과는 푸시 모듈에 넘겨 FCM getToken 에 쓴다(서비스워커는 하나만 둔다).
registerSW({
  immediate: true,
  onRegisteredSW: (_url, registration) => setServiceWorkerRegistration(registration),
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
