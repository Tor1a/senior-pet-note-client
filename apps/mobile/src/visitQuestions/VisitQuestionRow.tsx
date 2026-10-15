// 진료 때 물어볼 것 한 줄: 남은 줄 / 접힌 줄(방금 체크) / 물어본 줄 / 고치는 줄 / 지우기 확인 줄 (웹 VisitQuestionRow 와 같은 구성)
// 사용자 글은 가공·검열·말줄임 없이 그대로 보여 준다(줄 수 제한 없음). 체크 상태는 ✓ + 글자 `물어봤어요`로 알린다(색에 의존하지 않음).
// 표시만 한다. 서버 호출과 상태는 VisitQuestionsScreen 이 가진다. 모든 버튼 높이 56, 큰 글씨(1.3+)는 버튼을 세로로 쌓는다.
import { View } from 'react-native';
import { ConfirmCard } from '../components/ConfirmCard';
import { AppButton, AppInput, AppText, Card } from '../components/ui';
import { countText } from '../lib/todoText';
import type { VisitQuestion } from '../lib/visitQuestionApi';
import { visitQuestionLength } from '../lib/visitQuestionForm';
import {
  doneLabel,
  editLabel,
  removeLabel,
  saveEditLabel,
  undoLabel,
  VISIT_QUESTION_COUNT_MAX,
  VISIT_QUESTION_TEXT as T,
} from '../lib/visitQuestionText';
import { spacing } from '../theme';

export type VisitQuestionRowMode = 'open' | 'collapsed' | 'done';
export type VisitQuestionBusy = 'done' | 'undo' | 'save' | 'remove';

export interface VisitQuestionRowProps {
  q: VisitQuestion;
  mode: VisitQuestionRowMode;
  busy: VisitQuestionBusy | null;
  /** 큰 글씨(1.3+)면 버튼을 세로로 쌓는다 */
  large: boolean;
  /** 줄 안 오류(체크·되돌리기 실패) */
  error: string | null;
  /** null 이 아니면 고치는 중 */
  editDraft: string | null;
  /** 고치기 입력의 오류 문구(비어 있음·100자 초과·저장 실패) */
  editError: string | null;
  confirmingRemove: boolean;
  onDone: () => void;
  onUndo: () => void;
  onEditStart: () => void;
  onEditChange: (value: string) => void;
  onEditSave: () => void;
  onEditCancel: () => void;
  onRemoveAsk: () => void;
  onRemoveYes: () => void;
  onRemoveNo: () => void;
}

const userText = { fontWeight: '400' as const, flexShrink: 1 };

export default function VisitQuestionRow(p: VisitQuestionRowProps) {
  const { q, mode, busy, large } = p;
  const actions = (children: React.ReactNode) => (
    <View style={{ flexDirection: large ? 'column' : 'row', gap: large ? spacing.sm : 12 }}>{children}</View>
  );
  const cell = (node: React.ReactNode, key: string) => (
    <View key={key} style={large ? undefined : { flex: 1 }}>
      {node}
    </View>
  );
  const errorNode = p.error ? <AppText variant="secondary" accessibilityRole="alert">{`! ${p.error}`}</AppText> : null;

  if (p.confirmingRemove) {
    return (
      <Card>
        <AppText style={userText}>{q.text}</AppText>
        <ConfirmCard
          title={T.removeTitle}
          primaryLabel={T.removeNo}
          onPrimary={p.onRemoveNo}
          secondaryLabel={busy === 'remove' ? T.removing : T.removeYes}
          onSecondary={p.onRemoveYes}
          disabled={busy === 'remove'}
        >
          <AppText>{T.removeBody}</AppText>
          {errorNode}
        </ConfirmCard>
      </Card>
    );
  }

  if (p.editDraft !== null) {
    const saving = busy === 'save';
    return (
      <Card>
        <AppText style={{ fontWeight: '700' }}>{T.fieldLabel}</AppText>
        <AppInput
          accessibilityLabel={`${T.fieldLabel}, ${q.text}`}
          value={p.editDraft}
          onChangeText={p.onEditChange}
          autoFocus
          autoCorrect={false}
          returnKeyType="done"
          blurOnSubmit
          onSubmitEditing={p.onEditSave}
          editable={!saving}
        />
        <View style={{ gap: 4 }}>
          <AppText variant="secondary">{T.fieldHelp}</AppText>
          <AppText variant="secondary" style={{ textAlign: 'right' }}>
            {countText(visitQuestionLength(p.editDraft), VISIT_QUESTION_COUNT_MAX)}
          </AppText>
        </View>
        {p.editError ? (
          <AppText variant="secondary" accessibilityRole="alert">{`! ${p.editError}`}</AppText>
        ) : null}
        <AppButton
          label={saving ? T.adding : T.editSave}
          accessibilityLabel={saveEditLabel(q.text)}
          disabled={saving}
          onPress={p.onEditSave}
        />
        <AppButton label={T.editCancel} variant="secondary" tall disabled={saving} onPress={p.onEditCancel} />
      </Card>
    );
  }

  if (mode === 'collapsed') {
    return (
      <Card>
        <AppText accessibilityLabel={`${q.text}, ${T.doneState}`} style={userText}>
          {`✓ ${q.text} · ${T.doneState}`}
        </AppText>
        <AppButton
          label={busy === 'undo' ? T.undoing : T.undo}
          accessibilityLabel={undoLabel(q.text)}
          variant="secondary"
          tall
          disabled={busy === 'undo'}
          onPress={p.onUndo}
        />
        {errorNode}
      </Card>
    );
  }

  if (mode === 'done') {
    return (
      <Card>
        <AppText accessibilityLabel={`${q.text}, ${T.doneState}`} style={userText}>
          {`✓ ${q.text}`}
        </AppText>
        <AppText variant="secondary">{T.doneState}</AppText>
        {errorNode}
        {actions([
          cell(
            <AppButton
              label={busy === 'undo' ? T.undoing : T.undo}
              accessibilityLabel={undoLabel(q.text)}
              variant="secondary"
              tall
              disabled={busy === 'undo'}
              onPress={p.onUndo}
            />,
            'undo',
          ),
          cell(
            <AppButton
              label={T.remove}
              accessibilityLabel={removeLabel(q.text)}
              variant="secondary"
              tall
              disabled={busy === 'undo'}
              onPress={p.onRemoveAsk}
            />,
            'remove',
          ),
        ])}
      </Card>
    );
  }

  return (
    <Card>
      <AppText style={userText}>{q.text}</AppText>
      {errorNode}
      <AppButton
        label={busy === 'done' ? T.adding : T.done}
        accessibilityLabel={doneLabel(q.text)}
        disabled={busy === 'done'}
        onPress={p.onDone}
      />
      {actions([
        cell(
          <AppButton
            label={T.edit}
            accessibilityLabel={editLabel(q.text)}
            variant="secondary"
            tall
            disabled={busy === 'done'}
            onPress={p.onEditStart}
          />,
          'edit',
        ),
        cell(
          <AppButton
            label={T.remove}
            accessibilityLabel={removeLabel(q.text)}
            variant="secondary"
            tall
            disabled={busy === 'done'}
            onPress={p.onRemoveAsk}
          />,
          'remove',
        ),
      ])}
    </Card>
  );
}
