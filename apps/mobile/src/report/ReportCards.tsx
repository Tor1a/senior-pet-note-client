// 병원 방문 리포트 본문 카드들 (웹 ReportSheet 와 같은 순서·문구). 앱이 만든 문장은 lib/reportText.ts 가 만들고
// 여기서는 배치만 한다. 사용자 입력(메모, 약 이름, 증상 '기타' 내용)은 가공 없이 그대로 보여 준다.
// 근거: .company/design/병원-방문-리포트.md 4·11장
import { Pressable, View, useWindowDimensions } from 'react-native';
import { AppButton, AppText, Card, LARGE_FONT_SCALE } from '../components/ui';
import type { HistoryDay } from '../lib/petApi';
import { REPORT_TEXT as T, type ReportModel, type ReportWeightRow } from '../lib/reportText';
import { colors, spacing } from '../theme';
import WeightChart from '../history/WeightChart';

/** 표 한 줄을 스크린리더가 한 문장으로 읽게 한다: "10월 14일 (화), 체중 5.2킬로그램, 증상을 적음 구토" */
export function rowLabel(row: ReportWeightRow): string {
  const weight = row.weight === T.noRecord ? '체중 기록 없음' : `체중 ${row.weight.replace('kg', '킬로그램')}`;
  const symptom = row.symptom.startsWith('◆') ? `, 증상을 적음 ${row.symptom.slice(1).trim()}` : '';
  return `${row.dateLabel}, ${weight}${symptom}`;
}

function Heading({ children }: { children: string }) {
  return (
    <AppText variant="title" accessibilityRole="header">
      {children}
    </AppText>
  );
}

export function ReportCards({
  model,
  days,
  tableOpen,
  onToggleTable,
  onRetryMedications,
}: {
  model: ReportModel;
  days: HistoryDay[];
  tableOpen: boolean;
  onToggleTable: () => void;
  onRetryMedications: () => void;
}) {
  const { fontScale } = useWindowDimensions();
  const large = fontScale >= LARGE_FONT_SCALE;
  const hasWeight = model.weight.count > 0;

  const chart = hasWeight ? (
    <View style={{ gap: spacing.sm }}>
      <WeightChart days={days} />
      <AppText variant="caption">{T.legend}</AppText>
      <AppText variant="caption" style={{ fontWeight: '700' }}>
        {T.axisNote}
      </AppText>
    </View>
  ) : null;

  return (
    <View style={{ gap: spacing.md }}>
      <Card>
        <Heading>{T.glanceTitle}</Heading>
        <AppText style={{ fontWeight: '700' }}>{model.periodLine}</AppText>
        <AppText variant="secondary">{model.baseDateLine}</AppText>
        {model.glance.map((line) => (
          <AppText key={line}>{line}</AppText>
        ))}
        <AppText variant="caption">{T.source}</AppText>
      </Card>

      <Card>
        <Heading>{T.petTitle}</Heading>
        <AppText style={{ fontWeight: '700', fontSize: 22 }}>{model.petLine}</AppText>
        {model.conditionsLine ? <AppText>{model.conditionsLine}</AppText> : null}
      </Card>

      <Card>
        <Heading>{T.weightTitle}</Heading>
        {/* 요약 문장은 항상 그래프보다 위(큰 글씨 2.0+ 에서도 문장을 먼저 읽는다) */}
        {model.weight.lines.map((line, i) => (
          <AppText key={line} style={i === 0 && model.weight.lines.length > 1 ? { fontWeight: '700' } : undefined}>
            {line}
          </AppText>
        ))}
        {chart}
        {hasWeight && (
          <>
            <AppButton
              label={tableOpen ? '날짜별 체중 표 닫기' : '날짜별 체중 표 보기'}
              variant="secondary"
              onPress={onToggleTable}
            />
            {tableOpen && (
              <View style={{ gap: spacing.sm }} accessibilityLabel={`${model.petName} 최근 ${model.total}일 체중`}>
                {model.weight.rows.map((r) => (
                  <View
                    key={r.recordDate}
                    accessible
                    accessibilityLabel={rowLabel(r)}
                    style={{
                      borderTopWidth: 1,
                      borderColor: '#E8DFD4',
                      paddingTop: spacing.sm,
                      gap: 2,
                      flexDirection: large ? 'column' : 'row',
                      justifyContent: 'space-between',
                    }}
                  >
                    <AppText style={{ flex: large ? undefined : 1 }}>{r.dateLabel}</AppText>
                    <AppText style={{ fontWeight: '700' }}>{r.weight}</AppText>
                    {r.symptom !== '–' ? <AppText variant="secondary">{r.symptom}</AppText> : null}
                  </View>
                ))}
              </View>
            )}
          </>
        )}
      </Card>

      <Card>
        <Heading>{T.mealWaterTitle}</Heading>
        <AppText>{model.mealWater.food}</AppText>
        <AppText>{model.mealWater.water}</AppText>
        {model.mealWater.waterMl ? <AppText>{model.mealWater.waterMl}</AppText> : null}
      </Card>

      <Card>
        <Heading>{T.symptomTitle}</Heading>
        <AppText style={{ fontWeight: '700', fontSize: 24 }}>{model.symptoms.countLine}</AppText>
        {model.symptoms.empty ? <AppText variant="secondary">{model.symptoms.empty}</AppText> : null}
        {model.symptoms.items.map((s) => (
          <AppText key={s.dateLabel} accessibilityLabel={`증상을 적음, ${s.dateLabel} ${s.names}`}>
            {`◆ ${s.dateLabel} ${s.names}`}
          </AppText>
        ))}
        {model.symptoms.rest ? <AppText>{model.symptoms.rest}</AppText> : null}
        {model.symptoms.none ? <AppText variant="secondary">{model.symptoms.none}</AppText> : null}
      </Card>

      <Card>
        <Heading>{T.medicationTitle}</Heading>
        {model.medication.empty ? <AppText>{model.medication.empty}</AppText> : null}
        {model.medication.lines.map((line, i) => (
          <AppText
            key={line}
            variant={i === 0 && model.medication.lines.length > 3 ? 'body' : 'caption'}
            style={i === 0 && model.medication.lines.length > 3 ? { fontWeight: '700', fontSize: 24 } : undefined}
          >
            {line}
          </AppText>
        ))}
        <AppText style={{ fontWeight: '700' }} accessibilityRole="header">
          {T.medicationListTitle}
        </AppText>
        {model.medicationList.items.map((m) => (
          <View key={`${m.name}-${m.times}`} style={{ gap: 2 }}>
            <AppText>{m.name}</AppText>
            <AppText variant="secondary">{m.times}</AppText>
          </View>
        ))}
        {model.medicationList.message ? (
          <AppText accessibilityRole={model.medicationList.status === 'error' ? 'alert' : undefined}>
            {model.medicationList.message}
          </AppText>
        ) : null}
        {model.medicationList.status === 'error' ? (
          <AppButton label={T.retry} variant="secondary" onPress={onRetryMedications} />
        ) : null}
      </Card>

      <Card>
        <Heading>{T.memoTitle}</Heading>
        {model.memos.message ? <AppText variant="secondary">{model.memos.message}</AppText> : null}
        {model.memos.items.map((m) => (
          <View key={m.dateLabel} style={{ gap: 2 }}>
            <AppText style={{ fontWeight: '700' }}>{m.dateLabel}</AppText>
            <AppText>{m.memo}</AppText>
          </View>
        ))}
        {model.memos.rest ? <AppText>{model.memos.rest}</AppText> : null}
      </Card>

      {model.emptyDays ? (
        <Card>
          <Heading>{model.emptyDays.title}</Heading>
          <AppText>{model.emptyDays.dates}</AppText>
        </Card>
      ) : null}
    </View>
  );
}

/** 메모 포함 스위치: 켜짐/꺼짐을 색이 아니라 글자로도 알린다 (높이 56) */
export function MemoSwitch({ value, onChange, hint }: { value: boolean; onChange: (next: boolean) => void; hint: string }) {
  return (
    <View style={{ gap: 4 }}>
      <Pressable
        accessibilityRole="switch"
        accessibilityLabel={`${T.memoSwitch}, ${value ? '켜짐' : '꺼짐'}`}
        accessibilityState={{ checked: value }}
        onPress={() => onChange(!value)}
        style={({ pressed }) => [
          {
            minHeight: 56,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: spacing.md,
            borderWidth: 2,
            borderColor: colors.border,
            borderRadius: 8,
            backgroundColor: colors.surface,
          },
          pressed && { opacity: 0.6 },
        ]}
      >
        <AppText style={{ fontWeight: '700' }}>{T.memoSwitch}</AppText>
        <AppText style={{ fontWeight: '700' }}>{value ? '✓ 켜짐' : '꺼짐'}</AppText>
      </Pressable>
      <AppText variant="caption">{hint}</AppText>
    </View>
  );
}
