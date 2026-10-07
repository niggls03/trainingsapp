/** Kampf-Simulation: rein, seed-basiert und ohne Datenbank (gleicher Seed = gleicher Kampf). */

export const STAT_KEYS = ['str', 'vit', 'agi', 'per', 'int'] as const
export type StatKey = (typeof STAT_KEYS)[number]
export type Stats = Record<StatKey, number>

export const STAT_NAMES: Record<StatKey, string> = {
  str: 'Stärke',
  vit: 'Vitalität',
  agi: 'Beweglichkeit',
  per: 'Wahrnehmung',
  int: 'Intelligenz',
}

export interface Combatant {
  name: string
  icon: string
  hp: number
  atk: number
  def: number
  /** Angriffe pro Zug (1 = jeder Zug) */
  spd: number
  crit: number
  critMult: number
  dodge: number
}

export interface FightEvent {
  /** Zug-Nummer (ein Zug = 0,5 s Spielzeit) */
  tick: number
  by: 'hunter' | 'enemy'
  dmg: number
  crit: boolean
  miss: boolean
  /** Lebenspunkte des Getroffenen nach dem Schlag */
  hpLeft: number
}

export interface FightResult {
  won: boolean
  ticks: number
  hunterHpLeft: number
  log: FightEvent[]
}

export const TICK_SECONDS = 0.5
export const MAX_TICKS = 240

/** Kleiner, schneller Zufallsgenerator (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function fight(hunter: Combatant, enemy: Combatant, seed: number): FightResult {
  const rand = rng(seed)
  let hh = hunter.hp
  let eh = enemy.hp
  let hg = 0
  let eg = 0
  const log: FightEvent[] = []

  const strike = (att: Combatant, def: Combatant, tick: number, by: FightEvent['by'], hpBefore: number) => {
    if (rand() < def.dodge) {
      log.push({ tick, by, dmg: 0, crit: false, miss: true, hpLeft: hpBefore })
      return hpBefore
    }
    const crit = rand() < att.crit
    const raw = att.atk * (0.9 + rand() * 0.2) * (crit ? att.critMult : 1) - def.def * 0.6
    const dmg = Math.max(1, Math.round(raw))
    const hpLeft = Math.max(0, hpBefore - dmg)
    log.push({ tick, by, dmg, crit, miss: false, hpLeft })
    return hpLeft
  }

  let tick = 0
  while (hh > 0 && eh > 0 && tick < MAX_TICKS) {
    tick++
    hg += hunter.spd
    eg += enemy.spd
    while (hg >= 1 && eh > 0) {
      hg -= 1
      eh = strike(hunter, enemy, tick, 'hunter', eh)
    }
    while (eg >= 1 && eh > 0 && hh > 0) {
      eg -= 1
      hh = strike(enemy, hunter, tick, 'enemy', hh)
    }
  }
  return { won: eh <= 0 && hh > 0, ticks: tick, hunterHpLeft: hh, log }
}

/** Dauer eines Kampfes in Spielsekunden inklusive kurzer Pause. */
export const fightSeconds = (ticks: number): number => Math.max(4, ticks * TICK_SECONDS) + 3

/** Gewinnchance, geschätzt aus mehreren Probekämpfen (0 bis 1). */
export function winChance(hunter: Combatant, enemy: Combatant, runs = 30): number {
  let wins = 0
  for (let i = 0; i < runs; i++) if (fight(hunter, enemy, 7919 * (i + 1)).won) wins++
  return wins / runs
}
