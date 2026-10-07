import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { fight, winChance } from './combat'
import { db, getSetting, type Exercise, type Workout } from './db'
import { GATES } from './gameData'
import {
  advance,
  buildHunter,
  combatantFor,
  effectiveAlloc,
  keysEarned,
  monsterFor,
  newGame,
  sanitizeGame,
  trainingTotals,
  emptyStats,
  type GameState,
} from './gameState'
import { allocStat, challenge, tickGame, upgradeGear } from './gameStore'

const ex: Exercise[] = [
  { id: 'bank', name: 'Bankdrücken', muscleGroup: 'Brust' },
  { id: 'bein', name: 'Beinpresse', muscleGroup: 'Beine' },
]
const w = (date: string, exId: string, kg: number, n = 3): Workout => ({
  id: date + exId,
  date,
  entries: [{ exerciseId: exId, sets: Array.from({ length: n }, () => ({ kg, reps: 8 })) }],
})
const base = emptyStats()
const stats = { ...base, str: 20, vit: 20, agi: 10, per: 10, int: 10 }
const hunter = combatantFor(stats, 5, { weaponLv: 0, armorLv: 0 })
const T0 = 1_800_000_000_000

describe('Kampf', () => {
  it('gleicher Seed gibt denselben Kampf', () => {
    const e = monsterFor(GATES[0], 2)
    expect(fight(hunter, e, 42)).toEqual(fight(hunter, e, 42))
  })

  it('endet immer und hat ein Ergebnis', () => {
    const r = fight(hunter, monsterFor(GATES[2], 5), 1)
    expect(r.ticks).toBeLessThanOrEqual(240)
    expect(typeof r.won).toBe('boolean')
  })

  it('stärkerer Jäger gewinnt häufiger', () => {
    const weak = combatantFor({ ...base, str: 5, vit: 5, agi: 5, per: 5, int: 5 }, 1, { weaponLv: 0, armorLv: 0 })
    const strong = combatantFor({ ...base, str: 40, vit: 40, agi: 20, per: 20, int: 20 }, 10, { weaponLv: 3, armorLv: 3 })
    const e = monsterFor(GATES[0], 4)
    expect(winChance(strong, e)).toBeGreaterThan(winChance(weak, e))
  })
})

describe('Werte und Schlüssel', () => {
  it('Sätze zählen, ein Rekord gibt Bonuspunkte, die erste Ausführung nicht', () => {
    const t = trainingTotals([w('2026-10-01', 'bank', 60), w('2026-10-03', 'bank', 70)], ex)
    expect(t.points.str).toBe(3 + 3 + 5)
    expect(t.sets).toBe(6)
    expect(t.workouts).toBe(2)
  })

  it('Schlüssel: 1 je 5 Sätze, 2 je Training, 1 je Quest-Tag', () => {
    const t = trainingTotals([w('2026-10-01', 'bank', 60, 5), w('2026-10-03', 'bein', 80, 5)], ex)
    expect(keysEarned(t, 1)).toBe(2 + 4 + 1)
  })

  it('verteilte Punkte werden auf das Level gekürzt', () => {
    expect(effectiveAlloc({ ...base, str: 10, vit: 10 }, 3)).toEqual({ ...base, str: 6 })
  })

  it('kaputte gespeicherte Daten werden repariert', () => {
    const g = sanitizeGame({ gold: -5, alloc: { str: 'x' }, gate: 'gibt-es-nicht', cleared: { 'e-hoehle': 99 } }, T0)
    expect(g.gold).toBe(0)
    expect(g.alloc.str).toBe(0)
    expect(g.gate).toBe(GATES[0].id)
    expect(g.cleared['e-hoehle']).toBe(5)
  })
})

describe('Idle-Kampf', () => {
  const g0: GameState = { ...newGame(T0), lastTick: T0 }

  it('verbucht nichts bei weniger als einer Sekunde', () => {
    const r = advance(g0, 5, stats, T0 + 500)
    expect(r.state).toBe(g0)
  })

  it('zweimal mit derselben Zeit verbucht nichts doppelt', () => {
    const a = advance(g0, 5, stats, T0 + 3600_000)
    expect(a.report.fights).toBeGreaterThan(10)
    const b = advance(a.state, 5, stats, T0 + 3600_000)
    expect(b.report.fights).toBe(0)
    expect(b.state.gold).toBe(a.state.gold)
  })

  it('in Schritten verbucht ist ungefähr so viel wie am Stück', () => {
    let s = g0
    let gold = 0
    for (let i = 1; i <= 720; i++) {
      const r = advance(s, 5, stats, T0 + i * 5000)
      s = r.state
      gold += r.report.gold
    }
    const once = advance(g0, 5, stats, T0 + 3600_000)
    expect(gold).toBe(s.gold)
    expect(Math.abs(gold - once.report.gold) / once.report.gold).toBeLessThan(0.15)
  })

  it('Offline-Zeit ist auf 8 Stunden begrenzt', () => {
    const r = advance(g0, 5, stats, T0 + 30 * 3600_000)
    expect(r.report.seconds).toBeLessThanOrEqual(8 * 3600)
    expect(r.state.lastTick).toBe(T0 + 30 * 3600_000)
  })
})

describe('Spielstand speichern', () => {
  beforeEach(async () => {
    await Promise.all([db.exercises.clear(), db.workouts.clear(), db.settings.clear()])
    await db.exercises.bulkAdd(ex)
  })

  it('Tick legt den Stand an und ist wiederholbar', async () => {
    await tickGame()
    const a = await getSetting<GameState | null>('game', null)
    expect(a?.v).toBe(1)
    await Promise.all([tickGame(), tickGame()])
    expect((await getSetting<GameState | null>('game', null))?.gold).toBeGreaterThanOrEqual(a!.gold)
  })

  it('Herausforderung ohne Schlüssel ändert nichts', async () => {
    const r = await challenge(GATES[0].id)
    expect(r.extra).toBeUndefined()
    expect((await getSetting<GameState>('game', newGame())).keysSpent).toBe(0)
  })

  it('Sieg verbraucht Schlüssel und öffnet die nächste Etage, Niederlage nicht', async () => {
    // Viele Trainings = viele Schlüssel und Stärke
    for (let d = 1; d <= 20; d++) await db.workouts.add(w(`2026-09-${String(d).padStart(2, '0')}`, d % 2 ? 'bank' : 'bein', 40 + d, 5))
    const r = await challenge(GATES[0].id)
    expect(r.extra).toBeTruthy()
    const g = await getSetting<GameState>('game', newGame())
    if (r.extra!.result.won) {
      expect(g.keysSpent).toBe(1)
      expect(g.cleared[GATES[0].id]).toBe(1)
    } else {
      expect(g.keysSpent).toBe(0)
      expect(g.cleared[GATES[0].id] ?? 0).toBe(0)
    }
  })

  it('Statpunkte und Waffe lassen sich nur mit Guthaben kaufen', async () => {
    await allocStat('str')
    expect((await getSetting<GameState>('game', newGame())).alloc.str).toBe(0) // Level 1 hat keine Punkte
    await upgradeGear('weapon')
    expect((await getSetting<GameState>('game', newGame())).weaponLv).toBe(0) // kein Gold
  })

  it('Jäger wird aus Training und Level gebaut', () => {
    const h = buildHunter({ workouts: [w('2026-10-01', 'bank', 60)], exercises: ex, level: 4, streak: 0, questDays: 0, game: newGame(T0) })
    expect(h.freePoints).toBe(9)
    expect(h.stats.str).toBeGreaterThan(h.stats.vit)
  })
})
