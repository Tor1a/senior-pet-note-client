import { useId } from 'react';
import { REPORT_TEXT as T, type ReportModel } from '../lib/reportText';
import type { HistoryDay } from '../lib/petApi';
import WeightChart from './WeightChart';

// 병원 방문 리포트 본문(문서). 화면과 인쇄가 같은 컴포넌트를 쓰고, 인쇄 모양은 styles.css 의 @media print 가 바꾼다.
// 앱이 만든 문장은 lib/reportText.ts 가 만들고, 여기서는 그대로 배치만 한다(사용자 입력은 가공 없이 표시).
// 근거: .company/design/병원-방문-리포트.md 4·7장

export default function ReportSheet({
  model,
  days,
  onRetryMedications,
}: {
  model: ReportModel;
  days: HistoryDay[];
  /** 약 목록을 못 불러왔을 때 화면에서만 보이는 [다시 불러오기] */
  onRetryMedications?: () => void;
}) {
  const id = useId();
  const h = (name: string) => `${id}-${name}`;
  const hasWeight = model.weight.count > 0;

  return (
    <article className="report-sheet" aria-label={model.printTitle}>
      <header className="report-head">
        <p className="report-doc-title">{model.printTitle}</p>
        <p className="report-pet report-user-text">{model.petLine}</p>
        {model.conditionsLine && <p className="report-user-text">{model.conditionsLine}</p>}
        <p className="strong">{model.periodLine}</p>
        <p>{model.baseDateLine}</p>
        <p className="muted">{T.source}</p>
      </header>

      <section className="report-section report-glance" aria-labelledby={h('glance')}>
        <h2 id={h('glance')}>{T.glanceTitle}</h2>
        {model.glance.map((line) => (
          <p key={line}>{line}</p>
        ))}
      </section>

      <section className="report-section report-weight-section" aria-labelledby={h('weight')}>
        <h2 id={h('weight')}>{T.weightTitle}</h2>
        {model.weight.lines.map((line) => (
          <p key={line}>{line}</p>
        ))}
        {hasWeight && (
          <div className="report-weight-grid">
            <div className="report-chart">
              <WeightChart days={days} readOnly />
              <p className="small">{T.legend}</p>
              <p className="small strong">{T.axisNote}</p>
            </div>
            <table className="report-table">
              <caption className="visually-hidden report-user-text">{`${model.petName} 최근 ${model.total}일 체중`}</caption>
              <thead>
                <tr>
                  <th scope="col">{T.tableDate}</th>
                  <th scope="col">{T.tableWeight}</th>
                  <th scope="col">{T.tableSymptom}</th>
                </tr>
              </thead>
              <tbody>
                {model.weight.rows.map((r) => (
                  <tr key={r.recordDate}>
                    <th scope="row">{r.dateLabel}</th>
                    <td>{r.weight}</td>
                    <td className="report-user-text">{r.symptom}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="report-cols">
        <section className="report-section" aria-labelledby={h('meal')}>
          <h2 id={h('meal')}>{T.mealWaterTitle}</h2>
          <p>{model.mealWater.food}</p>
          <p>{model.mealWater.water}</p>
          {model.mealWater.waterMl && <p>{model.mealWater.waterMl}</p>}
        </section>

        <section className="report-section" aria-labelledby={h('symptom')}>
          <h2 id={h('symptom')}>
            {T.symptomTitle} <span className="report-count">{model.symptoms.countLine}</span>
          </h2>
          {model.symptoms.empty && <p>{model.symptoms.empty}</p>}
          {model.symptoms.items.length > 0 && (
            <ul className="report-list">
              {model.symptoms.items.map((s) => (
                <li key={s.dateLabel}>
                  <span aria-hidden="true">◆ </span>
                  <span className="visually-hidden">증상을 적음 </span>
                  {s.dateLabel} <span className="report-user-text">{s.names}</span>
                </li>
              ))}
            </ul>
          )}
          {model.symptoms.rest && <p>{model.symptoms.rest}</p>}
          {model.symptoms.none && <p>{model.symptoms.none}</p>}
        </section>
      </div>

      <section className="report-section" aria-labelledby={h('med')}>
        <h2 id={h('med')}>{T.medicationTitle}</h2>
        {model.medication.empty && <p>{model.medication.empty}</p>}
        {model.medication.lines.map((line, i) => (
          <p key={line} className={i === 0 && model.medication.lines.length > 3 ? 'report-big' : 'small'}>
            {line}
          </p>
        ))}
        <h3 className="report-sub">{T.medicationListTitle}</h3>
        {model.medicationList.items.length > 0 && (
          <ul className="report-list report-med-list">
            {model.medicationList.items.map((m) => (
              <li key={`${m.name}-${m.times}`}>
                <span className="report-user-text">{m.name}</span> · {m.times}
              </li>
            ))}
          </ul>
        )}
        {model.medicationList.status === 'error' ? (
          <>
            {/* 화면에는 실패를, 종이에는 사실 문구만 (실패 문장이 종이에 찍히지 않게) */}
            <p role="alert" className="no-print">
              {T.medicationListFailed}
            </p>
            <p className="print-only">{T.medicationListOmitted}</p>
          </>
        ) : (
          model.medicationList.message && <p>{model.medicationList.message}</p>
        )}
        {model.medicationList.status === 'error' && onRetryMedications && (
          <button type="button" className="btn-secondary no-print" onClick={onRetryMedications}>
            {T.retry}
          </button>
        )}
      </section>

      <section className="report-section report-memo-section" aria-labelledby={h('memo')}>
        <h2 id={h('memo')}>{T.memoTitle}</h2>
        {model.memos.message && <p>{model.memos.message}</p>}
        {model.memos.items.length > 0 && (
          <dl className="report-memos">
            {model.memos.items.map((m) => (
              <div key={m.dateLabel} className="report-memo">
                <dt>{m.dateLabel}</dt>
                <dd className="report-user-text">{m.memo}</dd>
              </div>
            ))}
          </dl>
        )}
        {model.memos.rest && <p>{model.memos.rest}</p>}
      </section>

      {model.emptyDays && (
        <section className="report-section report-gaps" aria-labelledby={h('gaps')}>
          <h2 id={h('gaps')}>{model.emptyDays.title}</h2>
          <p>{model.emptyDays.dates}</p>
        </section>
      )}
    </article>
  );
}
