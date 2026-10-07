import type { Exercise, LedgerEntry, MuscleGroup, Workout } from './db'
import { xpForWorkout } from './game'
import { firstQuestDoneOn } from './quests'
import { RARITY_WEIGHT, RELICS } from './relics'
import { volume, weekStart } from './stats'

export type RoomType = 'kampf' | 'relikt' | 'elite'
type Metric = 'sets' | 'volume' | 'reps' | 'days' | 'groups' | 'records' | 'recordsIn' | 'quests' | 'maxSets' | 'newExercises'

export interface Task {
  id: string
  text: string
  metric: Metric
  target: number
  groups?: MuscleGroup[]
}

export interface RoomOption {
  id: string
  type: RoomType
  task: Task
  xp: number
}

export interface RunMap {
  week: string
  /** Drei Reihen mit je zwei Räumen, danach der Boss */
  rows: [RoomOption[], RoomOption[], RoomOption[]]
  bossName: string
}

export interface RunState {
  week: string
  /** Wochenziel zu Beginn der Woche. Spätere Änderungen beeinflussen den Boss nicht. */
  goal: number
  /** Gewählter Raum je Reihe ("1".."3") und der Tag der Wahl; ab diesem Tag zählt das Training für den Raum. */
  picks: Record<string, { option: string; on: string }>
  relics: string[]
  /** Angebotene Relikte je Reihe. Werden beim Räumen einmal festgelegt und danach nie neu gewürfelt. */
  offers: Record<string, { ids: string[]; taken: string | null }>
}

export const ROOM_XP: Record<RoomType, number> = { kampf: 60, relikt: 40, elite: 100 }
export const BOSS_XP = 150
export const BOSS_POINTS = 1

const UPPER: MuscleGroup[] = ['Brust', 'Rücken', 'Schultern', 'Bizeps', 'Trizeps']
const LEGS: MuscleGroup[] = ['Beine', 'Waden']

const NORMAL: Task[] = [
  { id: 'sets15', text: 'Absolviere 15 Sätze.', metric: 'sets', target: 15 },
  { id: 'sets25', text: 'Absolviere 25 Sätze.', metric: 'sets', target: 25 },
  { id: 'vol4k', text: 'Bewege 4.000 kg Gesamtvolumen.', metric: 'volume', target: 4000 },
  { id: 'vol8k', text: 'Bewege 8.000 kg Gesamtvolumen.', metric: 'volume', target: 8000 },
  { id: 'reps80', text: 'Schaffe 80 Wiederholungen insgesamt.', metric: 'reps', target: 80 },
  { id: 'days2', text: 'Trainiere an 2 verschiedenen Tagen.', metric: 'days', target: 2 },
  { id: 'groups2', text: 'Trainiere 2 verschiedene Muskelgruppen.', metric: 'groups', target: 2 },
  { id: 'groups3', text: 'Trainiere 3 verschiedene Muskelgruppen.', metric: 'groups', target: 3 },
  { id: 'rec1', text: 'Setze einen neuen Rekord.', metric: 'records', target: 1 },
  { id: 'recLegs', text: 'Setze einen Rekord an einer Beinübung.', metric: 'recordsIn', target: 1, groups: LEGS },
  { id: 'recUpper', text: 'Setze einen Rekord an einer Oberkörperübung.', metric: 'recordsIn', target: 1, groups: UPPER },
  { id: 'quest1', text: 'Erledige eine tägliche Quest.', metric: 'quests', target: 1 },
  { id: 'big12', text: 'Absolviere ein Training mit mindestens 12 Sätzen.', metric: 'maxSets', target: 12 },
  { id: 'newEx', text: 'Mache eine Übung zum ersten Mal.', metric: 'newExercises', target: 1 },
]

const ELITE: Task[] = [
  { id: 'rec3', text: 'Setze 3 neue Rekorde.', metric: 'records', target: 3 },
  { id: 'sets40', text: 'Absolviere 40 Sätze.', metric: 'sets', target: 40 },
  { id: 'vol15k', text: 'Bewege 15.000 kg Gesamtvolumen.', metric: 'volume', target: 15000 },
  { id: 'groups4', text: 'Trainiere 4 verschiedene Muskelgruppen.', metric: 'groups', target: 4 },
  { id: 'big20', text: 'Absolviere ein Training mit mindestens 20 Sätzen.', metric: 'maxSets', target: 20 },
  { id: 'quest2', text: 'Erledige an 2 Tagen die tägliche Quest.', metric: 'quests', target: 2 },
]

const BOSS_NAMES = ['Der Schatten-Wächter', 'Eisenkönig Baran', 'Die Nebelhexe', 'Grollfang der Alte', 'Der Hohlritter', 'Seelenfresser Vorn']

const ROW_TYPES: RoomType[][] = [
  ['kampf', 'relikt'],
  ['relikt', 'elite'],
  ['kampf', 'relikt'],
]

// ---------- Zufall (fest pro Woche) ----------

function hash(str: string): number {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function rng(seed: string): () => number {
  let a = hash(seed)
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function shuffled<T>(arr: T[], rand: () => number): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** Die Karte einer Woche. Hängt ausschließlich vom Wochen-Schlüssel ab, nie von Skills, Übungen oder Ziel. */
export function generateRun(week: string): RunMap {
  const rand = rng(`${week}:map`)
  const normal = shuffled(NORMAL, rand)
  const elite = shuffled(ELITE, rand)
  let n = 0
  let e = 0
  const rows = ROW_TYPES.map((types, r) =>
    types.map((type, i): RoomOption => {
      const task = type === 'elite' ? elite[e++] : normal[n++]
      return { id: `r${r + 1}${i === 0 ? 'a' : 'b'}`, type, task, xp: ROOM_XP[type] }
    }),
  ) as RunMap['rows']
  return { week, rows, bossName: BOSS_NAMES[Math.floor(rand() * BOSS_NAMES.length)] }
}

/** Drei verschiedene Relikte, nach Seltenheit gewichtet; ohne bereits besessene. */
export function offerRelics(week: string, row: number, owned: string[]): string[] {
  const rand = rng(`${week}:offer:${row}`)
  const pool = RELICS.filter((r) => !owned.includes(r.id))
  const picks: string[] = []
  while (picks.length < 3 && pool.length) {
    const total = pool.reduce((n, r) => n + RARITY_WEIGHT[r.rarity], 0)
    let x = rand() * total
    const idx = pool.findIndex((r) => (x -= RARITY_WEIGHT[r.rarity]) < 0)
    picks.push(pool.splice(idx < 0 ? 0 : idx, 1)[0].id)
  }
  return picks
}

// ---------- Fortschritt der Aufgaben ----------

export interface Progress {
  value: number
  target: number
  done: boolean
}

/** Trainings der Woche, die für den Raum zählen (ab Wahltag, einschließlich). */
export const windowWorkouts = (workouts: Workout[], week: string, from: string): Workout[] =>
  workouts.filter((w) => weekStart(w.date) === week && w.date >= from)

export function taskProgress(task: Task, win: Workout[], all: Workout[], exercises: Exercise[], from: string): Progress {
  const groupOf = new Map(exercises.map((e) => [e.id, e.muscleGroup]))
  const sets = (w: Workout) => w.entries.reduce((n, e) => n + e.sets.length, 0)
  const recordsOf = (w: Workout) =>
    xpForWorkout(w, all.filter((x) => x.date < w.date), exercises).recordExerciseIds
  let value = 0
  switch (task.metric) {
    case 'sets':
      value = win.reduce((n, w) => n + sets(w), 0)
      break
    case 'volume':
      value = win.reduce((n, w) => n + w.entries.reduce((m, e) => m + volume(e.sets), 0), 0)
      break
    case 'reps':
      value = win.reduce((n, w) => n + w.entries.reduce((m, e) => m + e.sets.reduce((k, s) => k + s.reps, 0), 0), 0)
      break
    case 'days':
      value = new Set(win.map((w) => w.date)).size
      break
    case 'groups':
      value = new Set(win.flatMap((w) => w.entries.map((e) => groupOf.get(e.exerciseId)).filter(Boolean))).size
      break
    case 'records':
      value = win.reduce((n, w) => n + recordsOf(w).length, 0)
      break
    case 'recordsIn':
      value = win.reduce(
        (n, w) => n + recordsOf(w).filter((id) => task.groups?.includes(groupOf.get(id) as MuscleGroup)).length,
        0,
      )
      break
    case 'quests':
      value = [...new Set(win.map((w) => w.date))].filter((d) => firstQuestDoneOn(d, all, exercises)).length
      break
    case 'maxSets':
      value = Math.max(0, ...win.map(sets))
      break
    case 'newExercises': {
      const seenBefore = new Set(all.filter((w) => w.date < from).flatMap((w) => w.entries.map((e) => e.exerciseId)))
      value = new Set(win.flatMap((w) => w.entries.map((e) => e.exerciseId)).filter((id) => !seenBefore.has(id))).size
      break
    }
  }
  return { value, target: task.target, done: value >= task.target }
}

// ---------- Ablauf ----------

export const roomClaimId = (week: string, row: number) => `${week}:room${row}`
export const bossClaimId = (week: string) => `${week}:boss`

export const freshRun = (week: string, goal: number): RunState => ({ week, goal, picks: {}, relics: [], offers: {} })

export const isClaimed = (ledger: LedgerEntry[], id: string) => ledger.some((l) => l.id === id)

/** Welche Reihe ist als Nächstes dran (1–3), oder 4, wenn alle Räume geräumt sind? */
export function currentRow(week: string, ledger: LedgerEntry[]): number {
  for (let r = 1; r <= 3; r++) if (!isClaimed(ledger, roomClaimId(week, r))) return r
  return 4
}

export interface ReconcileInput {
  today: string
  run: RunState | null
  ledger: LedgerEntry[]
  workouts: Workout[]
  exercises: Exercise[]
  weeklyGoal: number
}

/**
 * Bringt den Lauf auf den aktuellen Stand und liefert neue Belohnungen.
 * Idempotent: Ein zweiter Aufruf mit dem Ergebnis des ersten liefert nichts Neues.
 */
export function reconcile(input: ReconcileInput): { run: RunState; newClaims: LedgerEntry[] } {
  const week = weekStart(input.today)
  const run: RunState =
    input.run && input.run.week === week
      ? { ...input.run, picks: { ...input.run.picks }, offers: { ...input.run.offers } }
      : freshRun(week, input.weeklyGoal)
  const map = generateRun(week)
  const claimed = new Set(input.ledger.map((l) => l.id))
  const newClaims: LedgerEntry[] = []

  for (let r = 1; r <= 3; r++) {
    const id = roomClaimId(week, r)
    if (claimed.has(id)) continue
    const pick = run.picks[String(r)]
    if (!pick) break
    const option = map.rows[r - 1].find((o) => o.id === pick.option)
    if (!option) break
    const win = windowWorkouts(input.workouts, week, pick.on)
    if (!taskProgress(option.task, win, input.workouts, input.exercises, pick.on).done) break
    newClaims.push({ id, week, label: `Raum ${r}: ${option.task.text}`, xp: option.xp, points: 0 })
    claimed.add(id)
    if (option.type !== 'kampf' && !run.offers[String(r)]) {
      run.offers[String(r)] = { ids: offerRelics(week, r, run.relics), taken: null }
    }
  }

  const bossId = bossClaimId(week)
  const hits = input.workouts.filter((w) => weekStart(w.date) === week).length
  if (!claimed.has(bossId) && run.goal > 0 && hits >= run.goal) {
    newClaims.push({ id: bossId, week, label: `Boss besiegt: ${map.bossName}`, xp: BOSS_XP, points: BOSS_POINTS })
  }
  return { run, newClaims }
}

/** Raum wählen. Nur der nächste Raum, nur einmal, nur heute. Gibt null zurück, wenn es nicht erlaubt ist. */
export function pickRoom(run: RunState, ledger: LedgerEntry[], row: number, optionId: string, today: string): RunState | null {
  if (row < 1 || row > 3 || run.picks[String(row)]) return null
  if (currentRow(run.week, ledger) !== row) return null
  if (!generateRun(run.week).rows[row - 1].some((o) => o.id === optionId)) return null
  return { ...run, picks: { ...run.picks, [String(row)]: { option: optionId, on: today } } }
}

export function chooseRelic(run: RunState, row: number, relicId: string): RunState | null {
  const offer = run.offers[String(row)]
  if (!offer || offer.taken || !offer.ids.includes(relicId)) return null
  return {
    ...run,
    relics: [...run.relics, relicId],
    offers: { ...run.offers, [String(row)]: { ...offer, taken: relicId } },
  }
}

/** Relikte nur für Trainings aus der Woche des Laufs. Ältere oder spätere Wochen bekommen keine. */
export const relicsFor = (run: RunState | null, date: string): string[] =>
  run && run.week === weekStart(date) ? run.relics : []

export const bossesDefeated = (ledger: LedgerEntry[]): number => ledger.filter((l) => l.id.endsWith(':boss')).length
