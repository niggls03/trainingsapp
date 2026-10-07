import type { Exercise, Workout, XpLine } from './db'
import { questFor, questReps, type Quest, firstQuestDoneOn } from './quests'
import { relicEffects } from './relics'
import { forgiveWeeks, ownedEffects } from './skills'
import { addDays, daysBetween, volume, weekStart, weeklyStreak } from './stats'

export interface XpContext {
  workout: Workout
  /** Nur Trainings mit früherem Datum */
  previous: Workout[]
  exercises: Exercise[]
  weeklyGoal: number
  owned: string[]
  /** Aktive Relikte der Woche (nur für Trainings dieser Woche übergeben) */
  relics?: string[]
  base: {
    setCount: number
    recordBonus: number
    questBonus: number
    /** Grund-XP ohne Skills (Sätze, Training, Rekorde, Quests) */
    baseXp: number
    questsDone: Quest[]
    recordIds: string[]
  }
}

const MILESTONES = [50, 75, 100, 125, 150]

function maxKgByExercise(workouts: Workout[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const w of workouts) {
    for (const e of w.entries) {
      for (const s of e.sets) m.set(e.exerciseId, Math.max(m.get(e.exerciseId) ?? 0, s.kg))
    }
  }
  return m
}

/** XP-Zeilen der freigeschalteten Skills für ein Training. */
export function skillXpLines(ctx: XpContext): XpLine[] {
  const { workout, previous, exercises, weeklyGoal, owned, base } = ctx
  const effects = [
    ...ownedEffects(owned).map(({ skill, effect }) => ({ id: skill.id, name: skill.name, effect })),
    ...relicEffects(ctx.relics ?? []),
  ]
  if (!effects.length || base.setCount === 0) return []
  const groupOf = new Map(exercises.map((e) => [e.id, e.muscleGroup]))

  const lines: XpLine[] = []
  const add = (skillId: string, label: string, xp: number) => {
    if (xp > 0) lines.push({ skillId, label, xp: Math.round(xp) })
  }

  const prevMaxKg = maxKgByExercise(previous)
  const curMaxKg = maxKgByExercise([workout])
  const weekCountBefore = previous.filter((w) => weekStart(w.date) === weekStart(workout.date)).length
  const totalVolume = workout.entries.reduce((n, e) => n + volume(e.sets), 0)
  const lastPrev = previous.reduce<string | null>((d, w) => (d === null || w.date > d ? w.date : d), null)

  for (const { id, name, effect } of effects) {
    switch (effect.t) {
      case 'recordPct':
        add(id, name, (base.recordBonus * effect.v) / 100)
        break
      case 'recordFlat':
        add(id, name, base.recordIds.length * effect.v)
        break
      case 'combo':
        if (base.recordIds.length >= effect.min) add(id, name, effect.v)
        break
      case 'milestone': {
        let n = 0
        for (const [ex, cur] of curMaxKg) {
          const prev = prevMaxKg.get(ex)
          if (prev === undefined) continue // erste Ausführung: nur Startwert
          n += MILESTONES.filter((t) => cur >= t && prev < t).length
        }
        add(id, name, n * effect.v)
        break
      }
      case 'volume':
        add(id, name, Math.floor(totalVolume / 1000) * effect.v)
        break
      case 'topWeight': {
        let n = 0
        for (const [ex, cur] of curMaxKg) {
          const prev = prevMaxKg.get(ex)
          if (prev !== undefined && prev > 0 && cur > prev) n++
        }
        add(id, name, n * effect.v)
        break
      }
      case 'heavySets': {
        const n = workout.entries.flatMap((e) => e.sets).filter((s) => s.kg >= effect.kg).length
        add(id, name, n * effect.v)
        break
      }
      case 'goalHit':
        if (weeklyGoal > 0 && weekCountBefore + 1 === weeklyGoal) add(id, name, effect.v)
        break
      case 'comeback':
        if (lastPrev && daysBetween(workout.date, lastPrev) >= effect.days) add(id, name, effect.v)
        break
      case 'nthOfWeek':
        if (weekCountBefore + 1 === effect.n) add(id, name, effect.v)
        break
      case 'workoutXp':
        add(id, name, effect.v)
        break
      case 'setXp':
        add(id, name, base.setCount * effect.v)
        break
      case 'firstRecord':
        if (base.recordIds.length > 0) add(id, name, effect.v)
        break
      case 'groupSetPct': {
        let n = 0
        for (const e of workout.entries) if (effect.groups.includes(groupOf.get(e.exerciseId) as never)) n += e.sets.length
        add(id, name, (n * 10 * effect.v) / 100)
        break
      }
      case 'questPct':
        add(id, name, (base.questBonus * effect.v) / 100)
        break
      case 'questFlat':
        add(id, name, base.questsDone.length * effect.v)
        break
      case 'questOver': {
        let n = 0
        for (const q of base.questsDone) n += Math.floor((questReps(workout, exercises, q) - q.target) / 5)
        add(id, name, Math.max(0, n) * effect.v)
        break
      }
      case 'questStreak': {
        const first = questFor(workout.date)
        if (!base.questsDone.some((q) => q.exerciseName === first.exerciseName)) break
        let ok = true
        for (let k = 1; k < effect.days; k++) {
          if (!firstQuestDoneOn(addDays(workout.date, -k), previous, exercises)) ok = false
        }
        if (ok) add(id, name, effect.v)
        break
      }
      default:
        break // Optik, Quest-Anzahl, Serien-Schutz und Skillpunkte brauchen hier keine XP
    }
  }

  // Prozentboni auf alles: auf Grund-XP plus alle bisherigen Skill-XP, nicht aufeinander gestapelt.
  const subtotal = base.baseXp + lines.reduce((n, l) => n + l.xp, 0)
  const streak = weeklyStreak([...previous, workout], weeklyGoal, workout.date, forgiveWeeks(owned))
  for (const { id, name, effect } of effects) {
    if (effect.t === 'allPct' && streak >= effect.minStreak) add(id, name, (subtotal * effect.v) / 100)
  }
  return lines
}
