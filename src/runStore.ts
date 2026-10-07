import { db, getSetting, todayStr, type LedgerEntry } from './db'
import { chooseRelic, pickRoom, reconcile, type RunState } from './run'

/**
 * Alle Schreibzugriffe auf Lauf und Belohnungs-Buch laufen in einer einzigen Datenbank-Transaktion
 * (lesen, prüfen, schreiben). Dadurch gibt es keine doppelten Belohnungen, auch wenn die Funktion
 * mehrfach oder gleichzeitig aufgerufen wird (z. B. im Entwicklungsmodus von React).
 */
async function update(mutate?: (run: RunState, ledger: LedgerEntry[], today: string) => RunState | null) {
  const today = todayStr()
  return db.transaction('rw', db.settings, db.workouts, db.exercises, async () => {
    const [run0, ledger, workouts, exercises, goal] = await Promise.all([
      getSetting<RunState | null>('run', null),
      getSetting<LedgerEntry[]>('ledger', []),
      db.workouts.toArray(),
      db.exercises.toArray(),
      getSetting<number>('weeklyGoal', 3),
    ])
    const input = { today, run: run0, ledger, workouts, exercises, weeklyGoal: goal }
    let { run, newClaims } = reconcile(input)
    if (mutate) {
      const changed = mutate(run, [...ledger, ...newClaims], today)
      if (changed) {
        run = changed
        // Nach einer Wahl kann der Raum schon geräumt sein
        const again = reconcile({ ...input, run, ledger: [...ledger, ...newClaims] })
        run = again.run
        newClaims = [...newClaims, ...again.newClaims]
      }
    }
    if (JSON.stringify(run) !== JSON.stringify(run0)) await db.settings.put({ key: 'run', value: run })
    if (newClaims.length) await db.settings.put({ key: 'ledger', value: [...ledger, ...newClaims] })
    return { run, newClaims }
  })
}

/** Lauf der Woche anlegen bzw. aktualisieren und neue Belohnungen verbuchen. */
export const reconcileStored = () => update()

export const pickRoomStored = (row: number, optionId: string) =>
  update((run, ledger, today) => pickRoom(run, ledger, row, optionId, today))

export const chooseRelicStored = (row: number, relicId: string) => update((run) => chooseRelic(run, row, relicId))
