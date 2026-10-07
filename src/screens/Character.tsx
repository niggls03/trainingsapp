import { useState } from 'react'
import { setSetting } from '../db'
import type { CharView } from '../App'
import { Dungeon } from './Dungeon'
import { SkillTree } from './SkillTree'
import {
  BRANCHES,
  THEMES,
  hasEffect,
  ownedThemes,
  ownedTitles,
} from '../skills'
import { useData } from '../useData'

export function Character({ view, onView }: { view: CharView; onView: (v: CharView) => void }) {
  const { loaded, hunterName, skills, theme, title, player } = useData()
  const [branchIdx, setBranchIdx] = useState(0)
  const [treeOpen, setTreeOpen] = useState(false)
  if (!loaded) return null

  const { lv, rank, earned, free, spent, questDays } = player
  const branch = BRANCHES[branchIdx]
  const save = (next: string[]) => setSetting('skills', next)
  const ownedIn = (key: string) => skills.filter((id) => id.startsWith(key + '.')).length
  const titles = ownedTitles(skills)
  const themes = ownedThemes(skills)

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
            }}
          >
            <span>{b.icon}</span>
            {b.title}
            <small>{ownedIn(b.key)}/{b.skills.length}</small>
          </button>
        ))}
      </div>

      <section className="panel">
        <small className="sys">{branch.icon} {branch.title.toUpperCase()}</small>
        <small className="muted">
          {ownedIn(branch.key)} von {branch.skills.length} Skills freigeschaltet
        </small>
        <button className="primary block" onClick={() => setTreeOpen(true)}>
          Skill-Baum öffnen
        </button>
      </section>
      {treeOpen && <SkillTree initialBranch={branchIdx} onClose={() => setTreeOpen(false)} />}

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
