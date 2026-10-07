import { useState } from 'react'
import { todayStr } from '../db'
import { RELICS, relicById, type Relic } from '../relics'
import {
  BOSS_POINTS,
  BOSS_XP,
  bossClaimId,
  bossesDefeated,
  currentRow,
  generateRun,
  isClaimed,
  roomClaimId,
  taskProgress,
  windowWorkouts,
  type RoomOption,
  type RoomType,
} from '../run'
import { chooseRelicStored, pickRoomStored } from '../runStore'
import { hasEffect } from '../skills'
import { weekStart } from '../stats'
import { useData } from '../useData'

const ICON: Record<RoomType, string> = { kampf: '⚔', relikt: '✦', elite: '☠' }
const TYPE_NAME: Record<RoomType, string> = { kampf: 'Kampf-Raum', relikt: 'Relikt-Raum', elite: 'Elite-Raum' }
const X = [100, 240]
const Y = [410, 295, 180]
const START = { x: 170, y: 500 }
const BOSS = { x: 170, y: 62 }

const rewardText = (o: RoomOption) =>
  `+${o.xp} XP${o.type === 'kampf' ? '' : ' und ein Relikt zur Wahl (1 aus 3)'}`

export function Dungeon() {
  const { loaded, exercises, workouts, weeklyGoal, skills, run, ledger } = useData()
  const [sel, setSel] = useState<{ row: number; id: string } | null>(null)
  if (!loaded) return null

  const today = todayStr()
  const week = weekStart(today)
  const map = generateRun(week)
  const live = run && run.week === week ? run : null
  const row = currentRow(week, ledger)
  const goal = live?.goal ?? weeklyGoal
  const hits = workouts.filter((w) => weekStart(w.date) === week).length
  const hp = Math.max(0, goal - hits)
  const bossDone = isClaimed(ledger, bossClaimId(week))
  const selected = sel ?? { row: Math.min(row, 3), id: map.rows[Math.min(row, 3) - 1][0].id }
  const selOption = map.rows[selected.row - 1].find((o) => o.id === selected.id) ?? map.rows[0][0]
  const pick = live?.picks[String(selected.row)]
  const cleared = isClaimed(ledger, roomClaimId(week, selected.row))
  const revealed = selected.row <= row || cleared
  const progress =
    pick && pick.option === selOption.id && !cleared
      ? taskProgress(selOption.task, windowWorkouts(workouts, week, pick.on), workouts, exercises, pick.on)
      : null

  const offers = live ? Object.entries(live.offers).filter(([, o]) => !o.taken) : []
  const activeRelics = (live?.relics ?? []).map(relicById).filter((r): r is Relic => !!r)

  const nodeState = (r: number, o: RoomOption): 'cleared' | 'active' | 'open' | 'skipped' | 'future' => {
    const p = live?.picks[String(r)]
    if (isClaimed(ledger, roomClaimId(week, r))) return p?.option === o.id ? 'cleared' : 'skipped'
    if (r === row) return p?.option === o.id ? 'active' : p ? 'skipped' : 'open'
    return 'future'
  }
  const COLOR = { cleared: '#3dffb0', active: '#4cd9ff', open: '#4cd9ff', skipped: '#243a6e', future: '#1f3070' }

  return (
    <>
      <section className={'panel boss' + (bossDone ? ' done' : '')}>
        <small className="sys">{bossDone ? '[ BOSS BESIEGT ]' : '[ BOSS DER WOCHE ]'}</small>
        <h3 className="qtitle">{map.bossName}</h3>
        <div className={'bar boss' + (hasEffect(skills, 'bossBar') ? ' bossfx' : '')}>
          <div style={{ width: `${(hp / Math.max(1, goal)) * 100}%` }} />
        </div>
        <small className="muted">
          {bossDone
            ? `Besiegt! +${BOSS_XP} XP und +${BOSS_POINTS} Skillpunkt sind verbucht.`
            : `Noch ${hp} von ${goal} Lebenspunkten. Jedes Training dieser Woche schlägt 1 ab. Belohnung: +${BOSS_XP} XP und +${BOSS_POINTS} Skillpunkt.`}
        </small>
        <small className="muted">Bosse besiegt insgesamt: {bossesDefeated(ledger)}</small>
      </section>

      <div className="treescroll dungeon">
        <svg viewBox="0 0 340 540" width="100%" role="img" aria-label="Dungeon-Karte der Woche">
          <g stroke="#243a6e" strokeWidth="2" fill="none">
            {X.map((x, i) => <line key={'s' + i} x1={START.x} y1={START.y} x2={x} y2={Y[0]} />)}
            {[0, 1].flatMap((r) => X.flatMap((a) => X.map((b) => <line key={`${r}${a}${b}`} x1={a} y1={Y[r]} x2={b} y2={Y[r + 1]} />)))}
            {X.map((x, i) => <line key={'b' + i} x1={x} y1={Y[2]} x2={BOSS.x} y2={BOSS.y + 20} />)}
          </g>
          {map.rows.flatMap((rowOpts, r) => {
            const rowNo = r + 1
            const picked = live?.picks[String(rowNo)]
            return picked && isClaimed(ledger, roomClaimId(week, rowNo))
              ? rowOpts
                  .filter((o) => o.id === picked.option)
                  .map((o) => {
                    const x = X[rowOpts.indexOf(o)]
                    const from = r === 0 ? START : { x: X[0], y: Y[r - 1] }
                    return <line key={'p' + o.id} x1={from.x} y1={from.y} x2={x} y2={Y[r]} stroke="#3dffb0" strokeWidth="3" />
                  })
              : []
          })}
          <circle cx={START.x} cy={START.y} r="16" fill="rgba(61,255,176,.15)" stroke="#3dffb0" strokeWidth="2" />
          <text x={START.x} y={START.y + 4} style={{ fill: '#3dffb0', fontSize: 11 }}>Start</text>
          {map.rows.flatMap((opts, r) =>
            opts.map((o, i) => {
              const st = nodeState(r + 1, o)
              const c = COLOR[st]
              const x = X[i]
              const y = Y[r]
              const isSel = selected.row === r + 1 && selected.id === o.id
              return (
                <g key={o.id} className="nodeg" onClick={() => setSel({ row: r + 1, id: o.id })}>
                  <circle cx={x} cy={y} r={34} fill="transparent" />
                  <circle
                    cx={x}
                    cy={y}
                    r={24}
                    fill={st === 'cleared' ? 'rgba(61,255,176,.15)' : '#0a1228'}
                    stroke={c}
                    strokeWidth={st === 'active' || st === 'open' ? 3 : 2.4}
                    strokeDasharray={isSel ? '5 3' : undefined}
                    style={st === 'cleared' || st === 'active' || st === 'open' ? { filter: `drop-shadow(0 0 7px ${c})` } : undefined}
                  />
                  <text x={x} y={y + 6} style={{ fill: c, fontSize: 17 }}>{st === 'cleared' ? '✓' : ICON[o.type]}</text>
                  <text x={x} y={y + 40} className="nodelabel">{TYPE_NAME[o.type]}</text>
                </g>
              )
            }),
          )}
          <g>
            <rect
              x={BOSS.x - 42}
              y={BOSS.y - 24}
              width="84"
              height="48"
              rx="8"
              fill="rgba(255,59,92,.12)"
              stroke={bossDone ? '#3dffb0' : '#ff3b5c'}
              strokeWidth="2.4"
              style={{ filter: `drop-shadow(0 0 8px ${bossDone ? '#3dffb0' : '#ff3b5c'})` }}
            />
            <text x={BOSS.x} y={BOSS.y + 5} style={{ fill: bossDone ? '#3dffb0' : '#ff8a9c', fontSize: 13, fontWeight: 700 }}>
              {bossDone ? '✓ BOSS' : 'BOSS'}
            </text>
          </g>
        </svg>
      </div>

      <section className="panel">
        <small className="sys">[ {TYPE_NAME[selOption.type].toUpperCase()} · RAUM {selected.row} ]</small>
        {revealed ? (
          <>
            <h3>{selOption.task.text}</h3>
            <small className="muted">Belohnung: {rewardText(selOption)}</small>
            {progress && (
              <>
                <div className="bar"><div style={{ width: `${Math.min(100, (progress.value / progress.target) * 100)}%` }} /></div>
                <small className="muted">Fortschritt: {Math.min(progress.value, progress.target)} / {progress.target}. Zählt ab {pick?.on}.</small>
              </>
            )}
            {cleared && pick?.option === selOption.id && <small className="sys">[ Raum geräumt ]</small>}
            {cleared && pick?.option !== selOption.id && <small className="muted">Diesen Raum hast du nicht gewählt.</small>}
            {!cleared && selected.row === row && !pick && live && (
              <>
                <small className="warn">Nur dieser eine Raum pro Reihe. Training zählt ab heute, nicht rückwirkend.</small>
                <button className="primary block" onClick={() => pickRoomStored(selected.row, selOption.id)}>
                  Diesen Raum betreten
                </button>
              </>
            )}
            {!cleared && selected.row === row && pick && pick.option !== selOption.id && (
              <small className="muted">Du hast bereits einen anderen Raum gewählt.</small>
            )}
          </>
        ) : (
          <>
            <h3>???</h3>
            <small className="muted">Die Aufgabe wird sichtbar, sobald Raum {selected.row - 1} geräumt ist.</small>
          </>
        )}
      </section>

      {offers.map(([r, offer]) => (
        <section className="panel relicpanel" key={r}>
          <small className="sys">[ RAUM {r} GERÄUMT ]</small>
          <h3>Wähle ein Relikt</h3>
          <small className="muted">Es gilt bis zum Ende dieser Woche.</small>
          {offer.ids.map((id) => {
            const rel = relicById(id)
            if (!rel) return null
            return (
              <button key={id} className={'relic ' + rel.rarity} onClick={() => chooseRelicStored(Number(r), id)}>
                <span className="sys">{rel.rarity}</span>
                <b>{rel.icon} {rel.name}</b>
                <small>{rel.desc}</small>
              </button>
            )
          })}
        </section>
      ))}

      <section className="panel">
        <h3 className="ptitle">Aktive Relikte</h3>
        {activeRelics.length === 0 ? (
          <small className="muted">Noch keine. Räume Relikt- und Elite-Räume, um Relikte zu bekommen. Es gibt {RELICS.length} verschiedene.</small>
        ) : (
          activeRelics.map((r) => (
            <div key={r.id} className="between small">
              <b>{r.icon} {r.name}</b>
              <span className="muted">{r.desc}</span>
            </div>
          ))
        )}
      </section>
    </>
  )
}
