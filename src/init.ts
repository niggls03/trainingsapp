import { db, getSetting, setSetting } from './db'

/**
 * Erster Start: leere App ohne Vorlagen. Alte Demo-Daten aus früheren Vorschau-Versionen
 * werden dabei einmalig entfernt (erkennbar am fehlenden 'initialized'-Flag).
 */
export async function initApp(): Promise<void> {
  if (await getSetting('initialized', false)) return
  await Promise.all([db.exercises.clear(), db.templates.clear(), db.workouts.clear(), db.settings.clear()])
  await setSetting('weeklyGoal', 3)
  await setSetting('initialized', true)
}
