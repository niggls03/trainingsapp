import type { Exercise, MuscleGroup, Workout } from './db'

export interface Quest {
  exerciseName: string
  group: MuscleGroup
  target: number
}

// Körpergewichts-Quests. Die Übung wird beim ersten Quest-Start automatisch angelegt, falls es sie noch nicht gibt.
export const QUESTS: Quest[] = [
  { exerciseName: 'Liegestütze', group: 'Brust', target: 50 },
  { exerciseName: 'Klimmzüge', group: 'Rücken', target: 20 },
  { exerciseName: 'Sit-ups', group: 'Core', target: 60 },
  { exerciseName: 'Kniebeugen Körpergewicht', group: 'Beine', target: 80 },
  { exerciseName: 'Dips', group: 'Brust', target: 30 },
]

const dayNumber = (date: string): number => {
  const [y, m, d] = date.split('-').map(Number)
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000)
}

/** Erste Tages-Quest: wechselt jeden Kalendertag reihum, ohne etwas zu speichern. */
export const questFor = (date: string): Quest => QUESTS[dayNumber(date) % QUESTS.length]

/** Die Quests eines Tages (mehr als eine mit passenden Skills). */
export function questsFor(date: string, count = 1): Quest[] {
  const base = dayNumber(date)
  return Array.from({ length: Math.min(count, QUESTS.length) }, (_, i) => QUESTS[(base + i) % QUESTS.length])
}

export const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

/** Wiederholungen einer Quest-Übung innerhalb eines Trainings. */
export function questReps(workout: Workout, exercises: Exercise[], quest: Quest = questFor(workout.date)): number {
  const ids = exercises.filter((e) => sameName(e.name, quest.exerciseName)).map((e) => e.id)
  return workout.entries
    .filter((e) => ids.includes(e.exerciseId))
    .flatMap((e) => e.sets)
    .reduce((n, s) => n + s.reps, 0)
}

/** Quest erfüllt, wenn in einem Training genug Wiederholungen der Quest-Übung gemacht wurden. */
export function questDone(workout: Workout, exercises: Exercise[], quest: Quest = questFor(workout.date)): boolean {
  return questReps(workout, exercises, quest) >= quest.target
}

/** Beste Wiederholungszahl der Quest an einem Tag über alle Trainings dieses Tages. */
export function bestQuestRepsOn(date: string, workouts: Workout[], exercises: Exercise[], quest: Quest): number {
  return Math.max(0, ...workouts.filter((w) => w.date === date).map((w) => questReps(w, exercises, quest)))
}

/** Wurde die erste Tages-Quest an diesem Tag in mindestens einem Training erfüllt? */
export const firstQuestDoneOn = (date: string, workouts: Workout[], exercises: Exercise[]): boolean =>
  workouts.some((w) => w.date === date && questDone(w, exercises, questFor(date)))

/** Anzahl der Tage mit erfüllter erster Quest (für Skillpunkte-Bonus). */
export function completedQuestDays(workouts: Workout[], exercises: Exercise[]): number {
  const dates = new Set(workouts.map((w) => w.date))
  let n = 0
  for (const d of dates) if (firstQuestDoneOn(d, workouts, exercises)) n++
  return n
}
