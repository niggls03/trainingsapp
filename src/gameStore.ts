import { db, getSetting, todayStr, type LedgerEntry } from './db'
import { fight, fightSeconds, type FightResult, type StatKey } from './combat'
import { playerState, weeklyStreak, completedQuestDays } from './game'
import { FLOORS, gateById } from './gameData'
import {
  advance,
  buildHunter,
  challengeCost,
  gateOpen,
  maxFarmFloor,
  monsterFor,
  sanitizeGame,
  upgradeCost,
  emptyStats,
  type GameState,
  type Hunter,
  type IdleReport,
} from './gameState'
import { forgiveWeeks, sanitizeSkills } from './skills'

/**
 * Alle Schreibzugriffe auf den Spielstand laufen in einer einzigen Datenbank-Transaktion
 * (lesen, rechnen, schreiben). So wird nichts doppelt verbucht, auch wenn die Funktion
 * mehrfach oder gleichzeitig aufgerufen wird (z. B. im Entwicklungsmodus von React).
 */
async function update<T = void>(
  mutate: (game: GameState, hunter: Hunter, level: number, now: number) => { game: GameState; extra?: T } | null,
  now = Date.now(),
): Promise<{ game: GameState; report: IdleReport; extra?: T }> {
  return db.transaction('rw', db.settings, db.workouts, db.exercises, async () => {
    const [raw, workouts, exercises, goal, rawSkills, ledger] = await Promise.all([
      getSetting<unknown>('game', null),
      db.workouts.toArray(),
      db.exercises.toArray(),
      getSetting<number>('weeklyGoal', 3),
      getSetting<string[]>('skills', []),
      getSetting<LedgerEntry[]>('ledger', []),
    ])
    const skills = sanitizeSkills(rawSkills)
    const level = playerState(workouts, exercises, skills, ledger).lv.level
    const input = {
      workouts,
      exercises,
      level,
      streak: weeklyStreak(workouts, goal, todayStr(), forgiveWeeks(skills)),
      questDays: completedQuestDays(workouts, exercises),
    }
    const game0 = sanitizeGame(raw, now)
    let hunter = buildHunter({ ...input, game: game0 })
    // Erst die Zeit seit dem letzten Mal verbuchen, dann die Aktion des Spielers
    const idle = advance(game0, level, hunter.stats, now)
    let game = idle.state
    let extra: T | undefined
    if (mutate) {
      hunter = buildHunter({ ...input, game })
      const changed = mutate(game, hunter, level, now)
      if (changed) {
        game = changed.game
        extra = changed.extra
      }
    }
    if (raw === null || JSON.stringify(game) !== JSON.stringify(raw)) await db.settings.put({ key: 'game', value: game })
    return { game, report: idle.report, extra }
  })
}

/** Idle-Kampf bis jetzt verbuchen. */
export const tickGame = () => update(() => null)

/** Einen Statpunkt verteilen. */
export const allocStat = (key: StatKey) =>
  update((game, hunter) => {
    if (hunter.freePoints <= 0) return null
    return { game: { ...game, alloc: { ...hunter.alloc, [key]: hunter.alloc[key] + 1 } } }
  })

export const resetAlloc = () => update((game) => ({ game: { ...game, alloc: emptyStats() } }))

export const upgradeGear = (slot: 'weapon' | 'armor') =>
  update((game) => {
    const lv = slot === 'weapon' ? game.weaponLv : game.armorLv
    const cost = upgradeCost(lv)
    if (game.gold < cost) return null
    return {
      game: { ...game, gold: game.gold - cost, ...(slot === 'weapon' ? { weaponLv: lv + 1 } : { armorLv: lv + 1 }) },
    }
  })

export const selectFarm = (gateId: string, floor: number) =>
  update((game, _hunter, level) => {
    const gate = gateById(gateId)
    if (!gate || !gateOpen(gate, level, game.cleared)) return null
    return { game: { ...game, gate: gateId, floor: Math.min(Math.max(1, floor), maxFarmFloor(game.cleared, gateId)) } }
  })

export interface ChallengeOutcome {
  result: FightResult
  gateId: string
  floor: number
  seconds: number
}

/**
 * Nächste Etage eines Tores herausfordern. Kostet Schlüssel, aber nur bei einem Sieg:
 * Bei einer Niederlage bleibt der Schlüssel erhalten.
 */
export const challenge = (gateId: string) =>
  update<ChallengeOutcome | null>((game, hunter, level) => {
    const gate = gateById(gateId)
    if (!gate || !gateOpen(gate, level, game.cleared)) return null
    const floor = (game.cleared[gateId] ?? 0) + 1
    if (floor > FLOORS) return null
    const cost = challengeCost(floor)
    if (hunter.keysFree < cost) return null
    const result = fight(hunter.combat, monsterFor(gate, floor), game.seq)
    const next: GameState = { ...game, seq: game.seq + 1 }
    if (result.won) {
      next.keysSpent += cost
      next.cleared = { ...game.cleared, [gateId]: floor }
      next.gold += gate.gold * floor * 5
    }
    return { game: next, extra: { result, gateId, floor, seconds: fightSeconds(result.ticks) } }
  })
