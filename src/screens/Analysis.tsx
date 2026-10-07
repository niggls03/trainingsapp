import { useState } from 'react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { addDays, e1rm, exerciseSeries, personalBests, weekStart, workoutsPerWeek } from '../stats'
import { todayStr } from '../db'
import { useData } from '../useData'

type Metric = 'topKg' | 'e1rm' | 'volume'
const METRICS: [Metric, string][] = [
  ['topKg', 'Top-Gewicht (kg)'],
  ['e1rm', 'Geschätztes 1RM (kg)'],
  ['volume', 'Volumen (kg)'],
]

export function Analysis() {
  const { loaded, exercises, workouts, weeklyGoal } = useData()
  const [selected, setSelected] = useState('')
  const [metric, setMetric] = useState<Metric>('e1rm')
  if (!loaded) return null

  const usedIds = new Set(workouts.flatMap((w) => w.entries.map((e) => e.exerciseId)))
  const options = exercises.filter((x) => usedIds.has(x.id)).sort((a, b) => a.name.localeCompare(b.name))
  const exId = selected || options[0]?.id
  if (!exId) return <p className="muted center">Noch keine Daten für Analysen.</p>

  const series = exerciseSeries(workouts, exId)
  const bests = personalBests(workouts)

  // letzte 8 Wochen
  const perWeek = workoutsPerWeek(workouts)
  const thisWeek = weekStart(todayStr())
  const weeks = Array.from({ length: 8 }, (_, i) => addDays(thisWeek, -7 * (7 - i)))

  return (
    <>
            <select value={exId} onChange={(e) => setSelected(e.target.value)}>
        {options.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
      </select>
      <div className="chips">
        {METRICS.map(([m, label]) => (
          <button key={m} className={metric === m ? 'primary' : ''} onClick={() => setMetric(m)}>{label}</button>
        ))}
      </div>
      <section className="panel chart">
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={series.map((p) => ({ ...p, label: p.date.slice(8, 10) + '.' + p.date.slice(5, 7) + '.' }))}>
            <CartesianGrid stroke="#1d3a7a" />
            <XAxis dataKey="label" stroke="#7f8cb0" fontSize={11} />
            <YAxis stroke="#7f8cb0" fontSize={11} domain={['auto', 'auto']} width={40} />
            <Tooltip contentStyle={{ background: '#0a1228', border: '1px solid #1d3a7a' }} />
            <Line isAnimationActive={false} type="monotone" dataKey={metric} stroke="#4cd9ff" strokeWidth={2} dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
        <small className="muted">{series.length} Trainings mit dieser Übung</small>
      </section>

      <h2>Trainings pro Woche</h2>
      <section className="panel weeks">
        {weeks.map((w) => {
          const n = perWeek.get(w) ?? 0
          return (
            <div key={w} className="weekcol" title={w}>
              <div className={'weekbar' + (n >= weeklyGoal ? ' hit' : '')} style={{ height: `${Math.min(n, 7) * 14}px` }} />
              <small>{n}</small>
            </div>
          )
        })}
      </section>
      <small className="muted">Wochenziel: {weeklyGoal} Trainings (grün = erreicht)</small>

      <h2>Rekorde</h2>
      {[...bests.entries()]
        .map(([id, s]) => ({ name: exercises.find((x) => x.id === id)?.name ?? '?', s }))
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(({ name, s }) => (
          <div className="between small card" key={name}>
            <span>{name}</span>
            <span className="muted">
              {String(s.kg).replace('.', ',')} kg × {s.reps}
              {s.kg > 0 && ` (≈ ${Math.round(e1rm(s))} kg 1RM)`}
            </span>
          </div>
        ))}
    </>
  )
}
