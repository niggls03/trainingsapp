import { db } from '../db'
import { byDateAsc, formatDate, volume } from '../stats'
import { useData } from '../useData'

export function History({ onEdit }: { onEdit: (id: string) => void }) {
  const { loaded, exercises, templates, workouts } = useData()
  if (!loaded) return null

  const list = byDateAsc(workouts).reverse()
  if (!list.length) return <p className="muted center">Noch keine Trainings gespeichert. Starte dein erstes auf dem Status-Tab.</p>

  return (
    <>
            {list.map((w) => {
        const title = templates.find((t) => t.id === w.templateId)?.name
        return (
          <section className="panel" key={w.id}>
            <div className="between">
              <h3>
                {formatDate(w.date)} {title && <small className="muted">· {title}</small>}
              </h3>
              <span>
                <button onClick={() => onEdit(w.id)}>Ändern</button>
                <button
                  className="danger"
                  onClick={() => window.confirm('Dieses Training löschen?') && db.workouts.delete(w.id)}
                >Löschen</button>
              </span>
            </div>
            {w.entries.map((e) => (
              <div className="between small" key={e.exerciseId}>
                <span>{exercises.find((x) => x.id === e.exerciseId)?.name ?? '?'}</span>
                <span className="muted">
                  {e.sets.map((s) => String(s.kg).replace('.', ',')).join('/')} kg × {e.sets.map((s) => s.reps).join('/')}
                </span>
              </div>
            ))}
            <small className="muted">
              Volumen: {Math.round(w.entries.reduce((sum, e) => sum + volume(e.sets), 0)).toLocaleString('de-DE')} kg
            </small>
          </section>
        )
      })}
    </>
  )
}
