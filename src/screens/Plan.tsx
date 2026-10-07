import { useEffect, useState } from 'react'
import { ExercisePicker } from '../components/ExercisePicker'
import { db, MUSCLE_GROUPS, newId, type MuscleGroup, type Template } from '../db'
import { useData } from '../useData'

/** Eingabefeld, das erst beim Verlassen speichert; verhindert verlorene Zeichen bei asynchronen Datenbank-Updates. */
function BlurInput({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [v, setV] = useState(value)
  useEffect(() => setV(value), [value])
  return (
    <input
      className="title"
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => v.trim() && v !== value && onSave(v.trim())}
    />
  )
}

export function Plan() {
  const { loaded, exercises, templates } = useData()
  const [newTemplate, setNewTemplate] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const [libOpen, setLibOpen] = useState(false)
  if (!loaded) return null

  const save = (t: Template) => db.templates.put(t)

  async function createTemplate() {
    const name = newTemplate.trim()
    if (!name) return
    const id = newId()
    await db.templates.add({ id, name, exerciseIds: [] })
    setNewTemplate('')
    setOpen(id)
  }

  async function removeExercise(id: string) {
    const used = await db.workouts.filter((w) => w.entries.some((e) => e.exerciseId === id)).count()
    const msg = used
      ? `Diese Übung steht in ${used} gespeicherten Trainings. Löschen entfernt sie nur aus der Auswahl, alte Trainings zeigen dann „?“. Wirklich löschen?`
      : 'Übung löschen?'
    if (!window.confirm(msg)) return
    await db.exercises.delete(id)
    for (const t of templates) {
      if (t.exerciseIds.includes(id)) await save({ ...t, exerciseIds: t.exerciseIds.filter((x) => x !== id) })
    }
  }

  return (
    <>
      <p className="muted">
        Hier legst du deine Trainingstage an, z. B. „Push“ oder „Beine“. Jeder Tag hat eine Liste von Übungen, die beim Start des Trainings bereitstehen.
      </p>

      {templates.length === 0 && (
        <div className="panel hint">
          <strong>So fängst du an:</strong> Schreibe unten den Namen deines ersten Trainingstags und tippe auf „Trainingstag anlegen“. Danach fügst du die Übungen hinzu.
        </div>
      )}

      {templates.map((t) => {
        const isOpen = open === t.id
        return (
          <section className="panel" key={t.id}>
            <div className="between">
              <BlurInput value={t.name} onSave={(name) => save({ ...t, name })} />
              <button className={isOpen ? 'primary' : ''} onClick={() => setOpen(isOpen ? null : t.id)}>
                {isOpen ? 'Fertig' : 'Bearbeiten'}
              </button>
            </div>
            {t.exerciseIds.length === 0 && <small className="muted">Noch keine Übungen. Tippe auf „Bearbeiten“.</small>}
            {t.exerciseIds.map((id, i) => (
              <div className="between listrow" key={id}>
                <span>
                  {i + 1}. {exercises.find((x) => x.id === id)?.name ?? '?'}
                </span>
                {isOpen && (
                  <span className="actions">
                    <button
                      disabled={i === 0}
                      onClick={() => {
                        const ids = [...t.exerciseIds]
                        ;[ids[i - 1], ids[i]] = [ids[i], ids[i - 1]]
                        save({ ...t, exerciseIds: ids })
                      }}
                    >
                      Nach oben
                    </button>
                    <button className="danger" onClick={() => save({ ...t, exerciseIds: t.exerciseIds.filter((x) => x !== id) })}>
                      Entfernen
                    </button>
                  </span>
                )}
              </div>
            ))}
            {isOpen && (
              <>
                <ExercisePicker
                  exercises={exercises}
                  exclude={t.exerciseIds}
                  onPick={async (id) => {
                    // Lesen und Schreiben in einer Transaktion, damit schnelle Folge-Eingaben sich nicht überschreiben
                    await db.transaction('rw', db.templates, async () => {
                      const cur = await db.templates.get(t.id)
                      if (cur && !cur.exerciseIds.includes(id)) {
                        await db.templates.put({ ...cur, exerciseIds: [...cur.exerciseIds, id] })
                      }
                    })
                  }}
                />
                <button
                  className="danger block"
                  onClick={() =>
                    window.confirm(`Trainingstag „${t.name}“ löschen? Gespeicherte Trainings bleiben erhalten.`) &&
                    db.templates.delete(t.id)
                  }
                >
                  Diesen Trainingstag löschen
                </button>
              </>
            )}
          </section>
        )
      })}

      <section className="panel">
        <h3 className="ptitle">Neuer Trainingstag</h3>
        <input
          placeholder="Name, z. B. Brust + Bizeps"
          value={newTemplate}
          onChange={(e) => setNewTemplate(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && createTemplate()}
        />
        <button className="primary block" onClick={createTemplate}>
          Trainingstag anlegen
        </button>
      </section>

      <section className="panel">
        <div className="between">
          <h3 className="ptitle">Alle Übungen ({exercises.length})</h3>
          <button onClick={() => setLibOpen(!libOpen)}>{libOpen ? 'Zuklappen' : 'Anzeigen'}</button>
        </div>
        {libOpen && exercises.length === 0 && <small className="muted">Noch keine Übungen angelegt.</small>}
        {libOpen &&
          [...exercises].sort((a, b) => a.name.localeCompare(b.name)).map((x) => (
            <div className="listrow libitem" key={x.id}>
              <BlurInput value={x.name} onSave={(name) => db.exercises.update(x.id, { name })} />
              <div className="between">
                <select value={x.muscleGroup} onChange={(e) => db.exercises.update(x.id, { muscleGroup: e.target.value as MuscleGroup })}>
                  {MUSCLE_GROUPS.map((g) => <option key={g}>{g}</option>)}
                </select>
                <button className="danger" onClick={() => removeExercise(x.id)}>Löschen</button>
              </div>
            </div>
          ))}
      </section>
    </>
  )
}
