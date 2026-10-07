import Dexie, { type EntityTable } from 'dexie'

export const MUSCLE_GROUPS = [
  'Brust',
  'Rücken',
  'Beine',
  'Schultern',
  'Bizeps',
  'Trizeps',
  'Waden',
  'Nacken',
  'Core',
  'Sonstiges',
] as const
export type MuscleGroup = (typeof MUSCLE_GROUPS)[number]

export interface Exercise {
  id: string
  name: string
  muscleGroup: MuscleGroup
}

export interface Template {
  id: string
  name: string
  exerciseIds: string[]
}

export interface WorkoutSet {
  kg: number
  reps: number
}

export interface WorkoutEntry {
  exerciseId: string
  sets: WorkoutSet[]
}

export interface XpLine {
  /** Skill, der diese XP gebracht hat (fehlt bei Grund-XP) */
  skillId?: string
  label: string
  xp: number
}

/**
 * Eintrag im Belohnungs-Buch (Wochenlauf: Räume, Boss). Einträge kommen nur dazu und werden nie entfernt,
 * auch nicht, wenn ein Training später geändert oder gelöscht wird. Die `id` ist eindeutig (z. B. "2026-10-05:boss").
 */
export interface LedgerEntry {
  id: string
  week: string
  label: string
  xp: number
  points: number
}

export interface Workout {
  id: string
  /** Kalendertag im Format YYYY-MM-DD (lokale Zeit) */
  date: string
  templateId?: string
  entries: WorkoutEntry[]
  /**
   * XP, die dieses Training beim Speichern gebracht hat. Wird eingefroren, damit das
   * Freischalten oder Zurücksetzen von Skills nie rückwirkend Level verändert.
   * Beim Ändern eines Trainings wird nur dieses eine neu berechnet; spätere Trainings bleiben unverändert.
   * Ältere Trainings ohne Wert werden ohne Skills berechnet.
   */
  xp?: { total: number; lines: XpLine[] }
}

export interface Setting {
  key: string
  value: unknown
}

export const db = new Dexie('trainingsapp') as Dexie & {
  exercises: EntityTable<Exercise, 'id'>
  templates: EntityTable<Template, 'id'>
  workouts: EntityTable<Workout, 'id'>
  settings: EntityTable<Setting, 'key'>
}

db.version(1).stores({
  exercises: 'id, name',
  templates: 'id',
  workouts: 'id, date',
  settings: 'key',
})

// crypto.randomUUID gibt es nur in sicheren Kontexten (HTTPS/localhost), nicht über http://192.168.x.x
export const newId = (): string =>
  typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : Date.now().toString(36) + Math.random().toString(36).slice(2, 10)

export function todayStr(d = new Date()): string {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const s = await db.settings.get(key)
  return s ? (s.value as T) : fallback
}

export const setSetting = (key: string, value: unknown) => db.settings.put({ key, value })

export interface Backup {
  version: 1
  exercises: Exercise[]
  templates: Template[]
  workouts: Workout[]
  settings: Setting[]
}

export async function exportAll(): Promise<Backup> {
  return {
    version: 1,
    exercises: await db.exercises.toArray(),
    templates: await db.templates.toArray(),
    workouts: await db.workouts.toArray(),
    settings: await db.settings.toArray(),
  }
}

export async function importAll(b: Backup): Promise<void> {
  if (b?.version !== 1 || !Array.isArray(b.workouts) || !Array.isArray(b.exercises)) {
    throw new Error('Das ist keine gültige Sicherungsdatei.')
  }
  await db.transaction('rw', db.exercises, db.templates, db.workouts, db.settings, async () => {
    await Promise.all([db.exercises.clear(), db.templates.clear(), db.workouts.clear(), db.settings.clear()])
    await db.exercises.bulkAdd(b.exercises)
    await db.templates.bulkAdd(b.templates ?? [])
    await db.workouts.bulkAdd(b.workouts)
    await db.settings.bulkAdd(b.settings ?? [])
  })
}
