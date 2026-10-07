import { useEffect, useMemo, useState } from 'react'
import { STAT_KEYS, STAT_NAMES, fight, winChance, type Combatant, type FightResult } from '../combat'
import { todayStr } from '../db'
import { weeklyStreak } from '../game'
import { FLOORS, GATES, type Gate } from '../gameData'
import {
  buildHunter,
  challengeCost,
  gateOpen,
  goldFor,
  isBossFloor,
  maxFarmFloor,
  monsterFor,
  upgradeCost,
  type IdleReport,
} from '../gameState'
import { allocStat, challenge, resetAlloc, selectFarm, tickGame, upgradeGear, type ChallengeOutcome } from '../gameStore'
import { forgiveWeeks } from '../skills'
import { useData } from '../useData'

const STEP_MS = 450

/** Spielt einen Kampf Schlag für Schlag ab. `onDone` kommt kurz nach dem letzten Schlag. */
function BattleView({
  hunter,
  enemy,
  result,
  onDone,
}: {
  hunter: Combatant
  enemy: Combatant
  result: FightResult
  onDone?: () => void
}) {
  const [step, setStep] = useState(0)
  const total = result.log.length
  useEffect(() => {
    const id = window.setInterval(() => setStep((s) => s + 1), STEP_MS)
    return () => window.clearInterval(id)
  }, [])
  useEffect(() => {
    if (step === total + 3) onDone?.()
  }, [step, total, onDone])

  const shown = result.log.slice(0, Math.min(step, total))
  const last = shown[shown.length - 1]
  const hpOf = (by: 'hunter' | 'enemy', max: number) => {
    // Lebenspunkte des Getroffenen: Schläge des Gegners treffen den Jäger und umgekehrt
    const hit = [...shown].reverse().find((e) => e.by !== by)
    return hit ? hit.hpLeft : max
  }
  const hh = hpOf('hunter', hunter.hp)
  const eh = hpOf('enemy', enemy.hp)
  const dead = step > total
  return (
    <div className="battle">
      <div className="fighters">
        <div className={'fighter' + (last?.by === 'hunter' && step <= total ? ' hit' : '') + (dead && !result.won ? ' down' : '')}>
          <span className="sprite">{hunter.icon}</span>
          <div className="bar"><div style={{ width: `${(hh / hunter.hp) * 100}%` }} /></div>
          <small>{hunter.name} · {Math.round(hh)}/{hunter.hp}</small>
        </div>
        <div className="vs">
          {last && step <= total && (
            <span key={step} className={'dmg' + (last.crit ? ' crit' : '') + (last.by === 'enemy' ? ' taken' : '')}>
              {last.miss ? 'Daneben' : `${last.crit ? '💥 ' : ''}-${last.dmg}`}
            </span>
          )}
        </div>
        <div className={'fighter' + (last?.by === 'enemy' && step <= total ? ' hit' : '') + (dead && result.won ? ' down' : '')}>
          <span className="sprite">{enemy.icon}</span>
          <div className="bar boss"><div style={{ width: `${(eh / enemy.hp) * 100}%` }} /></div>
          <small>{enemy.name} · {Math.round(eh)}/{enemy.hp}</small>
        </div>
      </div>
    </div>
  )
}

const fmtTime = (s: number) => {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  return h > 0 ? `${h} Std. ${m} Min.` : `${m} Min.`
}

function GateCard({
  gate,
  hunter,
  level,
  cleared,
  farming,
  farmFloor,
  onChallenge,
}: {
  gate: Gate
  hunter: ReturnType<typeof buildHunter>
  level: number
  cleared: Record<string, number>
  farming: boolean
  farmFloor: number
  onChallenge: (g: Gate) => void
}) {
  const open = gateOpen(gate, level, cleared)
  const done = cleared[gate.id] ?? 0
  const next = done + 1
  const cost = challengeCost(next)
  const chance = useMemo(
    () => (open && next <= FLOORS ? winChance(hunter.combat, monsterFor(gate, next)) : 0),
    [open, next, hunter.combat, gate],
  )
  const maxFloor = maxFarmFloor(cleared, gate.id)
  return (
    <section className={'panel gate' + (open ? '' : ' locked')}>
      <div className="between">
        <h3>{gate.name}</h3>
        <span className="rankchip" data-rank={gate.rank}>{gate.rank}</span>
      </div>
      <div className="floors">
        {Array.from({ length: FLOORS }, (_, i) => (
          <span key={i} className={i < done ? 'done' : i === done && open ? 'next' : ''}>{i + 1 === FLOORS ? '👑' : i + 1}</span>
        ))}
      </div>
      {!open ? (
        <small className="muted">
          {level < gate.minLevel ? `Ab Level ${gate.minLevel} (Rang ${gate.rank}).` : 'Erst das vorherige Tor abschließen.'}
        </small>
      ) : (
        <>
          {done >= FLOORS ? (
            <small className="good">Tor abgeschlossen.</small>
          ) : (
            <button
              className="primary block"
              disabled={hunter.keysFree < cost}
              onClick={() => onChallenge(gate)}
            >
              {isBossFloor(next) ? `Boss: ${gate.boss.name}` : `Etage ${next} herausfordern`} · 🔑{cost} · Chance {Math.round(chance * 100)} %
            </button>
          )}
          <div className="between">
            <small className="muted">
              {farming ? `Hier wird gekämpft (Etage ${farmFloor}) · ${goldFor(gate, farmFloor)} Gold pro Sieg` : 'Automatisch kämpfen auf:'}
            </small>
          </div>
          <div className="chips">
            {Array.from({ length: maxFloor }, (_, i) => i + 1).map((f) => (
              <button
                key={f}
                className={farming && farmFloor === f ? 'primary' : ''}
                onClick={() => selectFarm(gate.id, f)}
              >
                Etage {f}
              </button>
            ))}
          </div>
        </>
      )}
    </section>
  )
}

export function Game() {
  const { loaded, workouts, exercises, weeklyGoal, skills, game, player } = useData()
  const [welcome, setWelcome] = useState<IdleReport | null>(null)
  const [duel, setDuel] = useState<ChallengeOutcome | null>(null)
  const [duelDone, setDuelDone] = useState(false)
  const [round, setRound] = useState(0)

  // Beim Öffnen die Zeit seit dem letzten Mal verbuchen, danach alle paar Sekunden
  useEffect(() => {
    tickGame().then((r) => {
      if (r.report.seconds >= 120 && r.report.wins > 0) setWelcome(r.report)
    })
    const id = window.setInterval(() => void tickGame(), 5000)
    return () => window.clearInterval(id)
  }, [])

  const level = player.lv.level
  const hunter = useMemo(
    () =>
      buildHunter({
        workouts,
        exercises,
        level,
        streak: weeklyStreak(workouts, weeklyGoal, todayStr(), forgiveWeeks(skills)),
        questDays: player.questDays,
        game,
      }),
    [workouts, exercises, level, weeklyGoal, skills, player.questDays, game],
  )

  const gate = GATES.find((g) => g.id === game.gate) ?? GATES[0]
  const farmFloor = Math.min(game.floor, maxFarmFloor(game.cleared, gate.id))
  const idleFight = useMemo(
    () => {
      const enemy = monsterFor(gate, farmFloor, round)
      return { enemy, result: fight(hunter.combat, enemy, game.seq + round * 31) }
    },
    // Der Schaukampf wird nur zwischen den Kämpfen neu gewürfelt, nicht bei jedem Zahlenwechsel
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [gate.id, farmFloor, round],
  )

  if (!loaded) return null
  const c = hunter.combat
  const duelEnemy = duel ? monsterFor(GATES.find((g) => g.id === duel.gateId)!, duel.floor) : null

  return (
    <>
      {welcome && (
        <section className="panel goldpanel">
          <small className="sys">Während du weg warst</small>
          <p>
            Dein Jäger hat {fmtTime(welcome.seconds)} gekämpft: <b>{welcome.wins}</b> Siege, <b className="points">+{welcome.gold} Gold</b>.
          </p>
          <button onClick={() => setWelcome(null)}>OK</button>
        </section>
      )}

      <section className="panel">
        <div className="between">
          <small className="sys">Auto-Kampf · {gate.name}</small>
          <small className="muted">Etage {farmFloor}</small>
        </div>
        <BattleView
          key={round}
          hunter={c}
          enemy={idleFight.enemy}
          result={idleFight.result}
          onDone={() => setRound((r) => r + 1)}
        />
        <div className="between">
          <span className="points">🪙 {game.gold} Gold</span>
          <span>🔑 {hunter.keysFree} Schlüssel</span>
          <small className="muted">{game.kills} Siege</small>
        </div>
        <small className="muted">
          Der Jäger kämpft auch, wenn die App zu ist (bis 8 Std.). Schlüssel verdienst du im Gym: 1 je 5 Sätze, 2 je Training, 1 je Quest-Tag.
        </small>
      </section>

      {GATES.map((g) => (
        <GateCard
          key={g.id}
          gate={g}
          hunter={hunter}
          level={level}
          cleared={game.cleared}
          farming={g.id === gate.id}
          farmFloor={farmFloor}
          onChallenge={(gt) =>
            challenge(gt.id).then((r) => {
              if (r.extra) {
                setDuelDone(false)
                setDuel(r.extra)
              }
            })
          }
        />
      ))}

      <section className="panel">
        <div className="between">
          <h3 className="ptitle">Werte</h3>
          <span className="points">{hunter.freePoints} Punkte frei</span>
        </div>
        <small className="muted">Training bestimmt die Basis, pro Level kommen 3 Punkte zum Verteilen dazu.</small>
        {STAT_KEYS.map((k) => (
          <div className="statrow" key={k}>
            <span>{STAT_NAMES[k]}</span>
            <b>{hunter.stats[k]}</b>
            <small className="muted">
              {hunter.trained[k]} Training{hunter.alloc[k] > 0 ? ` + ${hunter.alloc[k]}` : ''}
            </small>
            <button disabled={hunter.freePoints <= 0} onClick={() => allocStat(k)}>+</button>
          </div>
        ))}
        <small className="muted">
          ❤️ {c.hp} · ⚔️ {Math.round(c.atk)} · 🛡️ {Math.round(c.def)} · ⚡ {c.spd.toFixed(2)} · Krit {Math.round(c.crit * 100)} %
        </small>
        {STAT_KEYS.some((k) => hunter.alloc[k] > 0) && (
          <button className="danger block" onClick={() => window.confirm('Alle verteilten Punkte zurücknehmen?') && resetAlloc()}>
            Punkte neu verteilen
          </button>
        )}
      </section>

      <section className="panel">
        <h3 className="ptitle">Schmiede</h3>
        {(['weapon', 'armor'] as const).map((slot) => {
          const lv = slot === 'weapon' ? game.weaponLv : game.armorLv
          const cost = upgradeCost(lv)
          return (
            <div className="between" key={slot}>
              <span>
                {slot === 'weapon' ? '🗡️ Waffe' : '🛡️ Rüstung'} <b>Stufe {lv}</b>
                <small className="muted"> {slot === 'weapon' ? '+8 % Angriff' : '+25 Leben, +2 Abwehr'} je Stufe</small>
              </span>
              <button disabled={game.gold < cost} onClick={() => upgradeGear(slot)}>🪙 {cost}</button>
            </div>
          )
        })}
      </section>

      {duel && duelEnemy && (
        <div className="overlay">
          <section className="panel duel">
            <small className="sys">{isBossFloor(duel.floor) ? 'Boss-Kampf' : `Etage ${duel.floor}`}</small>
            <BattleView
              key={duel.result.log.length + '-' + duel.floor + '-' + game.seq}
              hunter={c}
              enemy={duelEnemy}
              result={duel.result}
              onDone={() => setDuelDone(true)}
            />
            {duelDone ? (
              <>
                <h2 className={duel.result.won ? 'good' : 'bad'}>{duel.result.won ? 'Sieg!' : 'Niederlage'}</h2>
                <small className="muted">
                  {duel.result.won ? 'Etage geschafft, Schlüssel verbraucht, Bonus-Gold erhalten.' : 'Der Schlüssel bleibt erhalten. Werte verbessern und es erneut versuchen.'}
                </small>
                <button className="primary block" onClick={() => setDuel(null)}>Weiter</button>
              </>
            ) : (
              <button className="ghost block" onClick={() => setDuelDone(true)}>Überspringen</button>
            )}
          </section>
        </div>
      )}
    </>
  )
}
