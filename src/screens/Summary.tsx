import { useEffect, useState } from 'react'
import type { LevelInfo } from '../game'
import type { WorkoutXp } from '../game'

export interface SummaryData {
  hunter: string
  xp: WorkoutXp
  before: LevelInfo
  after: LevelInfo
  rankBefore: string
  rankAfter: string
  sets: number
  volume: number
  exerciseCount: number
  records: { name: string; was: string | null; now: string }[]
  muscles: { group: string; addedSets: number; levelBefore: number; levelAfter: number }[]
  quests: { name: string; target: number }[]
  weekCount: number
  weeklyGoal: number
  /** Belohnungen aus dem Wochenlauf, die durch dieses Training verbucht wurden */
  claims: { label: string; xp: number; points: number }[]
  runEvents: { rooms: number; boss: string | null; relicWaiting: boolean; askNextRoom: boolean; nextRow: number }
}

/** Zählt von 0 auf `target` hoch, nach `delayMs` Verzögerung. */
function useCountUp(target: number, delayMs: number, durMs = 900): number {
  const [v, setV] = useState(0)
  useEffect(() => {
    let raf = 0
    const t0 = performance.now() + delayMs
    const tick = (now: number) => {
      const p = Math.min(1, Math.max(0, (now - t0) / durMs))
      setV(Math.round(target * p))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, delayMs, durMs])
  return v
}

const pct = (l: LevelInfo) => (l.intoLevel / l.needed) * 100
const step = (i: number) => ({ animationDelay: `${i * 0.45}s` })

const CLOSERS = [
  'Du bist heute stärker als gestern.',
  'Jeder Satz hat dich ein Stück weiter gebracht.',
  'Das System hat deine Leistung registriert.',
  'Ruhe dich aus. Morgen wächst du weiter.',
]

export function Summary({ data, onDone }: { data: SummaryData; onDone: () => void }) {
  const { xp, before, after } = data
  const levelUp = after.level > before.level
  const rankUp = data.rankAfter !== data.rankBefore
  const claimXp = data.claims.reduce((n, c) => n + c.xp, 0)
  const total = useCountUp(xp.total + claimXp, 1400)

  // Level-Balken: erst vom alten Stand füllen; bei Level-Up bis 100 %, dann neues Level von 0.
  const [shownLevel, setShownLevel] = useState(before.level)
  const [barPct, setBarPct] = useState(pct(before))
  const [instant, setInstant] = useState(false)
  useEffect(() => {
    const timers: number[] = []
    timers.push(window.setTimeout(() => setBarPct(levelUp ? 100 : pct(after)), 1800))
    if (levelUp) {
      timers.push(
        window.setTimeout(() => {
          setInstant(true)
          setShownLevel(after.level)
          setBarPct(0)
        }, 2900),
      )
      timers.push(
        window.setTimeout(() => {
          setInstant(false)
          setBarPct(pct(after))
        }, 3000),
      )
    }
    return () => timers.forEach(clearTimeout)
  }, [levelUp, after])

  const closer = CLOSERS[(data.sets + data.records.length) % CLOSERS.length]
  const bonusLines: [string, number][] = [
    [`${data.sets} Sätze`, xp.sets],
    ['Training abgeschlossen', xp.workoutBonus],
    [`${data.records.length} ${data.records.length === 1 ? 'Rekord' : 'Rekorde'}`, xp.recordBonus],
    ['Tägliche Quest', xp.questBonus],
  ]

  let i = 0
  return (
    <div className="app summary">
      <div className="reveal" style={step(i++)}>
        <small className="sys">[ SYSTEM ]</small>
        <h1>Training abgeschlossen</h1>
        <p className="muted">
          {data.hunter ? `${data.hunter}, ` : ''}deine Leistung wurde ausgewertet.
        </p>
      </div>

      <section className="panel reveal" style={step(i++)}>
        <h3 className="ptitle">Leistung</h3>
        <div className="row figures">
          <div><strong>{data.exerciseCount}</strong><small className="muted">Übungen</small></div>
          <div><strong>{data.sets}</strong><small className="muted">Sätze</small></div>
          <div><strong>{Math.round(data.volume).toLocaleString('de-DE')}</strong><small className="muted">kg Volumen</small></div>
        </div>
      </section>

      {data.quests.length > 0 && (
        <section className="panel quest done reveal" style={step(i++)}>
          <small className="sys">[ {data.quests.length > 1 ? 'QUESTS' : 'QUEST'} ABGESCHLOSSEN ]</small>
          {data.quests.map((q) => (
            <h3 className="qtitle" key={q.name}>{q.target} × {q.name}</h3>
          ))}
          <small className="muted">Belohnung: +{xp.questBonus} XP</small>
        </section>
      )}

      {data.records.length > 0 && (
        <section className="panel record reveal" style={step(i++)}>
          <small className="sys">[ NEUER REKORD ]</small>
          {data.records.map((r) => (
            <div key={r.name} className="recline">
              <strong>{r.name}</strong>
              <span className="muted">
                {r.was ? `${r.was}  →  ` : 'Erster Eintrag: '}
                <span className="now">{r.now}</span>
              </span>
            </div>
          ))}
        </section>
      )}

      <section className="panel reveal" style={step(i++)}>
        <h3 className="ptitle">Erfahrung</h3>
        {bonusLines.filter(([, v]) => v > 0).map(([label, v]) => (
          <div className="between small" key={label}>
            <span>{label}</span>
            <span className="muted">+{v} XP</span>
          </div>
        ))}
        {data.claims.map((c) => (
          <div className="between small skillline" key={c.label}>
            <span>⚔ {c.label}</span>
            <span className="gold">+{c.xp} XP{c.points ? ` · +${c.points} Skillpunkt` : ''}</span>
          </div>
        ))}
        {xp.skillLines.map((l, k) => (
          <div className="between small skillline" key={(l.skillId ?? l.label) + k}>
            <span>✦ {l.label}</span>
            <span className="gold">+{l.xp} XP</span>
          </div>
        ))}
        <h2 className="xptotal">+{total} XP</h2>
        <div className="lvline">
          <span>LV</span>
          <strong>{shownLevel}</strong>
        </div>
        <div className="bar">
          <div style={{ width: `${barPct}%`, transition: instant ? 'none' : undefined }} />
        </div>
        <small className="muted">
          {levelUp ? `${before.level} → ${after.level}` : `${after.intoLevel} / ${after.needed} XP bis Level ${after.level + 1}`}
        </small>
      </section>

      {levelUp && (
        <section className="panel levelup reveal" style={{ animationDelay: `${i++ * 0.45 + 1.4}s` }}>
          <small className="sys">[ LEVEL UP ]</small>
          <strong>Level {after.level}</strong>
          {rankUp && (
            <span className="rankup">RANG {data.rankBefore} → {data.rankAfter}</span>
          )}
        </section>
      )}

      {(data.runEvents.rooms > 0 || data.runEvents.boss) && (
        <section className="panel boss reveal" style={step(i++)}>
          <small className="sys">{data.runEvents.boss ? '[ BOSS BESIEGT ]' : '[ RAUM GERÄUMT ]'}</small>
          {data.runEvents.boss && <h3 className="qtitle">{data.runEvents.boss.replace('Boss besiegt: ', '')}</h3>}
          {data.runEvents.rooms > 0 && (
            <small>{data.runEvents.rooms === 1 ? 'Ein Raum' : `${data.runEvents.rooms} Räume`} deines Wochenlaufs {data.runEvents.rooms === 1 ? 'ist' : 'sind'} geräumt.</small>
          )}
          {data.runEvents.relicWaiting && <small className="gold">Ein Relikt wartet im Charakter-Tab (Wochenlauf) auf dich.</small>}
        </section>
      )}

      {data.runEvents.askNextRoom && !data.runEvents.boss && (
        <section className="panel reveal" style={step(i++)}>
          <small className="sys">[ Wähle deinen nächsten Raum ]</small>
          <small className="muted">Im Charakter-Tab unter „Wochenlauf“ wartet Raum {data.runEvents.nextRow}.</small>
        </section>
      )}

      {data.muscles.length > 0 && (
        <section className="panel reveal" style={step(i++)}>
          <h3 className="ptitle">Stats</h3>
          {data.muscles.map((m) => (
            <div className="between small" key={m.group}>
              <span>{m.group}</span>
              <span>
                <span className="muted">+{m.addedSets} {m.addedSets === 1 ? 'Satz' : 'Sätze'}</span>{' '}
                {m.levelAfter > m.levelBefore ? (
                  <strong className="statup">Lv {m.levelBefore} → {m.levelAfter}</strong>
                ) : (
                  <span className="muted">Lv {m.levelAfter}</span>
                )}
              </span>
            </div>
          ))}
        </section>
      )}

      <section className="panel reveal" style={step(i++)}>
        <div className="between">
          <span>Trainings diese Woche</span>
          <strong>{data.weekCount} / {data.weeklyGoal}</strong>
        </div>
        {data.weekCount >= data.weeklyGoal && <small className="sys">[ Wochenziel erreicht ]</small>}
      </section>

      <p className="center muted reveal" style={step(i++)}>{closer}</p>
      <button className="primary block reveal" style={step(i++)} onClick={onDone}>
        Weiter
      </button>
    </div>
  )
}
