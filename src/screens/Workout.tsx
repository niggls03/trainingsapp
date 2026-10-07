import { useEffect, useState } from 'react'
import { ExercisePicker } from '../components/ExercisePicker'
import { db, newId, todayStr, type MuscleGroup, type Workout, type WorkoutSet } from '../db'
import {
  bestScoreBefore,
  levelFromXp,
  muscleLevels,
  playerState,
  questDone,
  questsFor,
  recordSetIndex,
  XP_PER_SET,
  xpForWorkout,
} from '../game'
import { currentRow, relicsFor } from '../run'
import { reconcileStored } from '../runStore'
import { hasEffect, questCount } from '../skills'
import { lastSets, personalBests, volume, weekStart, workoutsPerWeek } from '../stats'
import { useData } from '../useData'
import { Summary, type SummaryData } from './Summary'

interface DraftSet {
  kg: string
  reps: string
  done: boolean
}
interface DraftEntry {
  exerciseId: string
  sets: DraftSet[]
}

const toNum = (s: string) => Number(s.replace(',', '.'))
const fmt = (n: number) => String(n).replace('.', ',')
const setText = (s: WorkoutSet) => (s.kg > 0 ? `${fmt(s.kg)} kg × ${s.reps}` : `${s.reps} Wdh.`)

/** Gültiger, abgehakter Satz oder null. */
const asSet = (s: DraftSet): WorkoutSet | null =>
  s.done && toNum(s.reps) > 0 ? { kg: toNum(s.kg) || 0, reps: toNum(s.reps) } : null

interface Props {
  templateId?: string
  editId?: string
  questExercise?: { name: string; group: string }
  onDone: () => void
}

export function WorkoutScreen({ templateId, editId, questExercise, onDone }: Props) {
  const { loaded, exercises, templates, workouts, weeklyGoal, hunterName, skills, ledger, run } = useData()
  const [intro, setIntro] = useState(() => !editId)
  const [date, setDate] = useState(todayStr())
  const [entries, setEntries] = useState<DraftEntry[] | null>(null)
  const [summary, setSummary] = useState<SummaryData | null>(null)
  const [picking, setPicking] = useState(false)
  const [pop, setPop] = useState('')

  const name = (id: string) => exercises.find((e) => e.id === id)?.name ?? '?'

  useEffect(() => {
    if (!loaded || entries) return
    if (editId) {
      const w = workouts.find((x) => x.id === editId)
      if (!w) return onDone()
      setDate(w.date)
      setEntries(
        w.entries.map((e) => ({
          exerciseId: e.exerciseId,
          sets: e.sets.map((s) => ({ kg: fmt(s.kg), reps: String(s.reps), done: true })),
        })),
      )
      return
    }
    if (questExercise) {
      const existing = exercises.find((e) => e.name.toLowerCase() === questExercise.name.toLowerCase())
      const id = existing?.id ?? newId()
      if (!existing) db.exercises.add({ id, name: questExercise.name, muscleGroup: questExercise.group as MuscleGroup })
      setEntries([{ exerciseId: id, sets: prefill(id) }])
      return
    }
    const ids = templates.find((t) => t.id === templateId)?.exerciseIds ?? []
    setEntries(ids.map((id) => ({ exerciseId: id, sets: prefill(id) })))
    // eslint-disable-next-line
  }, [loaded])

  /** Vorbelegung mit den Werten vom letzten Mal, noch nicht abgehakt. */
  function prefill(exerciseId: string): DraftSet[] {
    const last = lastSets(workouts, exerciseId)
    if (!last) return [{ kg: '', reps: '', done: false }]
    return last.map((s) => ({ kg: fmt(s.kg), reps: String(s.reps), done: false }))
  }

  if (!loaded || !entries) return null

  // ---- Live-Auswertung des laufenden Trainings ----
  const others = workouts.filter((w) => w.id !== editId)
  const previous = others.filter((w) => w.date < date)
  const draft: Workout = {
    id: editId ?? 'draft',
    date,
    entries: entries
      .map((e) => ({ exerciseId: e.exerciseId, sets: e.sets.map(asSet).filter((s): s is WorkoutSet => !!s) }))
      .filter((e) => e.sets.length),
  }
  // Relikte der Woche gelten nur für Trainings aus genau dieser Woche (nicht für nachgetragene ältere)
  const xpOpts = { skills, weeklyGoal, relics: relicsFor(run, date) }
  const liveXp = xpForWorkout(draft, previous, exercises, xpOpts)
  const base = playerState(others, exercises, skills, ledger)
  const baseLv = base.lv
  const liveLv = levelFromXp(base.xp + liveXp.total)
  const doneSets = draft.entries.reduce((n, e) => n + e.sets.length, 0)
  const pending = entries.reduce((n, e) => n + e.sets.filter((s) => !s.done && toNum(s.reps) > 0).length, 0)

  const update = (i: number, fn: (e: DraftEntry) => DraftEntry) =>
    setEntries(entries.map((e, idx) => (idx === i ? fn(e) : e)))
  const setField = (i: number, si: number, patch: Partial<DraftSet>) =>
    update(i, (x) => ({ ...x, sets: x.sets.map((y, k) => (k === si ? { ...y, ...patch } : y)) }))

  async function save() {
    if (!draft.entries.length) return
    const workout: Workout = {
      ...draft,
      id: editId ?? newId(),
      templateId: templateId ?? workouts.find((w) => w.id === editId)?.templateId,
    }
    // XP einfrieren: spätere Skill-Änderungen verschieben dieses Training nicht rückwirkend
    const xp = xpForWorkout(workout, previous, exercises, xpOpts)
    workout.xp = { total: xp.total, lines: xp.skillLines }
    await db.workouts.put(workout)

    // Lauf abgleichen: geräumte Räume und Boss werden im Belohnungs-Buch verbucht (in einer Transaktion)
    const { run: newRun, newClaims } = await reconcileStored()
    const all = [...others, workout]
    // Level „davor“ und „danach“ direkt berechnen, ohne auf das Neuladen der Datenbank zu warten
    const beforeState = playerState(others, exercises, skills, ledger)
    const afterState = playerState(all, exercises, skills, [...ledger, ...newClaims])
    const before = beforeState.lv
    const after = afterState.lv
    const week = weekStart(date)
    const rooms = newClaims.filter((c) => c.id.includes(':room'))
    const boss = newClaims.find((c) => c.id.endsWith(':boss'))
    const nextRow = currentRow(weekStart(todayStr()), [...ledger, ...newClaims])

    const prevBests = personalBests(previous)
    const records = xp.recordExerciseIds.map((id) => {
      const sets = workout.entries.find((e) => e.exerciseId === id)!.sets
      const top = sets[recordSetIndex(sets, bestScoreBefore(previous, id))] ?? sets[0]
      const was = prevBests.get(id)
      return { name: name(id), was: was ? setText(was) : null, now: setText(top) }
    })

    const groupOf = new Map(exercises.map((e) => [e.id, e.muscleGroup]))
    const added = new Map<string, number>()
    for (const e of workout.entries) {
      const g = groupOf.get(e.exerciseId)
      if (g) added.set(g, (added.get(g) ?? 0) + e.sets.length)
    }
    const lvBefore = new Map(muscleLevels(others, exercises).map((m) => [m.group, m.level.level]))
    const lvAfter = new Map(muscleLevels(all, exercises).map((m) => [m.group, m.level.level]))
    const muscles = [...added.entries()].map(([group, addedSets]) => ({
      group,
      addedSets,
      levelBefore: lvBefore.get(group as MuscleGroup) ?? 1,
      levelAfter: lvAfter.get(group as MuscleGroup) ?? 1,
    }))

    const doneQuests = questsFor(date, questCount(skills)).filter((q) => questDone(workout, exercises, q))

    setSummary({
      hunter: hunterName,
      xp,
      before,
      after,
      rankBefore: beforeState.rank,
      rankAfter: afterState.rank,
      sets: workout.entries.reduce((n, e) => n + e.sets.length, 0),
      volume: workout.entries.reduce((n, e) => n + volume(e.sets), 0),
      exerciseCount: workout.entries.length,
      records,
      muscles,
      quests: doneQuests.map((q) => ({ name: q.exerciseName, target: q.target })),
      weekCount: workoutsPerWeek(all).get(weekStart(date)) ?? 1,
      weeklyGoal,
      claims: newClaims.map((c) => ({ label: c.label, xp: c.xp, points: c.points })),
      runEvents: {
        rooms: rooms.length,
        boss: boss?.label ?? null,
        relicWaiting: Object.values(newRun.offers).some((o) => !o.taken),
        askNextRoom: week === newRun.week && nextRow <= 3 && !newRun.picks[String(nextRow)],
        nextRow,
      },
    })
  }

  if (summary) return <Summary data={summary} onDone={onDone} />

  const showIntro = intro && hasEffect(skills, 'intro') && !questExercise

  return (
    <div className="app">
      {showIntro && (
        <div className="overlay intro" onClick={() => setIntro(false)} onAnimationEnd={() => setIntro(false)}>
          <div className="introtext">
            <small className="sys">[ SYSTEM ]</small>
            <strong>Dungeon betreten</strong>
            <small className="muted">{hunterName ? `${hunterName}, ` : ''}zeige, was du kannst.</small>
          </div>
        </div>
      )}
      <header className="top">
        <button onClick={onDone}>← Zurück</button>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </header>

      <div className="hud">
        <div className="hudrow">
          <span className="lvline">
            <span>LV</span>
            <strong>{liveLv.level}</strong>
          </span>
          <span className="hudxp">+{liveXp.total} XP</span>
          <small className="muted">{doneSets} {doneSets === 1 ? 'Satz' : 'Sätze'}</small>
        </div>
        <div className="bar">
          <div style={{ width: `${(liveLv.intoLevel / liveLv.needed) * 100}%` }} />
        </div>
        {liveLv.level > baseLv.level && <small className="sys">[ Level-Up in Sicht: Level {liveLv.level} ]</small>}
      </div>

      <main>
        {entries.length === 0 && (
          <p className="muted">Dieses Training ist leer. Füge unten deine erste Übung hinzu.</p>
        )}
        {entries.map((e, i) => {
          const last = lastSets(others, e.exerciseId, date)
          const prevBest = bestScoreBefore(previous, e.exerciseId)
          const recIdx = recordSetIndex(e.sets.map(asSet), prevBest)
          const best = personalBests(previous).get(e.exerciseId)
          return (
            <section className="panel" key={e.exerciseId + i}>
              <div className="between">
                <h3>{name(e.exerciseId)}</h3>
                <button className="danger" onClick={() => setEntries(entries.filter((_, idx) => idx !== i))}>
                  Übung entfernen
                </button>
              </div>
              <small className="muted">
                {last ? `Letztes Mal: ${last.map((s) => fmt(s.kg)).join('/')} kg × ${last.map((s) => s.reps).join('/')}` : 'Erstes Mal. Alles, was du schaffst, ist dein Startwert.'}
                {best && ` · Rekord: ${setText(best)}`}
              </small>
              {recIdx >= 0 && <div className="recbanner">[ NEUER REKORD ] +25 XP</div>}
              <div className="setrow head">
                <span />
                <small className="sys">KG</small>
                <small className="sys">WDH.</small>
                <span />
              </div>
              {e.sets.map((s, si) => {
                const cur = asSet(s)
                const ref = last?.[si]
                let gain = ''
                if (cur && ref) {
                  if (cur.kg > ref.kg) gain = `▲ +${fmt(Math.round((cur.kg - ref.kg) * 100) / 100)} kg`
                  else if (cur.kg === ref.kg && cur.reps > ref.reps) gain = `▲ +${cur.reps - ref.reps} Wdh.`
                }
                const key = `${i}-${si}`
                return (
                  <div key={si}>
                    <div className={'setrow' + (s.done ? ' done' : '') + (recIdx === si ? ' isrecord' : '')}>
                      <button
                        className={'check' + (s.done ? ' on' : '')}
                        aria-label={s.done ? 'Satz als nicht erledigt markieren' : 'Satz als erledigt markieren'}
                        onClick={() => {
                          setField(i, si, { done: !s.done })
                          if (!s.done && toNum(s.reps) > 0) {
                            setPop(key)
                            setTimeout(() => setPop((p) => (p === key ? '' : p)), 1000)
                          }
                        }}
                      >
                        {s.done ? '✓' : `Satz ${si + 1}`}
                      </button>
                      <input
                        inputMode="decimal"
                        placeholder="kg"
                        value={s.kg}
                        onChange={(ev) => setField(i, si, { kg: ev.target.value, done: true })}
                      />
                      <input
                        inputMode="numeric"
                        placeholder="Wdh."
                        value={s.reps}
                        onChange={(ev) => setField(i, si, { reps: ev.target.value, done: true })}
                      />
                      <button
                        className="ghost"
                        onClick={() => update(i, (x) => ({ ...x, sets: x.sets.filter((_, k) => k !== si) }))}
                      >
                        Entfernen
                      </button>
                    </div>
                    {(gain || pop === key) && (
                      <div className="setnote">
                        {gain && <span className="gain">{gain} gegenüber letztem Mal</span>}
                        {pop === key && <span className="xppop">+{XP_PER_SET} XP</span>}
                      </div>
                    )}
                  </div>
                )
              })}
              <button
                className="block"
                onClick={() =>
                  update(i, (x) => ({ ...x, sets: [...x.sets, { ...(x.sets.at(-1) ?? { kg: '', reps: '' }), done: false }] }))
                }
              >
                + Satz
              </button>
            </section>
          )
        })}

        {picking ? (
          <ExercisePicker
            exercises={exercises}
            exclude={entries.map((e) => e.exerciseId)}
            onPick={(id) => {
              setEntries([...entries, { exerciseId: id, sets: prefill(id) }])
              setPicking(false)
            }}
            onCancel={() => setPicking(false)}
          />
        ) : (
          <button className="block" onClick={() => setPicking(true)}>+ Übung hinzufügen</button>
        )}
      </main>

      <div className="savebar">
        {pending > 0 && (
          <small className="warn">
            {pending} {pending === 1 ? 'Satz ist' : 'Sätze sind'} nicht abgehakt und {pending === 1 ? 'wird' : 'werden'} nicht gespeichert.
          </small>
        )}
        <button className="primary block" disabled={doneSets === 0} onClick={save}>
          {doneSets === 0 ? 'Hake mindestens einen Satz ab' : 'Training abschließen'}
        </button>
      </div>
    </div>
  )
}
