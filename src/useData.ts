import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo } from 'react'
import { db, type LedgerEntry } from './db'
import { playerState } from './game'
import { sanitizeGame } from './gameState'
import type { RunState } from './run'
import { sanitizeSkills, type ThemeId } from './skills'

/** Alle Daten live aus der Datenbank. Während des ersten Ladens ist `loaded` false. */
export function useData() {
  const exercises = useLiveQuery(() => db.exercises.toArray())
  const templates = useLiveQuery(() => db.templates.toArray())
  const workouts = useLiveQuery(() => db.workouts.toArray())
  const settings = useLiveQuery(() => db.settings.toArray())
  const get = <T,>(key: string, fallback: T) => (settings?.find((s) => s.key === key)?.value as T) ?? fallback
  const skills = sanitizeSkills(get<string[]>('skills', []))
  const ledger = get<LedgerEntry[]>('ledger', [])
  const player = useMemo(
    () => playerState(workouts ?? [], exercises ?? [], skills, ledger),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [workouts, exercises, settings],
  )
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const game = useMemo(() => sanitizeGame(settings?.find((s) => s.key === 'game')?.value), [settings])
  return {
    game,
    loaded: !!(exercises && templates && workouts && settings),
    exercises: exercises ?? [],
    templates: templates ?? [],
    workouts: workouts ?? [],
    weeklyGoal: get('weeklyGoal', 3),
    hunterName: get('hunterName', ''),
    tutorialDone: get('tutorialDone', false),
    // Unbekannte oder verwaiste Skills (z. B. aus älteren Versionen) werden ignoriert
    skills,
    ledger,
    run: get<RunState | null>('run', null),
    /** Level, Rang, XP und Skillpunkte, an einer Stelle berechnet */
    player,
    theme: get<ThemeId | ''>('theme', ''),
    title: get<string>('title', ''),
  }
}
