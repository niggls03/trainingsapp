import { useState } from 'react'
import { db, MUSCLE_GROUPS, newId, type Exercise, type MuscleGroup } from '../db'

interface Props {
  exercises: Exercise[]
  /** Übungen, die nicht mehr angeboten werden (schon im Training/Tag enthalten) */
  exclude: string[]
  onPick: (exerciseId: string) => void
  onCancel?: () => void
}

/** Übung wählen oder per Eintippen neu anlegen. */
export function ExercisePicker({ exercises, exclude, onPick, onCancel }: Props) {
  const [name, setName] = useState('')
  const [group, setGroup] = useState<MuscleGroup>('Brust')
  const available = exercises.filter((e) => !exclude.includes(e.id)).sort((a, b) => a.name.localeCompare(b.name))

  async function submit() {
    const n = name.trim()
    if (!n) return
    setName('')
    const existing = exercises.find((e) => e.name.toLowerCase() === n.toLowerCase())
    if (existing) {
      if (!exclude.includes(existing.id)) onPick(existing.id)
    } else {
      const id = newId()
      await db.exercises.add({ id, name: n, muscleGroup: group })
      onPick(id)
    }
  }

  return (
    <div className="panel">
      <h3 className="ptitle">Übung hinzufügen</h3>
      {available.length > 0 && (
        <>
          <small className="muted">Vorhandene Übung antippen:</small>
          <div className="chips">
            {available.map((e) => (
              <button key={e.id} onClick={() => onPick(e.id)}>
                {e.name}
              </button>
            ))}
          </div>
        </>
      )}
      <small className="muted">Oder neue Übung eintippen:</small>
      <input
        placeholder="Name der Übung, z. B. Bankdrücken"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
      />
      <label className="field">
        <small className="muted">Muskelgruppe (für deine Stats)</small>
        <select value={group} onChange={(e) => setGroup(e.target.value as MuscleGroup)}>
          {MUSCLE_GROUPS.map((g) => (
            <option key={g}>{g}</option>
          ))}
        </select>
      </label>
      <button className="primary block" onClick={submit}>
        Neue Übung anlegen und hinzufügen
      </button>
      {onCancel && (
        <button className="ghost block" onClick={onCancel}>
          Schließen
        </button>
      )}
    </div>
  )
}
