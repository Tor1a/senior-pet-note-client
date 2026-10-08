// 화면 맨 아래: 투약 알림 받기 카드 + [약 관리 · 알림 설정] + 로그아웃 (자리표시 화면에서 옮겨 옴. 기능 삭제 금지)
// - [알림 받기](권한 요청)는 그대로 둔다. 알림 규칙은 약 관리 화면(/medications)에서 정한다.
// - onManage 가 있을 때만 약 관리 진입 버튼을 보인다(반려동물이 없는 안내 화면에서는 약을 등록할 수 없어 숨김).
//   카드가 숨는 상태(unavailable·checking)에서도 약 관리에는 갈 수 있어야 하므로 버튼은 카드 밖에 둔다.
import { useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { AppButton, AppText, Card } from '../../components/ui';
import { usePush } from '../../push/pushContext';

export function DeviceFooter({ onManage }: { onManage?: () => void }) {
  const { signOut } = useAuth();
  const { state, requestPermission, recheck } = usePush();
  const [signingOut, setSigningOut] = useState(false);
  const [asking, setAsking] = useState(false);

  return (
    <>
      {state !== 'unavailable' && state !== 'checking' && (
        <Card>
          <AppText style={{ fontWeight: '700' }}>투약 알림 받기</AppText>
          {state === 'registered' || state === 'registering' ? (
            <AppText>이 휴대폰으로 투약 알림을 받아요.</AppText>
          ) : state === 'denied' ? (
            <AppText>알림이 막혀 있어요. 휴대폰 설정에서 이 앱의 알림을 허용해 주세요.</AppText>
          ) : (
            <>
              <AppText>약 먹일 시간에 알려 드려요. 알림을 받으려면 다음 화면에서 허용해 주세요.</AppText>
              {state === 'error' && <AppText variant="secondary">알림 등록에 실패했어요. 다시 시도해 주세요.</AppText>}
              <AppButton
                label={state === 'error' ? '다시 시도' : '알림 받기'}
                loading={asking}
                onPress={async () => {
                  setAsking(true);
                  await (state === 'error' ? recheck() : requestPermission());
                  setAsking(false);
                }}
              />
            </>
          )}
        </Card>
      )}

      {onManage ? <AppButton label="약 관리 · 알림 설정" variant="secondary" onPress={onManage} /> : null}

      <AppButton
        label="로그아웃"
        variant="secondary"
        loading={signingOut}
        onPress={async () => {
          setSigningOut(true);
          await signOut(); // 성공하면 _layout 이 로그인 화면으로 보낸다
        }}
      />
    </>
  );
}
