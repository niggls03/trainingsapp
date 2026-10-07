import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { db, setSetting, type Exercise, type LedgerEntry, type Workout } from './db'
import { playerState, totalXp, xpForWorkout } from './game'
import {
  BOSS_XP,
  chooseRelic,
  currentRow,
  generateRun,
  offerRelics,
  pickRoom,
  reconcile,
  relicsFor,
  taskProgress,
  freshRun,
} from './run'
import { addDays } from './stats'
import { reconcileStored, pickRoomStored, chooseRelicStored } from './runStore'

const ex: Exercise[] = [
  { id: 'bank', name: 'Bankdrücken', muscleGroup: 'Brust' },
  { id: 'bein', name: 'Beinpresse', muscleGroup: 'Beine' },
]
const WEEK = '2026-10-05' // Montag
const wk = (date: string, exId = 'bank', kg = 60, reps = 8, n = 3): Workout => ({
  id: date + exId + kg,
  date,
  entries: [{ exerciseId: exId, sets: Array.from({ length: n }, () => ({ kg, reps })) }],
})
const base = { exercises: ex, weeklyGoal: 3 }

describe('karte', () => {
  it('gleiche Woche = gleiche Karte, andere Woche = andere', () => {
    expect(generateRun(WEEK)).toEqual(generateRun(WEEK))
    expect(JSON.stringify(generateRun('2026-10-12'))).not.toBe(JSON.stringify(generateRun(WEEK)))
  })
  it('alle 6 Aufgaben sind verschieden, Elite kommt aus dem Elite-Pool, Typen stimmen', () => {
    for (const week of ['2026-10-05', '2026-10-12', '2026-10-19', '2027-01-04', '2027-06-14']) {
      const map = generateRun(week)
      const all = map.rows.flat()
      expect(all).toHaveLength(6)
      expect(new Set(all.map((o) => o.task.id)).size).toBe(6)
      expect(map.rows.map((r) => r.map((o) => o.type))).toEqual([['kampf', 'relikt'], ['relikt', 'elite'], ['kampf', 'relikt']])
    }
  })
})

describe('relikt-angebote', () => {
  it('drei verschiedene, stabil und ohne besessene', () => {
    const a = offerRelics(WEEK, 1, [])
    expect(a).toHaveLength(3)
    expect(new Set(a).size).toBe(3)
    expect(offerRelics(WEEK, 1, [])).toEqual(a)
    expect(offerRelics(WEEK, 1, [a[0]])).not.toContain(a[0])
  })
})

describe('räume und boss', () => {
  it('Raum zählt erst ab dem Wahltag', () => {
    const map = generateRun(WEEK)
    const opt = map.rows[0][0]
    const early = wk('2026-10-05', 'bank', 60, 8, 40) // Montag, vor der Wahl
    const run = pickRoom(freshRun(WEEK, 3), [], 1, opt.id, '2026-10-07')!
    const win = (from: string) => [early].filter((w) => w.date >= from)
    expect(taskProgress({ id: 't', text: '', metric: 'sets', target: 15 }, win('2026-10-07'), [early], ex, '2026-10-07').done).toBe(false)
    expect(taskProgress({ id: 't', text: '', metric: 'sets', target: 15 }, win('2026-10-05'), [early], ex, '2026-10-05').done).toBe(true)
    expect(run.picks['1'].on).toBe('2026-10-07')
  })
  it('Räume nur der Reihe nach, einmal, gültige Option', () => {
    const run = freshRun(WEEK, 3)
    const map = generateRun(WEEK)
    expect(pickRoom(run, [], 2, map.rows[1][0].id, '2026-10-06')).toBeNull() // Reihe 1 zuerst
    expect(pickRoom(run, [], 1, 'zzz', '2026-10-06')).toBeNull()
    const picked = pickRoom(run, [], 1, map.rows[0][0].id, '2026-10-06')!
    expect(pickRoom(picked, [], 1, map.rows[0][1].id, '2026-10-06')).toBeNull() // nicht umentscheiden
  })
  it('Reconcile ist idempotent: zweiter Lauf liefert nichts Neues', () => {
    const map = generateRun(WEEK)
    const picked = pickRoom(freshRun(WEEK, 3), [], 1, map.rows[0][0].id, '2026-10-05')!
    const workouts = [wk('2026-10-05', 'bank', 60, 8, 30), wk('2026-10-06', 'bein', 100, 8, 30), wk('2026-10-07', 'bank', 60, 8, 30)]
    const first = reconcile({ ...base, today: '2026-10-07', run: picked, ledger: [], workouts })
    expect(first.newClaims.length).toBeGreaterThan(0)
    const second = reconcile({ ...base, today: '2026-10-07', run: first.run, ledger: first.newClaims, workouts })
    expect(second.newClaims).toEqual([])
  })
  it('Boss wird genau einmal beansprucht und mit eingefrorenem Ziel', () => {
    const workouts = [wk('2026-10-05'), wk('2026-10-06'), wk('2026-10-07')]
    const run = freshRun(WEEK, 3)
    const a = reconcile({ ...base, weeklyGoal: 1, today: '2026-10-07', run, ledger: [], workouts }) // Ziel in den Einstellungen auf 1 gesenkt
    const boss = a.newClaims.filter((c) => c.id.endsWith(':boss'))
    expect(boss).toHaveLength(1)
    expect(boss[0].xp).toBe(BOSS_XP)
    const half = reconcile({ ...base, weeklyGoal: 1, today: '2026-10-06', run: freshRun(WEEK, 3), ledger: [], workouts: workouts.slice(0, 2) })
    expect(half.newClaims).toEqual([]) // 2 von 3: Ziel 1 in den Einstellungen zählt nicht, der Lauf hat 3 eingefroren
    expect(reconcile({ ...base, today: '2026-10-07', run: a.run, ledger: a.newClaims, workouts }).newClaims).toEqual([])
  })
  it('Neue Woche = frischer Lauf mit aktuellem Ziel', () => {
    const r = reconcile({ ...base, weeklyGoal: 4, today: '2026-10-14', run: freshRun(WEEK, 3), ledger: [], workouts: [] })
    expect(r.run.week).toBe('2026-10-12')
    expect(r.run.goal).toBe(4)
    expect(r.run.relics).toEqual([])
  })
  it('Relikt-Angebot wird beim Räumen festgelegt und bleibt nach der Wahl gleich', () => {
    // Woche suchen, deren Relikt-Raum in Reihe 1 ohne Quests lösbar ist
    let week = WEEK
    for (let i = 0; i < 20 && generateRun(week).rows[0][1].task.metric === 'quests'; i++) week = addDays(week, 7)
    const room = generateRun(week).rows[0][1]
    expect(room.type).toBe('relikt')
    // Frühere Trainings mit niedrigen Gewichten, dann starke Trainings in der Woche (Rekorde, viele Sätze, mehrere Gruppen)
    const earlier = [wk(addDays(week, -3), 'bank', 40, 8, 3), wk(addDays(week, -2), 'bein', 60, 8, 3)]
    const days = [week, addDays(week, 1)]
    const inWeek = [
      wk(days[0], 'bank', 80, 10, 30),
      wk(days[0], 'bein', 120, 10, 30),
      wk(days[1], 'bank', 90, 10, 30),
      { ...wk(days[1], 'new', 20, 10, 5), entries: [{ exerciseId: 'new', sets: Array.from({ length: 5 }, () => ({ kg: 20, reps: 10 })) }] },
    ]
    const exs: Exercise[] = [...ex, { id: 'new', name: 'Neu', muscleGroup: 'Schultern' }]
    const picked = pickRoom(freshRun(week, 3), [], 1, room.id, week)!
    const r = reconcile({ today: days[1], exercises: exs, weeklyGoal: 3, run: picked, ledger: [], workouts: [...earlier, ...inWeek] })
    expect(r.newClaims.map((c) => c.id)).toContain(`${week}:room1`)
    const offer = r.run.offers['1']
    expect(offer.ids).toHaveLength(3)
    // Nochmaliges Abgleichen würfelt nicht neu
    const r2 = reconcile({ today: days[1], exercises: exs, weeklyGoal: 3, run: r.run, ledger: r.newClaims, workouts: [...earlier, ...inWeek] })
    expect(r2.run.offers['1'].ids).toEqual(offer.ids)
    expect(r2.newClaims).toEqual([])
    const taken = chooseRelic(r.run, 1, offer.ids[0])!
    expect(taken.relics).toEqual([offer.ids[0]])
    expect(taken.offers['1'].ids).toEqual(offer.ids)
    expect(chooseRelic(taken, 1, offer.ids[1])).toBeNull()
    expect(chooseRelic(r.run, 1, 'nicht-im-angebot')).toBeNull()
  })
})

describe('relikte und spielstand', () => {
  it('Relikte nur in der Woche des Laufs', () => {
    const run = { ...freshRun(WEEK, 3), relics: ['seelenfunke'] }
    expect(relicsFor(run, '2026-10-07')).toEqual(['seelenfunke'])
    expect(relicsFor(run, '2026-09-30')).toEqual([])
    expect(relicsFor(run, '2026-10-13')).toEqual([])
    expect(relicsFor(null, '2026-10-07')).toEqual([])
  })
  it('Relikt-Effekte liefern XP-Zeilen', () => {
    const w = wk('2026-10-07', 'bein')
    const r = xpForWorkout(w, [], ex, { relics: ['seelenfunke', 'beinbrecher'] })
    expect(r.skillLines.map((l) => l.skillId)).toEqual(['relic.seelenfunke', 'relic.beinbrecher'])
    expect(r.skillLines[1].xp).toBe(8) // 3 Sätze × 10 XP × 25 % = 7,5 → 8
  })
  it('playerState: Buch-XP und Buch-Punkte zählen, Skills ändern das Level nicht', () => {
    const w: Workout = { ...wk('2026-10-07'), xp: { total: 80, lines: [] } }
    const ledger: LedgerEntry[] = [{ id: 'x:boss', week: 'x', label: 'Boss', xp: 150, points: 1 }]
    const p = playerState([w], ex, [], ledger)
    expect(p.xp).toBe(230)
    expect(p.earned).toBe(p.lv.level - 1 + 1) // Level-Punkte + 1 Boss-Punkt
    expect(playerState([w], ex, ['kraft.root', 'kraft.x'], ledger).xp).toBe(230)
    expect(totalXp([w], ex)).toBe(80)
  })
  it('currentRow zählt geräumte Räume', () => {
    expect(currentRow(WEEK, [])).toBe(1)
    expect(currentRow(WEEK, [{ id: `${WEEK}:room1`, week: WEEK, label: '', xp: 1, points: 0 }])).toBe(2)
  })
})

describe('datenbank: transaktional und idempotent', () => {
  it('doppeltes und paralleles reconcile bucht nichts doppelt', async () => {
    const week = '2026-10-05'
    const today = new Date()
    // Heute in der Wochen-Logik: Test arbeitet mit "heute" aus der Datenbank-Schicht
    await setSetting('weeklyGoal', 1)
    await db.exercises.bulkPut(ex)
    const d = new Date()
    const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    await db.workouts.put(wk(ds))
    expect(week && today).toBeTruthy()
    const results = await Promise.all([reconcileStored(), reconcileStored(), reconcileStored()])
    const ledger = (await db.settings.get('ledger'))!.value as LedgerEntry[]
    expect(ledger.filter((l) => l.id.endsWith(':boss'))).toHaveLength(1)
    expect(results.flatMap((r) => r.newClaims)).toHaveLength(1)
    const again = await reconcileStored()
    expect(again.newClaims).toEqual([])
  })
  it('Raum wählen und Relikt nehmen gehen nur einmal und im Stand der Datenbank', async () => {
    const first = await reconcileStored()
    const map = generateRun(first.run.week)
    const a = await pickRoomStored(1, map.rows[0][0].id)
    expect(a.run.picks['1']).toBeTruthy()
    const b = await pickRoomStored(1, map.rows[0][1].id)
    expect(b.run.picks['1'].option).toBe(map.rows[0][0].id) // nicht umentschieden
    const c = await chooseRelicStored(1, 'doppelschlag')
    expect(c.run.relics).toEqual(a.run.relics) // kein Angebot, kein Relikt
  })
})
