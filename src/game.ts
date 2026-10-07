import type { Exercise, LedgerEntry, MuscleGroup, Workout, WorkoutSet, XpLine } from './db'
import { skillXpLines } from './effects'
import { completedQuestDays } from './quests'
import { earnedPoints, hasEffect, questCount, spentPoints } from './skills'
import { questDone, questsFor } from './quests'
import { byDateAsc, score } from './stats'

export * from './quests'
export { weeklyStreak } from './stats'

export const XP_PER_SET = 10
export const XP_PER_WORKOUT = 50
export const XP_PER_RECORD = 25
export const XP_PER_QUEST = 40

export interface WorkoutXp {
  sets: number
  workoutBonus: number
  recordBonus: number
  questBonus: number
  /** XP durch Skills, einzeln aufgeführt */
  skillLines: XpLine[]
  skillBonus: number
  total: number
  /** Übungen, bei denen ein neuer Rekord gesetzt wurde */
  recordExerciseIds: string[]
}

export interface XpOptions {
  /** Freigeschaltete Skills (leer = Grundregeln) */
  skills?: string[]
  weeklyGoal?: number
  /** Relikte der Woche; nur für Trainings aus dieser Woche übergeben */
  relics?: string[]
}

/** XP eines Trainings, gemessen an den Rekorden aus `previous` (nur frühere Trainings). */
export function xpForWorkout(
  workout: Workout,
  previous: Workout[],
  exercises: Exercise[] = [],
  opts: XpOptions = {},
): WorkoutXp {
  const owned = opts.skills ?? []
  const best = new Map<string, number>()
  for (const w of previous) {
    for (const e of w.entries) {
      for (const s of e.sets) best.set(e.exerciseId, Math.max(best.get(e.exerciseId) ?? 0, score(s)))
    }
  }

  let sets = 0
  const records: string[] = []
  for (const e of workout.entries) {
    sets += e.sets.length
    const prev = best.get(e.exerciseId)
    // Erste Ausführung einer Übung setzt nur die Basis, kein Rekord.
    if (prev === undefined) continue
    if (e.sets.some((s) => score(s) > prev + 1e-9)) records.push(e.exerciseId)
  }

  const questsDoneList = questsFor(workout.date, questCount(owned)).filter((q) => questDone(workout, exercises, q))
  const out = {
    sets: sets * XP_PER_SET,
    workoutBonus: sets > 0 ? XP_PER_WORKOUT : 0,
    recordBonus: records.length * XP_PER_RECORD,
    questBonus: questsDoneList.length * XP_PER_QUEST,
  }

  const skillLines = skillXpLines({
    workout,
    previous,
    exercises,
    weeklyGoal: opts.weeklyGoal ?? 3,
    owned,
    relics: opts.relics,
    base: {
      setCount: sets,
      recordBonus: out.recordBonus,
      questBonus: out.questBonus,
      baseXp: out.sets + out.workoutBonus + out.recordBonus + out.questBonus,
      questsDone: questsDoneList,
      recordIds: records,
    },
  })
  const skillBonus = skillLines.reduce((n, l) => n + l.xp, 0)

  return {
    ...out,
    skillLines,
    skillBonus,
    total: out.sets + out.workoutBonus + out.recordBonus + out.questBonus + skillBonus,
    recordExerciseIds: records,
  }
}

/**
 * Gesamt-XP. Trainings mit gespeichertem Wert zählen mit diesem Wert, damit Skills nie rückwirkend
 * Level ändern. Ältere Trainings ohne Wert werden nach den Grundregeln berechnet.
 */
export function totalXp(workouts: Workout[], exercises: Exercise[] = []): number {
  const sorted = byDateAsc(workouts)
  let sum = 0
  sorted.forEach((w, i) => {
    sum += w.xp ? w.xp.total : xpForWorkout(w, sorted.slice(0, i), exercises).total
  })
  return sum
}

/** Kumulative XP, die für das Erreichen von Level n nötig sind (Level 1 = 0 XP). */
export function xpToReach(level: number): number {
  let sum = 0
  for (let k = 1; k < level; k++) sum += Math.round(100 * Math.pow(k, 1.3))
  return sum
}

export interface LevelInfo {
  level: number
  intoLevel: number
  needed: number
}

export function levelFromXp(xp: number): LevelInfo {
  let level = 1
  while (xpToReach(level + 1) <= xp) level++
  return { level, intoLevel: xp - xpToReach(level), needed: xpToReach(level + 1) - xpToReach(level) }
}

/** Rang wie bei den Jägern: E (Anfänger) bis S. */
export function rankFromLevel(level: number): string {
  if (level >= 40) return 'S'
  if (level >= 25) return 'A'
  if (level >= 15) return 'B'
  if (level >= 10) return 'C'
  if (level >= 5) return 'D'
  return 'E'
}

/** Level je Muskelgruppe, abgeleitet aus der Anzahl bisher trainierter Sätze. */
export function muscleLevels(workouts: Workout[], exercises: Exercise[]): { group: MuscleGroup; level: LevelInfo }[] {
  const groupOf = new Map(exercises.map((e) => [e.id, e.muscleGroup]))
  const sets = new Map<MuscleGroup, number>()
  for (const w of workouts) {
    for (const e of w.entries) {
      const g = groupOf.get(e.exerciseId)
      if (g) sets.set(g, (sets.get(g) ?? 0) + e.sets.length)
    }
  }
  return [...sets.entries()]
    .map(([group, n]) => ({ group, level: levelFromXp(n * XP_PER_SET) }))
    .sort((a, b) => b.level.level - a.level.level || b.level.intoLevel - a.level.intoLevel)
}

/** Bester bisheriger Vergleichswert einer Übung in `previous` (undefined = noch nie gemacht). */
export function bestScoreBefore(previous: Workout[], exerciseId: string): number | undefined {
  let best: number | undefined
  for (const w of previous) {
    for (const e of w.entries) {
      if (e.exerciseId !== exerciseId) continue
      for (const s of e.sets) best = Math.max(best ?? 0, score(s))
    }
  }
  return best
}

/**
 * Index des Satzes, der einen Rekord setzt (der beste Satz, falls er `prev` übertrifft), sonst -1.
 * `null`-Einträge (nicht abgehakte oder leere Sätze) werden übersprungen.
 */
export function recordSetIndex(sets: (WorkoutSet | null)[], prev: number | undefined): number {
  if (prev === undefined) return -1
  let idx = -1
  let top = prev + 1e-9
  sets.forEach((s, i) => {
    if (s && score(s) > top) {
      top = score(s)
      idx = i
    }
  })
  return idx
}

export interface PlayerState {
  xp: number
  lv: LevelInfo
  rank: string
  earned: number
  spent: number
  free: number
  questDays: number
}

/**
 * Der Spielstand an einer einzigen Stelle berechnet: XP aus gespeicherten Trainings plus Belohnungs-Buch,
 * daraus Level, Rang und Skillpunkte. Alle Bildschirme lesen von hier, damit überall dasselbe steht.
 */
export function playerState(
  workouts: Workout[],
  exercises: Exercise[],
  skills: string[],
  ledger: LedgerEntry[],
): PlayerState {
  const xp = totalXp(workouts, exercises) + ledger.reduce((n, l) => n + l.xp, 0)
  const lv = levelFromXp(xp)
  const rank = rankFromLevel(lv.level)
  const questDays = completedQuestDays(workouts, exercises)
  const bonusPoints = ledger.reduce((n, l) => n + l.points, 0)
  const earned = earnedPoints(lv.level, rank, questDays, hasEffect(skills, 'questPoints')) + bonusPoints
  const spent = spentPoints(skills)
  return { xp, lv, rank, earned, spent, free: earned - spent, questDays }
}
