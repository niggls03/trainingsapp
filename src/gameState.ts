import type { Exercise, MuscleGroup, Workout } from './db'
import { STAT_KEYS, fight, fightSeconds, rng, winChance, type Combatant, type StatKey, type Stats } from './combat'
import { FLOORS, GATES, gateById, type Gate } from './gameData'
import { byDateAsc, score } from './stats'

/** Was der Spieler entschieden hat oder was Zeit verbraucht. Alles andere wird berechnet. */
export interface GameState {
  v: 1
  /** Zeitpunkt (ms) bis zu dem der Idle-Kampf verbucht ist */
  lastTick: number
  gold: number
  kills: number
  keysSpent: number
  /** Verteilte Statpunkte */
  alloc: Stats
  weaponLv: number
  armorLv: number
  /** Tor und Etage, die der Jäger gerade automatisch bekämpft */
  gate: string
  floor: number
  /** Höchste besiegte Etage je Tor (FLOORS = Boss besiegt) */
  cleared: Record<string, number>
  /** Zähler für die Zufallszahlen der Kämpfe */
  seq: number
}

export const emptyStats = (): Stats => ({ str: 0, vit: 0, agi: 0, per: 0, int: 0 })

export const newGame = (now = Date.now()): GameState => ({
  v: 1,
  lastTick: now,
  gold: 0,
  kills: 0,
  keysSpent: 0,
  alloc: emptyStats(),
  weaponLv: 0,
  armorLv: 0,
  gate: GATES[0].id,
  floor: 1,
  cleared: {},
  seq: 1,
})

/** Gespeicherten Stand prüfen und fehlende Felder auffüllen (z. B. nach Import). */
export function sanitizeGame(raw: unknown, now = Date.now()): GameState {
  const base = newGame(now)
  if (!raw || typeof raw !== 'object') return base
  const r = raw as Partial<GameState>
  const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : d)
  const alloc = emptyStats()
  for (const k of STAT_KEYS) alloc[k] = Math.floor(num(r.alloc?.[k], 0))
  const cleared: Record<string, number> = {}
  for (const g of GATES) cleared[g.id] = Math.min(FLOORS, Math.floor(num(r.cleared?.[g.id], 0)))
  const gate = typeof r.gate === 'string' && gateById(r.gate) ? r.gate : base.gate
  return {
    v: 1,
    lastTick: num(r.lastTick, now),
    gold: Math.floor(num(r.gold, 0)),
    kills: Math.floor(num(r.kills, 0)),
    keysSpent: Math.floor(num(r.keysSpent, 0)),
    alloc,
    weaponLv: Math.floor(num(r.weaponLv, 0)),
    armorLv: Math.floor(num(r.armorLv, 0)),
    gate,
    floor: Math.max(1, Math.floor(num(r.floor, 1))),
    cleared,
    seq: Math.max(1, Math.floor(num(r.seq, 1))),
  }
}

// --- Werte aus dem Training ---------------------------------------------------------------------

const GROUP_STAT: Record<MuscleGroup, StatKey> = {
  Brust: 'str',
  Schultern: 'str',
  Trizeps: 'str',
  Beine: 'vit',
  Waden: 'vit',
  Rücken: 'agi',
  Bizeps: 'agi',
  Core: 'per',
  Nacken: 'per',
  Sonstiges: 'per',
}

export interface TrainingTotals {
  /** Trainingspunkte je Wert: Sätze + 5 je Rekord */
  points: Stats
  sets: number
  workouts: number
}

/** Sätze und Rekorde je Muskelgruppe in Kampfwerte umgerechnet (Intelligenz kommt aus Disziplin, siehe `trainedStats`). */
export function trainingTotals(workouts: Workout[], exercises: Exercise[]): TrainingTotals {
  const groupOf = new Map(exercises.map((e) => [e.id, e.muscleGroup]))
  const points = emptyStats()
  const best = new Map<string, number>()
  let sets = 0
  let count = 0
  for (const w of byDateAsc(workouts)) {
    let any = false
    for (const e of w.entries) {
      const stat = GROUP_STAT[groupOf.get(e.exerciseId) ?? 'Sonstiges']
      const prev = best.get(e.exerciseId)
      let top = prev ?? 0
      for (const s of e.sets) top = Math.max(top, score(s))
      points[stat] += e.sets.length
      sets += e.sets.length
      if (e.sets.length) any = true
      // Erste Ausführung setzt nur die Basis (wie bei den XP), danach zählt jeder Rekord
      if (prev !== undefined && top > prev + 1e-9) points[stat] += 5
      best.set(e.exerciseId, top)
    }
    if (any) count++
  }
  return { points, sets, workouts: count }
}

const fromPoints = (p: number) => Math.round(2.5 * Math.sqrt(p))

/** Wert aus dem Training allein (ohne verteilte Punkte). Intelligenz = Disziplin: Wochenserie und Quest-Tage. */
export function trainedStats(t: TrainingTotals, streak: number, questDays: number): Stats {
  return {
    str: 5 + fromPoints(t.points.str),
    vit: 5 + fromPoints(t.points.vit),
    agi: 5 + fromPoints(t.points.agi),
    per: 5 + fromPoints(t.points.per),
    int: 5 + Math.round(streak * 1.5 + questDays * 0.5),
  }
}

// --- Schlüssel ----------------------------------------------------------------------------------

/** Verdiente Schlüssel: 1 je 5 Sätze, 2 je Training, 1 je Quest-Tag. */
export const keysEarned = (t: TrainingTotals, questDays: number): number =>
  Math.floor(t.sets / 5) + 2 * t.workouts + questDays

// --- Statpunkte ---------------------------------------------------------------------------------

export const STAT_POINTS_PER_LEVEL = 3
export const statBudget = (level: number): number => (level - 1) * STAT_POINTS_PER_LEVEL

/** Verteilte Punkte, gekürzt auf das, was das Level hergibt (z. B. nachdem ein Training gelöscht wurde). */
export function effectiveAlloc(alloc: Stats, level: number): Stats {
  let left = statBudget(level)
  const out = emptyStats()
  for (const k of STAT_KEYS) {
    out[k] = Math.min(alloc[k], left)
    left -= out[k]
  }
  return out
}

// --- Jäger --------------------------------------------------------------------------------------

export interface HunterInput {
  workouts: Workout[]
  exercises: Exercise[]
  level: number
  streak: number
  questDays: number
  game: GameState
}

export interface Hunter {
  stats: Stats
  trained: Stats
  alloc: Stats
  freePoints: number
  keysFree: number
  combat: Combatant
}

export function buildHunter(input: HunterInput): Hunter {
  const { workouts, exercises, level, streak, questDays, game } = input
  const totals = trainingTotals(workouts, exercises)
  const trained = trainedStats(totals, streak, questDays)
  const alloc = effectiveAlloc(game.alloc, level)
  const stats = emptyStats()
  for (const k of STAT_KEYS) stats[k] = trained[k] + alloc[k]
  const spent = STAT_KEYS.reduce((n, k) => n + alloc[k], 0)
  return {
    stats,
    trained,
    alloc,
    freePoints: statBudget(level) - spent,
    keysFree: Math.max(0, keysEarned(totals, questDays) - game.keysSpent),
    combat: combatantFor(stats, level, game),
  }
}

export function combatantFor(stats: Stats, level: number, game: Pick<GameState, 'weaponLv' | 'armorLv'>): Combatant {
  return {
    name: 'Jäger',
    icon: '🗡️',
    hp: Math.round(100 + stats.vit * 14 + (level - 1) * 8 + game.armorLv * 25),
    atk: (10 + stats.str * 2.4 + (level - 1) * 1.2) * (1 + 0.08 * game.weaponLv),
    def: 2 + stats.vit * 0.5 + stats.agi * 0.4 + game.armorLv * 2,
    spd: 1 + stats.agi * 0.015,
    crit: Math.min(0.6, 0.05 + stats.per * 0.008),
    critMult: 1.6 + stats.int * 0.01,
    dodge: Math.min(0.35, stats.agi * 0.004),
  }
}

// --- Monster ------------------------------------------------------------------------------------

export const isBossFloor = (floor: number): boolean => floor >= FLOORS

/** Monster einer Etage. `pick` wählt aus der Monsterliste (Boss auf der letzten Etage). */
export function monsterFor(gate: Gate, floor: number, pick = 0): Combatant {
  const f = Math.min(Math.max(1, floor), FLOORS)
  const boss = isBossFloor(f)
  const def = boss ? gate.boss : gate.monsters[pick % gate.monsters.length]
  const hpMult = (1 + 0.45 * (f - 1)) * (boss ? 2.2 : 1)
  const atkMult = (1 + 0.3 * (f - 1)) * (boss ? 1.4 : 1)
  return {
    name: def.name,
    icon: def.icon,
    hp: Math.round(gate.hp * hpMult),
    atk: gate.atk * atkMult,
    def: gate.def * (1 + 0.15 * (f - 1)),
    spd: gate.spd,
    crit: 0.05,
    critMult: 1.5,
    dodge: 0.03,
  }
}

export const goldFor = (gate: Gate, floor: number): number => Math.round(gate.gold * (1 + 0.25 * (floor - 1)))

/** Schlüssel, die eine Herausforderung kostet (Boss kostet mehr). */
export const challengeCost = (floor: number): number => (isBossFloor(floor) ? 2 : 1)

export function gateOpen(gate: Gate, level: number, cleared: Record<string, number>): boolean {
  if (level < gate.minLevel) return false
  const i = GATES.indexOf(gate)
  return i === 0 || (cleared[GATES[i - 1].id] ?? 0) >= FLOORS
}

/** Höchste Etage, die der Jäger im Tor automatisch bekämpfen darf. */
export const maxFarmFloor = (cleared: Record<string, number>, gateId: string): number =>
  Math.min(FLOORS - 1, Math.max(1, cleared[gateId] ?? 0))

// --- Kosten -------------------------------------------------------------------------------------

export const upgradeCost = (lv: number): number => Math.round(60 * Math.pow(1.5, lv))

// --- Idle-Kampf ---------------------------------------------------------------------------------

export const MAX_OFFLINE_SECONDS = 8 * 3600
const MAX_FIGHTS = 3000

export interface IdleReport {
  seconds: number
  fights: number
  wins: number
  gold: number
}

/**
 * Verbucht den automatischen Kampf von `state.lastTick` bis `now`. Höchstens 8 Stunden am Stück,
 * damit Offline-Zeit nicht unbegrenzt anwächst. Rein: gibt einen neuen Stand zurück.
 */
export function advance(state: GameState, level: number, stats: Stats, now: number): { state: GameState; report: IdleReport } {
  const report: IdleReport = { seconds: 0, fights: 0, wins: 0, gold: 0 }
  const gate = gateById(state.gate)
  const rawElapsed = Math.max(0, (now - state.lastTick) / 1000)
  const elapsed = Math.min(MAX_OFFLINE_SECONDS, rawElapsed)
  if (!gate || elapsed < 1) return { state, report }

  const floor = Math.min(state.floor, maxFarmFloor(state.cleared, gate.id))
  const hunter = combatantFor(stats, level, state)
  const picker = rng(state.seq * 977)
  let t = 0
  let seq = state.seq
  while (report.fights < MAX_FIGHTS) {
    const enemy = monsterFor(gate, floor, Math.floor(picker() * gate.monsters.length))
    const result = fight(hunter, enemy, seq)
    const secs = fightSeconds(result.ticks) + (result.won ? 0 : 15)
    if (t + secs > elapsed) break
    seq++
    t += secs
    report.fights++
    if (result.won) {
      report.wins++
      report.gold += goldFor(gate, floor)
    }
  }
  report.seconds = Math.round(t)
  // Angefangene Kämpfe bleiben für den nächsten Aufruf liegen; was älter als 8 h ist, verfällt
  const lastTick = rawElapsed > MAX_OFFLINE_SECONDS || report.fights >= MAX_FIGHTS ? now : state.lastTick + t * 1000
  const next: GameState = { ...state, lastTick, seq, floor, gold: state.gold + report.gold, kills: state.kills + report.wins }
  return { state: next, report }
}

export { winChance }
