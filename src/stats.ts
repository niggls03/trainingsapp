import type { Workout, WorkoutSet } from './db'

/** Geschätztes 1-Wiederholungs-Maximum nach Epley. */
export const e1rm = (s: WorkoutSet): number => (s.kg > 0 ? s.kg * (1 + s.reps / 30) : 0)

export const volume = (sets: WorkoutSet[]): number => sets.reduce((sum, s) => sum + s.kg * s.reps, 0)

/** Vergleichswert für Rekorde: 1RM bei Gewicht, sonst Wiederholungen (Körpergewichtsübungen). */
export const score = (s: WorkoutSet): number => (s.kg > 0 ? e1rm(s) : s.reps)

export const byDateAsc = (ws: Workout[]): Workout[] =>
  [...ws].sort((a, b) => a.date.localeCompare(b.date))

/** Letzter Eintrag einer Übung vor `beforeDate` (Standard: alle). */
export function lastSets(workouts: Workout[], exerciseId: string, beforeDate?: string): WorkoutSet[] | undefined {
  const sorted = byDateAsc(workouts).reverse()
  for (const w of sorted) {
    if (beforeDate && w.date >= beforeDate) continue
    const e = w.entries.find((x) => x.exerciseId === exerciseId)
    if (e && e.sets.length) return e.sets
  }
  return undefined
}

export interface ExercisePoint {
  date: string
  topKg: number
  e1rm: number
  volume: number
}

export function exerciseSeries(workouts: Workout[], exerciseId: string): ExercisePoint[] {
  const out: ExercisePoint[] = []
  for (const w of byDateAsc(workouts)) {
    const sets = w.entries.filter((e) => e.exerciseId === exerciseId).flatMap((e) => e.sets)
    if (!sets.length) continue
    out.push({
      date: w.date,
      topKg: Math.max(...sets.map((s) => s.kg)),
      e1rm: Math.round(Math.max(...sets.map(e1rm)) * 10) / 10,
      volume: Math.round(volume(sets)),
    })
  }
  return out
}

/** Bestes Set je Übung über die gesamte Historie. */
export function personalBests(workouts: Workout[]): Map<string, WorkoutSet> {
  const best = new Map<string, WorkoutSet>()
  for (const w of byDateAsc(workouts)) {
    for (const e of w.entries) {
      for (const s of e.sets) {
        const cur = best.get(e.exerciseId)
        if (!cur || score(s) > score(cur)) best.set(e.exerciseId, s)
      }
    }
  }
  return best
}

/** Montag der Woche (lokal) als YYYY-MM-DD. */
export function weekStart(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  const shift = (dt.getDay() + 6) % 7
  dt.setDate(dt.getDate() - shift)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
}

export function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(y, m - 1, d + days)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
}

/** Anzahl Trainings je Woche (Schlüssel = Montag). */
export function workoutsPerWeek(workouts: Workout[]): Map<string, number> {
  const map = new Map<string, number>()
  for (const w of workouts) {
    const k = weekStart(w.date)
    map.set(k, (map.get(k) ?? 0) + 1)
  }
  return map
}

export const formatDate = (dateStr: string): string => {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: '2-digit' })
}

/**
 * Wochen-Streak: aufeinanderfolgende Wochen mit mindestens `goal` Trainings.
 * Die laufende Woche bricht die Serie nicht, solange sie noch läuft.
 * `forgive` verpasste Wochen werden übersprungen, ohne die Serie zu beenden (zählen aber nicht mit).
 */
export function weeklyStreak(workouts: Workout[], goal: number, today: string, forgive = 0): number {
  const perWeek = workoutsPerWeek(workouts)
  let streak = 0
  let week = weekStart(today)
  if ((perWeek.get(week) ?? 0) >= goal) streak++
  week = addDays(week, -7)
  let gaps = 0
  // Obergrenze verhindert Endlosschleifen bei leerer Historie
  for (let i = 0; i < 520; i++) {
    if ((perWeek.get(week) ?? 0) >= goal) streak++
    else if (gaps < forgive) gaps++
    else break
    week = addDays(week, -7)
  }
  return streak
}

export function daysBetween(a: string, b: string): number {
  const t = (d: string) => {
    const [y, m, day] = d.split('-').map(Number)
    return Date.UTC(y, m - 1, day) / 86_400_000
  }
  return Math.round(t(a) - t(b))
}
