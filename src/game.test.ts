import { describe, expect, it } from 'vitest'
import type { Exercise, Workout } from './db'
import { bestScoreBefore, recordSetIndex, levelFromXp, muscleLevels, questDone, questFor, rankFromLevel, totalXp, weeklyStreak, xpForWorkout, xpToReach } from './game'
import { e1rm, lastSets, weekStart } from './stats'

const w = (date: string, kg: number, reps: number, n = 3, ex = 'a'): Workout => ({
  id: date + ex,
  date,
  entries: [{ exerciseId: ex, sets: Array.from({ length: n }, () => ({ kg, reps })) }],
})

describe('stats', () => {
  it('Epley 1RM', () => {
    expect(e1rm({ kg: 60, reps: 10 })).toBeCloseTo(80)
    expect(e1rm({ kg: 0, reps: 10 })).toBe(0)
  })
  it('lastSets findet das letzte Training vor einem Datum', () => {
    const ws = [w('2026-01-01', 10, 8), w('2026-01-05', 20, 8)]
    expect(lastSets(ws, 'a')![0].kg).toBe(20)
    expect(lastSets(ws, 'a', '2026-01-05')![0].kg).toBe(10)
    expect(lastSets(ws, 'zzz')).toBeUndefined()
  })
  it('Woche beginnt am Montag', () => {
    expect(weekStart('2026-10-07')).toBe('2026-10-05') // Mittwoch
    expect(weekStart('2026-10-11')).toBe('2026-10-05') // Sonntag
  })
})

describe('xp', () => {
  it('erstes Training: kein Rekord, nur Sätze + Bonus', () => {
    const x = xpForWorkout(w('2026-01-01', 10, 8), [])
    expect(x.total).toBe(3 * 10 + 50)
    expect(x.recordExerciseIds).toEqual([])
  })
  it('Rekord bei mehr Gewicht, nicht bei gleichem', () => {
    const prev = [w('2026-01-01', 10, 8)]
    expect(xpForWorkout(w('2026-01-08', 12, 8), prev).recordExerciseIds).toEqual(['a'])
    expect(xpForWorkout(w('2026-01-08', 10, 8), prev).recordExerciseIds).toEqual([])
  })
  it('leeres Training gibt keine XP', () => {
    expect(xpForWorkout({ id: 'x', date: '2026-01-01', entries: [] }, []).total).toBe(0)
  })
  it('totalXp summiert chronologisch', () => {
    expect(totalXp([w('2026-01-08', 12, 8), w('2026-01-01', 10, 8)])).toBe(80 + 80 + 25)
  })
})

describe('level', () => {
  it('Level 1 bei 0 XP, Aufstieg an der Schwelle', () => {
    expect(levelFromXp(0).level).toBe(1)
    const t = xpToReach(2)
    expect(levelFromXp(t - 1).level).toBe(1)
    expect(levelFromXp(t).level).toBe(2)
  })
})

describe('streak', () => {
  const week = (monday: string, n: number) =>
    Array.from({ length: n }, (_, i) => w(`2026-10-${String(Number(monday) + i).padStart(2, '0')}`, 10, 8, 3, 'e' + monday + i))
  it('zählt erfüllte Wochen, laufende Woche bricht nicht ab', () => {
    const ws = [...week('12', 3), ...week('19', 3)] // 12.10. und 19.10.
    expect(weeklyStreak(ws, 3, '2026-10-21')).toBe(2) // laufende Woche (19.) schon erfüllt
    expect(weeklyStreak(ws, 3, '2026-10-26')).toBe(2) // neue Woche leer, Serie bleibt
  })
  it('Lücke bricht die Serie', () => {
    const ws = [...week('5', 3), ...week('19', 3)]
    expect(weeklyStreak(ws, 3, '2026-10-21')).toBe(1)
  })
  it('lange Pause = 0', () => {
    expect(weeklyStreak([w('2026-01-01', 10, 8)], 3, '2026-10-21')).toBe(0)
  })
})

describe('rang', () => {
  it('E bis S', () => {
    expect([1, 5, 10, 15, 25, 40].map(rankFromLevel)).toEqual(['E', 'D', 'C', 'B', 'A', 'S'])
  })
})

describe('quest', () => {
  const ex: Exercise[] = [
    { id: 'p', name: 'Liegestütze', muscleGroup: 'Brust' },
    { id: 'k', name: 'Klimmzüge', muscleGroup: 'Rücken' },
    { id: 's', name: 'Sit-ups', muscleGroup: 'Core' },
    { id: 'b', name: 'Kniebeugen Körpergewicht', muscleGroup: 'Beine' },
    { id: 'd', name: 'Dips', muscleGroup: 'Brust' },
  ]
  it('wechselt täglich reihum', () => {
    const names = Array.from({ length: 5 }, (_, i) => questFor(`2026-10-${10 + i}`).exerciseName)
    expect(new Set(names).size).toBe(5)
    expect(questFor('2026-10-15').exerciseName).toBe(questFor('2026-10-10').exerciseName)
  })
  it('erfüllt nur mit genug Wiederholungen der Tages-Übung', () => {
    const q = questFor('2026-10-07')
    const id = ex.find((e) => e.name === q.exerciseName)!.id
    expect(ex.some((e) => e.name.toLowerCase() === q.exerciseName.toLowerCase())).toBe(true)
    const mk = (reps: number[]): Workout => ({
      id: 'q',
      date: '2026-10-07',
      entries: [{ exerciseId: id, sets: reps.map((r) => ({ kg: 0, reps: r })) }],
    })
    expect(questDone(mk([q.target - 1]), ex)).toBe(false)
    expect(questDone(mk([q.target - 10, 10]), ex)).toBe(true)
    expect(xpForWorkout(mk([q.target]), [], ex).questBonus).toBe(40)
  })
  it('Muskel-Level aus Sätzen', () => {
    const ml = muscleLevels([w('2026-01-01', 10, 8, 3, 'p')], ex)
    expect(ml).toHaveLength(1)
    expect(ml[0].group).toBe('Brust')
  })
})

describe('live-rekord', () => {
  it('bestScoreBefore: undefined bei neuer Übung', () => {
    expect(bestScoreBefore([], 'a')).toBeUndefined()
    expect(bestScoreBefore([w('2026-01-01', 60, 8)], 'a')).toBeCloseTo(e1rm({ kg: 60, reps: 8 }))
  })
  it('recordSetIndex findet den besten Satz über dem alten Bestwert', () => {
    const prev = bestScoreBefore([w('2026-01-01', 60, 8)], 'a')
    expect(recordSetIndex([{ kg: 60, reps: 8 }, { kg: 62.5, reps: 8 }, null], prev)).toBe(1)
    expect(recordSetIndex([{ kg: 60, reps: 8 }, null], prev)).toBe(-1)
    expect(recordSetIndex([{ kg: 100, reps: 1 }], undefined)).toBe(-1) // erste Ausführung: kein Rekord
  })
})
