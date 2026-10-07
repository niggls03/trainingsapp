import { muscleLevels, questsFor, weeklyStreak, XP_PER_QUEST } from '../game'
import { bestQuestRepsOn } from '../quests'
import { currentRow, generateRun } from '../run'
import { forgiveWeeks, hasEffect, questCount } from '../skills'
import { todayStr } from '../db'
import { formatDate, weekStart, workoutsPerWeek, byDateAsc } from '../stats'
import { useData } from '../useData'
import type { CharView, Tab, WorkoutRequest } from '../App'

export function Home({ onStart, onNavigate }: { onStart: (r: WorkoutRequest) => void; onNavigate: (t: Tab, view?: CharView) => void }) {
  const { loaded, exercises, templates, workouts, weeklyGoal, hunterName, skills, title, player, run, ledger } = useData()
  if (!loaded) return null

  const lv = player.lv
  const rank = player.rank
  const today = todayStr()
  const streak = weeklyStreak(workouts, weeklyGoal, today, forgiveWeeks(skills))
  const thisWeek = workoutsPerWeek(workouts).get(weekStart(today)) ?? 0
  const last = byDateAsc(workouts).at(-1)
  const quests = questsFor(today, questCount(skills)).map((q) => {
    const best = bestQuestRepsOn(today, workouts, exercises, q)
    return { q, best, done: best >= q.target }
  })
  const muscles = muscleLevels(workouts, exercises)
  const week = weekStart(today)
  const bossMax = Math.max(1, run?.week === week ? run.goal : weeklyGoal)
  const bossHp = Math.max(0, bossMax - thisWeek)
  const bossName = generateRun(week).bossName
  const nextRow = currentRow(week, ledger)
  const pendingOffer = run?.week === week && Object.values(run.offers).some((o) => !o.taken)

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
          <small className="muted">
            {lv.intoLevel} / {lv.needed} XP bis Level {lv.level + 1}
          </small>
        </div>
      </section>

      <section className="row">
        <div className="panel stat">
          <small className="sys">SERIE</small>
          <strong>{streak}</strong>
          <small className="muted">{streak === 1 ? 'Woche' : 'Wochen'} in Folge</small>
        </div>
        <div className="panel stat">
          <small className="sys">DIESE WOCHE</small>
          <div className="pips">
            {Array.from({ length: Math.max(weeklyGoal, thisWeek) }, (_, i) => (
              <span key={i} className={i < thisWeek ? 'on' : ''} />
            ))}
          </div>
          <small className="muted">
            {thisWeek} von {weeklyGoal} Trainings
          </small>
        </div>
      </section>

      {quests.map(({ q, best, done }) => (
        <section key={q.exerciseName} className={'panel quest' + (done ? ' done' : '')}>
          <small className="sys">{done ? '[ QUEST ABGESCHLOSSEN ]' : '[ TÄGLICHE QUEST ]'}</small>
          <h3 className="qtitle">
            {q.target} × {q.exerciseName}
          </h3>
          <div className="bar">
            <div style={{ width: `${Math.min(100, (best / q.target) * 100)}%` }} />
          </div>
          <small className="muted">
            {done
              ? `Geschafft! +${XP_PER_QUEST} XP sind verbucht.`
              : `Fortschritt heute: ${best} / ${q.target}. Schaffst du es in einem Training: +${XP_PER_QUEST} XP.`}
          </small>
          {!done && (
            <button className="primary block" onClick={() => onStart({ questExercise: { name: q.exerciseName, group: q.group } })}>
              Quest starten
            </button>
          )}
        </section>
      ))}

      <section className="panel boss">
        <small className="sys">[ WOCHENLAUF ]</small>
        <b>{bossName}</b>
        <div className={'bar boss' + (hasEffect(skills, 'bossBar') ? ' bossfx' : '')}>
          <div style={{ width: `${(bossHp / bossMax) * 100}%` }} />
        </div>
        <small className="muted">
          {bossHp > 0 ? `Boss: noch ${bossHp} von ${bossMax} Lebenspunkten (jedes Training schlägt 1 ab).` : 'Boss besiegt!'}
        </small>
        {nextRow <= 3 && (
          <button className="block" onClick={() => onNavigate('character', 'run')}>
            {run?.picks[String(nextRow)] ? `Raum ${nextRow} läuft: Aufgabe ansehen` : `[ Wähle deinen nächsten Raum ] (Raum ${nextRow})`}
          </button>
        )}
        {pendingOffer && (
          <button className="primary block" onClick={() => onNavigate('character', 'run')}>
            Relikt wartet auf dich
          </button>
        )}
      </section>

      <section className="panel">
        <h3 className="ptitle">Training starten</h3>
        {templates.length === 0 ? (
          <>
            <p className="muted">Du hast noch keinen Trainingstag. Lege zuerst deinen Plan an.</p>
            <button className="primary block" onClick={() => onNavigate('plan')}>
              Plan anlegen
            </button>
          </>
        ) : (
          templates.map((t) => (
            <button key={t.id} className="primary block" onClick={() => onStart({ templateId: t.id })}>
              {t.name}
              <small> · {t.exerciseIds.length} Übungen</small>
            </button>
          ))
        )}
        <button className="block" onClick={() => onStart({})}>
          Freies Training (ohne Plan)
        </button>
      </section>

      <section className="panel">
        <h3 className="ptitle">Stats</h3>
        {muscles.length === 0 ? (
          <p className="muted">Hier wachsen deine Muskelgruppen mit jedem Satz, den du einträgst.</p>
        ) : (
          muscles.map(({ group, level }) => (
            <div className="muscle" key={group}>
              <span>{group}</span>
              <div className="bar">
                <div style={{ width: `${(level.intoLevel / level.needed) * 100}%` }} />
              </div>
              <strong>Lv {level.level}</strong>
            </div>
          ))
        )}
      </section>

      <p className="muted center">
        {last ? `Zuletzt trainiert: ${formatDate(last.date)}` : 'Noch kein Training. Dein Weg beginnt jetzt.'}
      </p>
    </>
  )
}
