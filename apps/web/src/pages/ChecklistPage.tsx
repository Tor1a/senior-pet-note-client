import { useRef, useState, type KeyboardEvent } from 'react';
import { Link } from 'react-router-dom';
import { checklistItemsFor, type ChecklistGroup } from '../lib/checklistContent';
import { isChecked, toggleChecked, type ChecklistData } from '../lib/checklistState';
import { loadChecklist, saveChecklist } from '../lib/checklistStorage';
import { CHECKLIST_TEXT as T } from '../lib/checklistText';
import { DISCLAIMER } from '../lib/constants';
import { HISTORY_TEXT } from '../lib/historyText';
import { usePet } from '../pet';

// F 처음 키워요 체크리스트: 일반 목록 + 보호자가 직접 체크, 체크는 이 기기(localStorage)에만 저장한다. 서버 호출 없음.
// 진행률·완료 문구·정렬 변화 없음. 탭 선택은 저장하지 않는다(들어올 때마다 준비물부터).

const TABS: { group: ChecklistGroup; label: string }[] = [
  { group: 'prep', label: T.tabPrep },
  { group: 'ask', label: T.tabAsk },
];

export default function ChecklistPage() {
  const { pet } = usePet();
  const petId = pet?.id ?? '';
  const [tab, setTab] = useState<ChecklistGroup>('prep');
  const [data, setData] = useState<ChecklistData>(() => loadChecklist());
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const items = checklistItemsFor(tab, pet?.species);

  const toggle = (itemId: string) => {
    // 다른 탭(창)에서 바뀐 값을 덮어쓰지 않도록 저장 직전에 다시 읽는다
    // 해당 반려동물 목록은 저장소 최신값 기준(저장소 접근 실패로 비어 있으면 화면의 메모리 상태)
    if (!petId) return;
    const stored = loadChecklist();
    const next = toggleChecked({ ...stored, [petId]: stored[petId] ?? data[petId] ?? [] }, petId, itemId);
    setData(next);
    saveChecklist(next);
  };

  const onTabKey = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let target = -1;
    if (e.key === 'ArrowRight') target = (index + 1) % TABS.length;
    else if (e.key === 'ArrowLeft') target = (index + TABS.length - 1) % TABS.length;
    else if (e.key === 'Home') target = 0;
    else if (e.key === 'End') target = TABS.length - 1;
    if (target < 0) return;
    e.preventDefault();
    setTab(TABS[target].group);
    tabRefs.current[TABS[target].group]?.focus();
  };

  return (
    <main className="page checklist-page">
      <Link to="/today" className="back-link">
        {HISTORY_TEXT.backToToday}
      </Link>
      <h1>{T.title}</h1>
      <p className="lead">{T.notice}</p>
      <p className="muted">{T.saveNote}</p>

      <div className="checklist-tabs">
        <div role="tablist" aria-label={T.tabsLabel} className="checklist-tablist">
          {TABS.map((t, i) => (
            <button
              key={t.group}
              type="button"
              role="tab"
              id={`checklist-tab-${t.group}`}
              aria-controls="checklist-panel"
              aria-selected={tab === t.group}
              tabIndex={tab === t.group ? 0 : -1}
              ref={(el) => {
                tabRefs.current[t.group] = el;
              }}
              onClick={() => setTab(t.group)}
              onKeyDown={(e) => onTabKey(e, i)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div role="tabpanel" id="checklist-panel" aria-labelledby={`checklist-tab-${tab}`}>
        <ul className={`checklist-list${tab === 'ask' ? ' is-ask' : ''}`}>
          {items.map((item) => {
            const checked = isChecked(data, petId, item.id);
            return (
              <li key={item.id} className="checklist-row">
                <label className={checked ? 'is-checked' : undefined}>
                  <input type="checkbox" checked={checked} onChange={() => toggle(item.id)} />
                  <span className="checklist-text">{item.text}</span>
                  <span className="checklist-state" aria-hidden="true">
                    {checked ? T.checked : T.unchecked}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      </div>

      <p className="disclaimer">{DISCLAIMER}</p>
    </main>
  );
}
