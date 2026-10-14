// F 처음 키워요 체크리스트 (/checklist) — 웹 ChecklistPage 와 같은 구성·문구
// 일반 목록 + 보호자가 직접 체크, 체크는 이 기기(secure-store)에만 저장한다. 서버 호출 없음.
// 진행률·완료 문구·정렬 변화 없음. 탭 선택은 저장하지 않는다(들어올 때마다 준비물부터).
// 큰 글씨(1.3+)는 탭을 세로로 쌓고 상태 글자를 본문 아래 줄로 옮긴다. 글자는 줄이지 않는다.
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View, useWindowDimensions } from 'react-native';
import { AppText, Screen } from '../components/ui';
import { checklistItemsFor, type ChecklistGroup } from '../lib/checklistContent';
import { isChecked, toggleChecked, type ChecklistData } from '../lib/checklistState';
import { CHECKLIST_TEXT as T } from '../lib/checklistText';
import { DISCLAIMER } from '../lib/constants';
import { goBackOr } from '../medications/routes';
import { isLargeFont } from '../medications/layout';
import { ScreenTop } from '../medications/ScreenTop';
import { usePet } from '../pet/PetProvider';
import { loadChecklist, saveChecklist } from '../services/checklistStorage';
import { colors, fontSize, spacing, touch } from '../theme';

const TABS: { group: ChecklistGroup; label: string }[] = [
  { group: 'prep', label: T.tabPrep },
  { group: 'ask', label: T.tabAsk },
];

const BOX = 28;

function ChecklistRow({
  text,
  checked,
  tall,
  large,
  onPress,
}: {
  text: string;
  checked: boolean;
  tall: boolean;
  large: boolean;
  onPress: () => void;
}) {
  const state = (
    <Text
      style={{
        fontSize: fontSize.body,
        color: checked ? colors.text : colors.textSecondary,
        fontWeight: checked ? '700' : '400',
        minWidth: large ? undefined : 72,
        textAlign: large ? 'left' : 'right',
      }}
    >
      {checked ? T.checked : T.unchecked}
    </Text>
  );
  return (
    <Pressable
      accessible
      accessibilityRole="checkbox"
      accessibilityLabel={text}
      accessibilityState={{ checked }}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm + 4,
        minHeight: tall ? 64 : touch.primaryHeight,
        paddingVertical: spacing.sm,
        paddingHorizontal: spacing.sm + 4,
        borderRadius: 12,
        borderWidth: checked ? 2 : 1,
        borderColor: checked ? colors.primary : '#e8dfd4',
        backgroundColor: pressed ? '#f4ece4' : colors.surface,
      })}
    >
      <View
        style={{
          width: BOX,
          height: BOX,
          borderRadius: 6,
          borderWidth: 2,
          borderColor: checked ? colors.primary : colors.textSecondary,
          backgroundColor: checked ? colors.primary : colors.surface,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {checked ? <Text style={{ color: colors.onPrimary, fontSize: fontSize.body, fontWeight: '700' }}>✓</Text> : null}
      </View>
      <View style={{ flex: 1, flexShrink: 1 }}>
        <Text
          style={{
            fontSize: fontSize.body,
            lineHeight: tall ? 29 : 25,
            color: colors.text,
            fontWeight: checked ? '600' : '400',
            flexShrink: 1,
          }}
        >
          {text}
        </Text>
        {large ? state : null}
      </View>
      {large ? null : state}
    </Pressable>
  );
}

export default function ChecklistScreen() {
  const router = useRouter();
  const { pet } = usePet();
  const petId = pet?.id ?? '';
  const { fontScale } = useWindowDimensions();
  const large = isLargeFont(fontScale);
  const [tab, setTab] = useState<ChecklistGroup>('prep');
  const [data, setData] = useState<ChecklistData>({});
  const alive = useRef(true);
  // 화면 메모리의 최신 상태(저장 실패·읽기 실패여도 유지). 읽기-병합-쓰기는 queue 로 한 줄씩 처리한다
  const latest = useRef<ChecklistData>({});
  const queue = useRef<Promise<void>>(Promise.resolve());

  const apply = (next: ChecklistData) => {
    latest.current = next;
    if (alive.current) setData(next);
  };
  const enqueue = (job: () => Promise<void>) => {
    queue.current = queue.current.then(job, job);
  };

  useEffect(() => {
    alive.current = true;
    enqueue(async () => {
      const saved = await loadChecklist();
      // petId 단위 합집합: 읽는 동안 화면에 있던 체크도, 저장된 체크도 잃지 않는다
      const merged: ChecklistData = { ...saved };
      for (const [id, ids] of Object.entries(latest.current)) {
        merged[id] = Array.from(new Set([...(saved[id] ?? []), ...ids]));
      }
      apply(merged);
    });
    return () => {
      alive.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const items = checklistItemsFor(tab, pet?.species);

  const toggle = (itemId: string) => {
    if (!petId) return;
    enqueue(async () => {
      // 저장소를 다시 읽어 다른 반려동물의 체크를 보존한다(읽기 실패 {} 면 화면 상태가 남는다)
      const stored = await loadChecklist();
      const base: ChecklistData = { ...latest.current, ...stored };
      const next = toggleChecked({ ...base, [petId]: stored[petId] ?? latest.current[petId] ?? [] }, petId, itemId);
      apply(next);
      await saveChecklist(next);
    });
  };

  return (
    <Screen>
      <ScreenTop
        backLabel="오늘로"
        backA11yLabel="오늘 화면으로 돌아가기"
        onBack={() => goBackOr(router, '/')}
        title={T.title}
        lead={T.notice}
      />
      <AppText variant="secondary">{T.saveNote}</AppText>

      <View
        accessibilityRole="tablist"
        accessibilityLabel={T.tabsLabel}
        style={{ flexDirection: large ? 'column' : 'row', gap: touch.gap }}
      >
        {TABS.map((t) => {
          const selected = tab === t.group;
          return (
            <Pressable
              key={t.group}
              accessibilityRole="tab"
              accessibilityLabel={t.label}
              accessibilityState={{ selected }}
              onPress={() => setTab(t.group)}
              style={{
                flex: large ? undefined : 1,
                minHeight: touch.primaryHeight,
                justifyContent: 'center',
                alignItems: 'center',
                paddingHorizontal: spacing.sm,
                borderRadius: 12,
                borderWidth: 2,
                borderColor: selected ? colors.primary : colors.textSecondary,
                backgroundColor: selected ? colors.primary : colors.surface,
              }}
            >
              <Text
                style={{
                  fontSize: fontSize.body,
                  textAlign: 'center',
                  fontWeight: selected ? '700' : '600',
                  color: selected ? colors.onPrimary : colors.text,
                }}
              >
                {t.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={{ gap: touch.gap }}>
        {items.map((item) => (
          <ChecklistRow
            key={item.id}
            text={item.text}
            checked={isChecked(data, petId, item.id)}
            tall={tab === 'ask'}
            large={large}
            onPress={() => toggle(item.id)}
          />
        ))}
      </View>

      <AppText variant="caption">{DISCLAIMER}</AppText>
    </Screen>
  );
}
