import { useState } from 'react'
import { setSetting } from '../db'
import type { CharView } from '../App'
import { Dungeon } from './Dungeon'
import {
  BRANCHES,
  THEMES,
  hasEffect,
  isRevealed,
  ownedThemes,
  ownedTitles,
  parentIds,
  refund,
  skillById,
  skillStatus,
  unlock,
  type Skill,
  type SkillState,
} from '../skills'
import { useData } from '../useData'

const COL_X = [40, 110, 180, 250, 320]
const rowY = (row: number) => 56 + row * 100
const VIEW_H = rowY(6) + 74
const COLOR: Record<SkillState, string> = { unlocked: '#3dffb0', available: '#4cd9ff', locked: '#243a6e' }

const MARK: Record<string, string> = { root: '◆', x: '✦', goal: '★', legend: '♛' }
const markOf = (s: Skill): string => {
  const part = s.id.split('.')[1]
  if (MARK[part]) return MARK[part]
  return part.replace(/\D/g, '')
}

/** Namen auf höchstens zwei Zeilen à ca. 12 Zeichen verteilen. */
function wrap(name: string): string[] {
  if (name.length <= 12) return [name]
  const words = name.split(' ')
  if (words.length === 1) return [name.slice(0, 11) + '…']
  let first = ''
  for (const w of words) {
    if ((first + ' ' + w).trim().length > 12 && first) break
    first = (first + ' ' + w).trim()
  }
  const rest = name.slice(first.length).trim()
  return [first, rest.length > 12 ? rest.slice(0, 11) + '…' : rest]
}

export function Character({ view, onView }: { view: CharView; onView: (v: CharView) => void }) {
  const { loaded, hunterName, skills, theme, title, player } = useData()
  const [branchIdx, setBranchIdx] = useState(0)
  const [selected, setSelected] = useState<string>('kraft.root')
  if (!loaded) return null

  const { lv, rank, earned, free, spent, questDays } = player
  const branch = BRANCHES[branchIdx]
  const byId = new Map(branch.skills.map((s) => [s.id, s]))
  const sel = skillById(selected) ?? branch.skills[0]
  const selStatus = skillStatus(skills, lv.level, free, sel.id)
  const selRevealed = isRevealed(skills, lv.level, sel)
  const save = (next: string[]) => setSetting('skills', next)
  const ownedIn = (key: string) => skills.filter((id) => id.startsWith(key + '.')).length
  const titles = ownedTitles(skills)
  const themes = ownedThemes(skills)
  const pos = (s: Skill) => ({ x: COL_X[s.col], y: rowY(s.row) })

  return (
    <>
      <section className="panel status">
        <div className={'rankbadge' + (hasEffect(skills, 'frame') ? ' frame' : '')} data-rank={rank}>
          <small>RANG</small>
          <strong>{rank}</strong>
        </div>
        <div className="grow">
          <small className="sys">{hunterName ? hunterName.toUpperCase() : 'JÄGER'}</small>
          {title && <small className="titletag">„{title}“</small>}
          <div className="lvline">
            <span>LV</span>
            <strong>{lv.level}</strong>
          </div>
          <div className={'bar' + (hasEffect(skills, 'aura') ? ' aura' : '')}>
            <div style={{ width: `${(lv.intoLevel / lv.needed) * 100}%` }} />
          </div>
        </div>
      </section>

      <section className="panel goldpanel">
        <div className="between">
          <span className="ptitle gold">Skillpunkte</span>
          <span className="points">{free} frei</span>
        </div>
        <small className="muted">
          {earned} verdient (1 pro Level, +2 pro Rang-Aufstieg
          {hasEffect(skills, 'questPoints') ? `, +${Math.floor(questDays / 10)} durch Quest-König` : ''}) · {spent} ausgegeben
        </small>
      </section>

      <div className="tabs seg">
        <button className={view === 'skills' ? 'on' : ''} onClick={() => onView('skills')}>Skill-Baum</button>
        <button className={view === 'run' ? 'on' : ''} onClick={() => onView('run')}>Wochenlauf</button>
      </div>

      {view === 'run' ? (
        <Dungeon />
      ) : (
        <>
      <div className="tabs">
        {BRANCHES.map((b, i) => (
          <button
            key={b.key}
            className={i === branchIdx ? 'on' : ''}
            onClick={() => {
              setBranchIdx(i)
              setSelected(b.skills[0].id)
            }}
          >
            <span>{b.icon}</span>
            {b.title}
            <small>{ownedIn(b.key)}/{b.skills.length}</small>
          </button>
        ))}
      </div>

      <div className="treescroll">
        <svg viewBox={`0 0 360 ${VIEW_H}`} width="100%" role="img" aria-label={`Skill-Baum ${branch.title}`}>
          {branch.skills.flatMap((s) =>
            parentIds(s).map((p) => {
              const from = byId.get(p)!
              const a = pos(from)
              const b = pos(s)
              const on = skills.includes(s.id) && skills.includes(p)
              return <line key={s.id + p} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={on ? '#3dffb0' : '#243a6e'} strokeWidth="2.4" />
            }),
          )}
          <text x={COL_X[0]} y={rowY(2) + 68} className="pathlabel">{branch.leftName.toUpperCase()}</text>
          <text x={COL_X[4]} y={rowY(2) + 68} className="pathlabel">{branch.rightName.toUpperCase()}</text>
          {branch.skills.map((s) => {
            const st = skillStatus(skills, lv.level, free, s.id).state
            const revealed = isRevealed(skills, lv.level, s)
            const c = revealed ? COLOR[st] : '#1a2650'
            const { x, y } = pos(s)
            const big = ['root', 'goal', 'legend'].includes(s.id.split('.')[1])
            const r = big ? 24 : 20
            const lines = revealed ? wrap(s.name) : ['???']
            return (
              <g key={s.id} className="nodeg" onClick={() => setSelected(s.id)}>
                <circle cx={x} cy={y} r={32} fill="transparent" />
                <circle
                  cx={x}
                  cy={y}
                  r={r}
                  fill={st === 'unlocked' ? 'rgba(61,255,176,.15)' : '#0a1228'}
                  stroke={c}
                  strokeWidth="2.6"
                  strokeDasharray={selected === s.id ? '4 3' : undefined}
                  style={revealed && st !== 'locked' ? { filter: `drop-shadow(0 0 6px ${c})` } : undefined}
                />
                <text x={x} y={y + 4} style={{ fill: c, fontSize: 13, fontWeight: 700 }}>{revealed ? markOf(s) : '?'}</text>
                {lines.map((ln, k) => (
                  <text key={k} x={x} y={y + r + 12 + k * 10} className="nodelabel">{ln}</text>
                ))}
              </g>
            )
          })}
        </svg>
      </div>

      <section className="panel">
        <small className="sys">{branch.icon} {branch.title.toUpperCase()}</small>
        {selRevealed ? (
          <>
            <h3>{sel.name}</h3>
            <small className="muted">{sel.desc}</small>
            <small>
              Kosten: <b className="points">{sel.cost} {sel.cost === 1 ? 'Punkt' : 'Punkte'}</b> · Ab Level {sel.minLevel}
            </small>
            {sel.later && <small className="warn">Wirkt erst, sobald der {sel.later} gebaut ist.</small>}
            {selStatus.reasons.length > 0 && <small className="warn">{selStatus.reasons.join(' · ')}</small>}
            {selStatus.state === 'unlocked' ? (
              <button className="danger block" onClick={() => save(refund(skills, sel.id))}>
                Zurücksetzen (Punkte zurück)
              </button>
            ) : (
              <button
                className="primary block"
                disabled={selStatus.state !== 'available' || selStatus.reasons.length > 0}
                onClick={() => save(unlock(skills, lv.level, free, sel.id))}
              >
                Freischalten
              </button>
            )}
          </>
        ) : (
          <>
            <h3>???</h3>
            <small className="muted">Dieser Skill ist noch verborgen. Er wird sichtbar, sobald du Level {sel.minLevel - 4} erreichst.</small>
          </>
        )}
      </section>

      {(titles.length > 0 || themes.length > 0) && (
        <section className="panel">
          <h3 className="ptitle">Aussehen</h3>
          {titles.length > 0 && (
            <>
              <small className="muted">Titel unter deinem Namen</small>
              <div className="chips">
                <button className={title === '' ? 'primary' : ''} onClick={() => setSetting('title', '')}>Keiner</button>
                {titles.map((t) => (
                  <button key={t} className={title === t ? 'primary' : ''} onClick={() => setSetting('title', t)}>{t}</button>
                ))}
              </div>
            </>
          )}
          {themes.length > 0 && (
            <>
              <small className="muted">Farbthema</small>
              <div className="chips">
                <button className={theme === '' ? 'primary' : ''} onClick={() => setSetting('theme', '')}>Standard</button>
                {themes.map((t) => (
                  <button key={t} className={theme === t ? 'primary' : ''} onClick={() => setSetting('theme', t)}>{THEMES[t]}</button>
                ))}
              </div>
            </>
          )}
        </section>
      )}

      {skills.length > 0 && (
        <button
          className="danger block"
          onClick={() => window.confirm('Alle Skills zurücksetzen? Du bekommst alle Punkte zurück.') && save([])}
        >
          Alle Skills zurücksetzen
        </button>
      )}
        </>
      )}
    </>
  )
}
