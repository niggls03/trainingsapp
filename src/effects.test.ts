import { describe, expect, it } from 'vitest'
import type { Exercise, Workout } from './db'
import { totalXp, weeklyStreak, xpForWorkout } from './game'
import { questFor, questsFor } from './quests'

const ex: Exercise[] = [
  { id: 'bank', name: 'Bankdrücken', muscleGroup: 'Brust' },
  { id: 'rud', name: 'Rudern', muscleGroup: 'Rücken' },
  { id: 'pu', name: 'Liegestütze', muscleGroup: 'Brust' },
  { id: 'pull', name: 'Klimmzüge', muscleGroup: 'Rücken' },
  { id: 'situp', name: 'Sit-ups', muscleGroup: 'Core' },
  { id: 'squat', name: 'Kniebeugen Körpergewicht', muscleGroup: 'Beine' },
  { id: 'dips', name: 'Dips', muscleGroup: 'Brust' },
]

const wk = (date: string, entries: [string, number, number, number?][]): Workout => ({
  id: date + entries.map((e) => e[0]).join(),
  date,
  entries: entries.map(([exerciseId, kg, reps, n = 3]) => ({
    exerciseId,
    sets: Array.from({ length: n }, () => ({ kg, reps })),
  })),
})

const total = (w: Workout, prev: Workout[], skills: string[], goal = 3) =>
  xpForWorkout(w, prev, ex, { skills, weeklyGoal: goal })

describe('grundregeln bleiben ohne skills gleich', () => {
  it('3 Sätze = 80 XP, keine Skill-Zeilen', () => {
    const r = total(wk('2026-10-07', [['bank', 60, 8]]), [], [])
    expect(r.total).toBe(80)
    expect(r.skillLines).toEqual([])
  })
})

describe('kraft', () => {
  const prev = [wk('2026-10-01', [['bank', 60, 8]])]
  it('Rekord-Jäger: +10 % der Rekord-XP', () => {
    const w = wk('2026-10-07', [['bank', 70, 8]])
    const r = total(w, prev, ['kraft.root'])
    expect(r.recordBonus).toBe(25)
    expect(r.skillLines).toEqual([{ skillId: 'kraft.root', label: 'Rekord-Jäger', xp: 3 }])
    expect(r.total).toBe(30 + 50 + 25 + 3)
  })
  it('Rekord-Combo braucht zwei Rekorde', () => {
    const p2 = [wk('2026-10-01', [['bank', 60, 8], ['rud', 40, 8]])]
    const one = total(wk('2026-10-07', [['bank', 70, 8], ['rud', 40, 8]]), p2, ['kraft.root', 'kraft.l1', 'kraft.l2'])
    const two = total(wk('2026-10-07', [['bank', 70, 8], ['rud', 50, 8]]), p2, ['kraft.root', 'kraft.l1', 'kraft.l2'])
    expect(one.skillLines.find((l) => l.skillId === 'kraft.l2')).toBeUndefined()
    expect(two.skillLines.find((l) => l.skillId === 'kraft.l2')?.xp).toBe(30)
  })
  it('Schwerer Schlag: neue Marke nur mit früherer Historie', () => {
    const first = total(wk('2026-10-07', [['bank', 80, 5]]), [], ['kraft.root', 'kraft.r1'])
    expect(first.skillLines.find((l) => l.skillId === 'kraft.r1')).toBeUndefined()
    const later = total(wk('2026-10-07', [['bank', 80, 5]]), prev, ['kraft.root', 'kraft.r1'])
    expect(later.skillLines.find((l) => l.skillId === 'kraft.r1')?.xp).toBe(40) // früheres Maximum 60: nur 75 ist neu
    const big = total(wk('2026-10-07', [['bank', 110, 3]]), prev, ['kraft.root', 'kraft.r1'])
    expect(big.skillLines.find((l) => l.skillId === 'kraft.r1')?.xp).toBe(80) // 75 und 100
  })
  it('Volumen-Bonus: je volle 1.000 kg', () => {
    const r = total(wk('2026-10-07', [['bank', 100, 5, 4]]), [], ['kraft.root', 'kraft.r1', 'kraft.r2']) // 2.000 kg
    expect(r.skillLines.find((l) => l.skillId === 'kraft.r2')?.xp).toBe(20)
  })
  it('Prozentboni stapeln nicht aufeinander und gelten auf alles', () => {
    const w = wk('2026-10-07', [['bank', 60, 8]])
    const r = total(w, [], ['kraft.root', 'kraft.l1', 'kraft.r1', 'kraft.x']) // Kraftprotz +5 %
    expect(r.skillLines).toEqual([{ skillId: 'kraft.x', label: 'Kraftprotz', xp: 4 }]) // 5 % von 80
  })
})

describe('disziplin', () => {
  it('Routine: nur beim Training, das das Wochenziel erreicht', () => {
    const prev = [wk('2026-10-05', [['bank', 60, 8]]), wk('2026-10-06', [['bank', 60, 8]])] // Mo, Di
    const r = total(wk('2026-10-07', [['bank', 60, 8]]), prev, ['disziplin.root'], 3)
    expect(r.skillLines.find((l) => l.skillId === 'disziplin.root')?.xp).toBe(40)
    const early = total(wk('2026-10-06', [['bank', 60, 8]]), [prev[0]], ['disziplin.root'], 3)
    expect(early.skillLines).toEqual([])
  })
  it('Comeback: erst nach 14 Tagen Pause', () => {
    const prev = [wk('2026-09-01', [['bank', 60, 8]])]
    const skills = ['disziplin.root', 'disziplin.r1']
    expect(total(wk('2026-09-20', [['bank', 60, 8]]), prev, skills).skillLines.find((l) => l.skillId === 'disziplin.r1')?.xp).toBe(100)
    expect(total(wk('2026-09-10', [['bank', 60, 8]]), prev, skills).skillLines.find((l) => l.skillId === 'disziplin.r1')).toBeUndefined()
    expect(total(wk('2026-09-20', [['bank', 60, 8]]), [], skills).skillLines).toEqual([]) // nie trainiert: kein Comeback
  })
  it('Zweiter Atem: das 2. Training der Woche', () => {
    const prev = [wk('2026-10-05', [['bank', 60, 8]])]
    const r = total(wk('2026-10-07', [['bank', 60, 8]]), prev, ['disziplin.root', 'disziplin.r1', 'disziplin.r2'])
    expect(r.skillLines.find((l) => l.skillId === 'disziplin.r2')?.xp).toBe(20)
  })
  it('Serien-Schutz verzeiht eine verpasste Woche', () => {
    const mk = (d: string) => [wk(d, [['bank', 60, 8]]), wk(d.replace(/-(\d\d)$/, (_, x) => '-' + String(Number(x) + 1).padStart(2, '0')), [['rud', 40, 8]]), wk(d.replace(/-(\d\d)$/, (_, x) => '-' + String(Number(x) + 2).padStart(2, '0')), [['pu', 0, 10]])]
    const ws = [...mk('2026-09-14'), ...mk('2026-09-28')] // KW 38 und 40, KW 39 fehlt
    expect(weeklyStreak(ws, 3, '2026-09-30')).toBe(1)
    expect(weeklyStreak(ws, 3, '2026-09-30', 1)).toBe(2)
  })
})

describe('quests', () => {
  const date = '2026-10-07'
  const q = questFor(date)
  const qid = ex.find((e) => e.name === q.exerciseName)!.id
  const done = wk(date, [[qid, 0, q.target, 1]])

  it('Quest-Meister: +50 % der Quest-XP', () => {
    const r = total(done, [], ['quests.root', 'quests.l1'])
    expect(r.questBonus).toBe(40)
    expect(r.skillLines.find((l) => l.skillId === 'quests.l1')?.xp).toBe(20)
  })
  it('Zweite Quest zählt als zweite Quest des Tages', () => {
    const second = questsFor(date, 2)[1]
    const sid = ex.find((e) => e.name === second.exerciseName)!.id
    const both = wk(date, [[qid, 0, q.target, 1], [sid, 0, second.target, 1]])
    expect(total(both, [], []).questBonus).toBe(40)
    expect(total(both, [], ['quests.root']).questBonus).toBe(80)
  })
  it('Quest-Serie: braucht die Quest auch an den Vortagen', () => {
    const y = '2026-10-06'
    const yq = questFor(y)
    const yid = ex.find((e) => e.name === yq.exerciseName)!.id
    const prev = [wk(y, [[yid, 0, yq.target, 1]])]
    const skills = ['quests.root', 'quests.r1']
    expect(total(done, prev, skills).skillLines.find((l) => l.skillId === 'quests.r1')?.xp).toBe(30)
    expect(total(done, [], skills).skillLines.find((l) => l.skillId === 'quests.r1')).toBeUndefined()
  })
})

describe('gespeicherte xp (kein rückwirkender effekt)', () => {
  it('Skills ändern totalXp nie, solange xp gespeichert ist', () => {
    const w = wk('2026-10-07', [['bank', 60, 8]])
    const stored: Workout = { ...w, xp: { total: 80, lines: [] } }
    const withSkill = xpForWorkout(w, [], ex, { skills: ['kraft.x'] }).total
    expect(withSkill).toBeGreaterThan(80) // Skill würde neu berechnet mehr geben
    expect(totalXp([stored], ex)).toBe(80) // gespeicherter Wert bleibt
  })
  it('Trainings ohne gespeicherten Wert werden nach Grundregeln berechnet', () => {
    expect(totalXp([wk('2026-10-07', [['bank', 60, 8]])], ex)).toBe(80)
  })
})
