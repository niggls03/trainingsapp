import type { MuscleGroup } from './db'

export type BranchKey = 'kraft' | 'disziplin' | 'quests' | 'schatten'

/** Was ein Skill bewirkt. XP-Effekte werden in effects.ts berechnet, der Rest in der Oberfläche. */
export type Effect =
  | { t: 'recordPct'; v: number }
  | { t: 'recordFlat'; v: number }
  | { t: 'combo'; min: number; v: number }
  | { t: 'milestone'; v: number }
  | { t: 'volume'; v: number }
  | { t: 'topWeight'; v: number }
  | { t: 'heavySets'; kg: number; v: number }
  | { t: 'allPct'; v: number; minStreak: number }
  | { t: 'goalHit'; v: number }
  | { t: 'comeback'; days: number; v: number }
  | { t: 'nthOfWeek'; n: number; v: number }
  | { t: 'workoutXp'; v: number }
  | { t: 'setXp'; v: number }
  | { t: 'groupSetPct'; groups: MuscleGroup[]; v: number }
  | { t: 'firstRecord'; v: number }
  | { t: 'bossBar' }
  | { t: 'forgive'; v: number }
  | { t: 'questPct'; v: number }
  | { t: 'questFlat'; v: number }
  | { t: 'questStreak'; days: number; v: number }
  | { t: 'questOver'; v: number }
  | { t: 'extraQuest' }
  | { t: 'questPoints'; every: number }
  | { t: 'theme'; id: ThemeId }
  | { t: 'frame' }
  | { t: 'aura' }
  | { t: 'intro' }

export type ThemeId = 'violet' | 'red' | 'ice' | 'crimson' | 'twilight' | 'gold' | 'shadow'

export const THEMES: Record<ThemeId, string> = {
  violet: 'Violett',
  red: 'Rot',
  ice: 'Eis',
  crimson: 'Blutmond',
  twilight: 'Zwielicht',
  gold: 'Gold',
  shadow: 'Schatten',
}

export interface Requires {
  /** Mindestens einer davon muss freigeschaltet sein */
  any?: string[]
  /** Alle müssen freigeschaltet sein */
  all?: string[]
}

export interface Skill {
  /** z. B. "kraft.root", "kraft.l3a" */
  id: string
  branch: BranchKey
  name: string
  desc: string
  minLevel: number
  cost: number
  /** Position im Baum (Spalte 0–4, Zeile 0–6) */
  col: number
  row: number
  requires: Requires
  effect?: Effect
  title?: string
  /** Wirkt erst, wenn das genannte Feature gebaut ist */
  later?: string
}

export interface Branch {
  key: BranchKey
  title: string
  icon: string
  leftName: string
  rightName: string
  skills: Skill[]
}

// Form des Baums: Wurzel, links und rechts je ein Pfad mit Abzweigung (3a/3b), Querverbindung x, Ziel und Legende.
const SHAPE: Record<string, { col: number; row: number; any?: string[]; all?: string[] }> = {
  root: { col: 2, row: 0 },
  l1: { col: 1, row: 1, any: ['root'] },
  l2: { col: 1, row: 2, any: ['l1'] },
  l3a: { col: 0, row: 3, any: ['l2'] },
  l3b: { col: 1, row: 3, any: ['l2'] },
  l4: { col: 1, row: 4, any: ['l3a', 'l3b'] },
  r1: { col: 3, row: 1, any: ['root'] },
  r2: { col: 3, row: 2, any: ['r1'] },
  r3a: { col: 3, row: 3, any: ['r2'] },
  r3b: { col: 4, row: 3, any: ['r2'] },
  r4: { col: 3, row: 4, any: ['r3a', 'r3b'] },
  x: { col: 2, row: 2, all: ['l1', 'r1'] },
  goal: { col: 2, row: 5, any: ['l4', 'r4'] },
  legend: { col: 2, row: 6, any: ['goal'] },
}

type Extra = { effect?: Effect; title?: string; later?: string }
type Def = [part: string, name: string, desc: string, minLevel: number, cost: number, extra?: Extra]

function build(key: BranchKey, defs: Def[]): Skill[] {
  return defs.map(([part, name, desc, minLevel, cost, extra]) => {
    const shape = SHAPE[part]
    const q = (ids: string[] | undefined) => ids?.map((p) => `${key}.${p}`)
    return {
      id: `${key}.${part}`,
      branch: key,
      name,
      desc,
      minLevel,
      cost,
      col: shape.col,
      row: shape.row,
      requires: { any: q(shape.any), all: q(shape.all) },
      ...extra,
    }
  })
}

export const BRANCHES: Branch[] = [
  {
    key: 'kraft',
    title: 'Kraft',
    icon: '⚔️',
    leftName: 'Jäger-Pfad',
    rightName: 'Titan-Pfad',
    skills: build('kraft', [
      ['root', 'Rekord-Jäger', '+10 % XP auf neue Rekorde.', 2, 1, { effect: { t: 'recordPct', v: 10 } }],
      ['l1', 'Durchbruch', 'Rekord-XP steigen um weitere +10 %.', 4, 1, { effect: { t: 'recordPct', v: 10 } }],
      ['l2', 'Rekord-Combo', 'Zwei oder mehr Rekorde im Training: +30 XP.', 7, 1, { effect: { t: 'combo', min: 2, v: 30 } }],
      ['l3a', 'Rekord-Sprint', 'Drei oder mehr Rekorde im Training: +60 XP.', 10, 2, { effect: { t: 'combo', min: 3, v: 60 } }],
      ['l3b', 'Sammler', 'Jeder Rekord gibt +10 XP extra.', 10, 2, { effect: { t: 'recordFlat', v: 10 } }],
      ['l4', 'Rekordflut', 'Rekord-XP steigen um weitere +20 %.', 13, 2, { effect: { t: 'recordPct', v: 20 } }],
      ['r1', 'Schwerer Schlag', 'Neue Gewichts-Marke (50 / 75 / 100 / 125 / 150 kg) bei einer Übung: +40 XP.', 4, 1, { effect: { t: 'milestone', v: 40 } }],
      ['r2', 'Volumen-Bonus', 'Je volle 1.000 kg Volumen im Training: +10 XP.', 7, 1, { effect: { t: 'volume', v: 10 } }],
      ['r3a', 'Gewichts-Meister', 'Neues Top-Gewicht bei einer Übung: +30 XP.', 10, 2, { effect: { t: 'topWeight', v: 30 } }],
      ['r3b', 'Schwergewicht', 'Jeder Satz ab 50 kg: +4 XP.', 10, 2, { effect: { t: 'heavySets', kg: 50, v: 4 } }],
      ['r4', 'Titan', 'Je volle 1.000 kg Volumen: weitere +15 XP.', 13, 2, { effect: { t: 'volume', v: 15 } }],
      ['x', 'Kraftprotz', 'Alle XP +5 %.', 9, 2, { effect: { t: 'allPct', v: 5, minStreak: 0 } }],
      ['goal', 'Monarch der Stärke', 'Jeder Rekord gibt +25 XP extra. Titel „Monarch der Stärke“.', 16, 3, { effect: { t: 'recordFlat', v: 25 }, title: 'Monarch der Stärke' }],
      ['legend', 'Schattenmonarch', 'Alle XP +10 %. Titel „Schattenmonarch“.', 22, 4, { effect: { t: 'allPct', v: 10, minStreak: 0 }, title: 'Schattenmonarch' }],
    ]),
  },
  {
    key: 'disziplin',
    title: 'Disziplin',
    icon: '🔥',
    leftName: 'Serien-Pfad',
    rightName: 'Rhythmus-Pfad',
    skills: build('disziplin', [
      ['root', 'Routine', 'Wochenziel erreicht: +40 XP.', 2, 1, { effect: { t: 'goalHit', v: 40 } }],
      ['l1', 'Serien-Schutz', 'Eine verpasste Woche bricht deine Serie nicht.', 4, 1, { effect: { t: 'forgive', v: 1 } }],
      ['l2', 'Eiserne Serie', 'Ab 4 Wochen Serie: +10 % XP auf alles.', 7, 1, { effect: { t: 'allPct', v: 10, minStreak: 4 } }],
      ['l3a', 'Wochen-Rhythmus', 'Wochenziel erreicht: weitere +40 XP.', 10, 2, { effect: { t: 'goalHit', v: 40 } }],
      ['l3b', 'Stählerner Wille', 'Ab 8 Wochen Serie: +10 % XP auf alles.', 10, 2, { effect: { t: 'allPct', v: 10, minStreak: 8 } }],
      ['l4', 'Ewige Flamme', 'Eine weitere verpasste Woche wird verziehen.', 13, 2, { effect: { t: 'forgive', v: 1 } }],
      ['r1', 'Comeback', 'Nach 14+ Tagen Pause: +100 XP im ersten Training.', 4, 1, { effect: { t: 'comeback', days: 14, v: 100 } }],
      ['r2', 'Zweiter Atem', 'Das 2. Training der Woche: +20 XP.', 7, 1, { effect: { t: 'nthOfWeek', n: 2, v: 20 } }],
      ['r3a', 'Wochenkrieger', 'Das 4. Training der Woche: +100 XP.', 10, 2, { effect: { t: 'nthOfWeek', n: 4, v: 100 } }],
      ['r3b', 'Frühstarter', 'Das 1. Training der Woche: +20 XP.', 10, 2, { effect: { t: 'nthOfWeek', n: 1, v: 20 } }],
      ['r4', 'Gewohnheit', 'Jedes Training: +15 XP.', 13, 2, { effect: { t: 'workoutXp', v: 15 } }],
      ['x', 'Ruhepuls', 'Jedes Training: +10 XP.', 9, 2, { effect: { t: 'workoutXp', v: 10 } }],
      ['goal', 'Ewiger Jäger', 'Wochenziel erreicht: weitere +60 XP. Titel „Ewiger Jäger“.', 16, 3, { effect: { t: 'goalHit', v: 60 }, title: 'Ewiger Jäger' }],
      ['legend', 'Unerschütterlich', 'Jedes Training: +40 XP. Titel „Unerschütterlich“.', 22, 4, { effect: { t: 'workoutXp', v: 40 }, title: 'Unerschütterlich' }],
    ]),
  },
  {
    key: 'quests',
    title: 'Quests',
    icon: '📜',
    leftName: 'Meister-Pfad',
    rightName: 'Jäger-Pfad',
    skills: build('quests', [
      ['root', 'Zweite Quest', 'Eine zweite tägliche Quest.', 3, 1, { effect: { t: 'extraQuest' } }],
      ['l1', 'Quest-Meister', '+50 % XP auf Quests.', 5, 1, { effect: { t: 'questPct', v: 50 } }],
      ['l2', 'Dritte Quest', 'Eine dritte tägliche Quest.', 8, 1, { effect: { t: 'extraQuest' } }],
      ['l3a', 'Quest-Veteran', 'Jede erledigte Quest: +20 XP.', 11, 2, { effect: { t: 'questFlat', v: 20 } }],
      ['l3b', 'Rückenwind', '+50 % XP auf Quests.', 11, 2, { effect: { t: 'questPct', v: 50 } }],
      ['l4', 'Quest-König', 'Jeder 10. Tag mit erledigter Quest gibt 1 Skillpunkt.', 14, 2, { effect: { t: 'questPoints', every: 10 } }],
      ['r1', 'Doppel-Tag', 'Quest an 2 Tagen nacheinander erledigt: +30 XP.', 5, 1, { effect: { t: 'questStreak', days: 2, v: 30 } }],
      ['r2', 'Quest-Serie', 'Quest an 3 Tagen nacheinander erledigt: +60 XP.', 8, 1, { effect: { t: 'questStreak', days: 3, v: 60 } }],
      ['r3a', 'Quest-Jäger', 'Jede erledigte Quest: +30 XP.', 11, 2, { effect: { t: 'questFlat', v: 30 } }],
      ['r3b', 'Bonusrunde', 'Je 5 Wiederholungen über dem Quest-Ziel: +3 XP.', 11, 2, { effect: { t: 'questOver', v: 3 } }],
      ['r4', 'Quest-Held', '+25 % XP auf Quests.', 14, 2, { effect: { t: 'questPct', v: 25 } }],
      ['x', 'Quest-Schmied', 'Jede erledigte Quest: +10 XP.', 10, 2, { effect: { t: 'questFlat', v: 10 } }],
      ['goal', 'Quest-Monarch', '+25 % XP auf Quests. Titel „Quest-Monarch“.', 16, 3, { effect: { t: 'questPct', v: 25 }, title: 'Quest-Monarch' }],
      ['legend', 'Quest-Gott', '+100 % XP auf Quests. Titel „Quest-Gott“.', 22, 4, { effect: { t: 'questPct', v: 100 }, title: 'Quest-Gott' }],
    ]),
  },
  {
    key: 'schatten',
    title: 'Schatten',
    icon: '🌑',
    leftName: 'Licht',
    rightName: 'Dunkel',
    skills: build('schatten', [
      ['root', 'Schattensoldat', 'Schaltet Titel frei. Du wählst sie im Charakter-Tab. Titel „Schattensoldat“.', 2, 1, { title: 'Schattensoldat' }],
      ['l1', 'Violettes Thema', 'Neues Farbthema für die ganze App.', 5, 1, { effect: { t: 'theme', id: 'violet' } }],
      ['l2', 'Rang-Rahmen', 'Leuchtender Rahmen um dein Rang-Abzeichen.', 7, 1, { effect: { t: 'frame' } }],
      ['l3a', 'Schatten-Aura', 'Deine Level-Balken bekommen eine Aura.', 10, 2, { effect: { t: 'aura' } }],
      ['l3b', 'Lichtbringer', 'Titel „Lichtbringer“.', 10, 2, { title: 'Lichtbringer' }],
      ['l4', 'Eisthema', 'Neues Farbthema in Eisblau.', 13, 2, { effect: { t: 'theme', id: 'ice' } }],
      ['r1', 'Rotes Thema', 'Neues Farbthema in Rot.', 5, 1, { effect: { t: 'theme', id: 'red' } }],
      ['r2', 'Boss-Leiste', 'Animierte Boss-Leiste im Wochenlauf.', 7, 1, { effect: { t: 'bossBar' } }],
      ['r3a', 'Anime-Intro', 'Kurze Intro-Szene beim Start eines Trainings.', 10, 2, { effect: { t: 'intro' } }],
      ['r3b', 'Nachtwandler', 'Titel „Nachtwandler“.', 10, 2, { title: 'Nachtwandler' }],
      ['r4', 'Blutmond', 'Neues Farbthema in Dunkelrot.', 13, 2, { effect: { t: 'theme', id: 'crimson' } }],
      ['x', 'Zwielicht', 'Neues Farbthema in Violett und Rosa.', 9, 2, { effect: { t: 'theme', id: 'twilight' } }],
      ['goal', 'Monarch-Design', 'Goldenes Farbthema. Titel „Goldener Monarch“.', 18, 3, { effect: { t: 'theme', id: 'gold' }, title: 'Goldener Monarch' }],
      ['legend', 'Schattenherrscher', 'Schwarz-weißes Farbthema. Titel „Schattenherrscher“.', 24, 4, { effect: { t: 'theme', id: 'shadow' }, title: 'Schattenherrscher' }],
    ]),
  },
]

export const ALL_SKILLS: Skill[] = BRANCHES.flatMap((b) => b.skills)
const BY_ID = new Map(ALL_SKILLS.map((s) => [s.id, s]))
export const skillById = (id: string): Skill | undefined => BY_ID.get(id)

/** Alle Vorgänger-IDs eines Skills (für Linien im Baum). */
export const parentIds = (s: Skill): string[] => [...(s.requires.any ?? []), ...(s.requires.all ?? [])]

const RANKS = ['E', 'D', 'C', 'B', 'A', 'S']

/**
 * Verdiente Skillpunkte: 1 pro Level ab Level 2, plus 2 bei jedem Rang-Aufstieg über E,
 * plus 1 je 10 erledigte Quest-Tage mit dem Skill „Quest-König“.
 */
export function earnedPoints(level: number, rank: string, questDays = 0, hasQuestKing = false): number {
  const base = Math.max(0, level - 1) + 2 * Math.max(0, RANKS.indexOf(rank))
  return base + (hasQuestKing ? Math.floor(questDays / 10) : 0)
}

export const spentPoints = (owned: string[]): number =>
  owned.reduce((n, id) => n + (skillById(id)?.cost ?? 0), 0)

/** Sind die Voraussetzungen (ohne Level und Punkte) erfüllt? */
function requirementsMet(owned: string[], s: Skill): boolean {
  const { any, all } = s.requires
  if (any && any.length && !any.some((p) => owned.includes(p))) return false
  if (all && all.length && !all.every((p) => owned.includes(p))) return false
  return true
}

/** Entfernt unbekannte IDs und Skills, deren Voraussetzungen nicht (mehr) stimmen. */
export function sanitizeSkills(owned: string[]): string[] {
  let cur = [...new Set(owned)].filter((id) => BY_ID.has(id))
  for (;;) {
    const next = cur.filter((id) => requirementsMet(cur, BY_ID.get(id)!))
    if (next.length === cur.length) return next
    cur = next
  }
}

export type SkillState = 'unlocked' | 'available' | 'locked'

export interface SkillStatus {
  state: SkillState
  /** Warum gesperrt oder nicht kaufbar, für die Anzeige */
  reasons: string[]
}

export function skillStatus(owned: string[], level: number, points: number, id: string): SkillStatus {
  const skill = BY_ID.get(id)
  if (!skill) return { state: 'locked', reasons: ['Unbekannter Skill'] }
  if (owned.includes(id)) return { state: 'unlocked', reasons: [] }
  const reasons: string[] = []
  if (level < skill.minLevel) reasons.push(`Level ${skill.minLevel} nötig`)
  const name = (p: string) => BY_ID.get(p)?.name ?? p
  if (skill.requires.all?.length && !skill.requires.all.every((p) => owned.includes(p))) {
    reasons.push(`${skill.requires.all.map(name).join(' und ')} nötig`)
  }
  if (skill.requires.any?.length && !skill.requires.any.some((p) => owned.includes(p))) {
    reasons.push(`${skill.requires.any.map(name).join(' oder ')} nötig`)
  }
  if (reasons.length) return { state: 'locked', reasons }
  if (points < skill.cost) return { state: 'available', reasons: [`${skill.cost - points} Punkt(e) fehlen`] }
  return { state: 'available', reasons: [] }
}

export function unlock(owned: string[], level: number, points: number, id: string): string[] {
  const st = skillStatus(owned, level, points, id)
  if (st.state !== 'available' || st.reasons.length) return owned
  return [...owned, id]
}

/** Gibt den Skill zurück und alle, die dadurch ihre Voraussetzungen verlieren. */
export function refund(owned: string[], id: string): string[] {
  return sanitizeSkills(owned.filter((o) => o !== id))
}

/** Ein Skill ist erst sichtbar, wenn sein Level höchstens `REVEAL_AHEAD` Stufen entfernt ist (oder er schon gehört). */
export const REVEAL_AHEAD = 4
export const isRevealed = (owned: string[], level: number, s: Skill): boolean =>
  owned.includes(s.id) || level + REVEAL_AHEAD >= s.minLevel

export const ownedEffects = (owned: string[]): { skill: Skill; effect: Effect }[] =>
  owned.flatMap((id) => {
    const s = BY_ID.get(id)
    return s?.effect ? [{ skill: s, effect: s.effect }] : []
  })

export const ownedTitles = (owned: string[]): string[] =>
  owned.flatMap((id) => {
    const t = BY_ID.get(id)?.title
    return t ? [t] : []
  })

export const ownedThemes = (owned: string[]): ThemeId[] =>
  ownedEffects(owned).flatMap(({ effect }) => (effect.t === 'theme' ? [effect.id] : []))

export const hasEffect = (owned: string[], t: Effect['t']): boolean => ownedEffects(owned).some((e) => e.effect.t === t)

/** Anzahl der Tages-Quests (1 plus „Zweite/Dritte Quest“). */
export const questCount = (owned: string[]): number => 1 + ownedEffects(owned).filter((e) => e.effect.t === 'extraQuest').length

/** Verzeihende Wochen für die Serie. */
export const forgiveWeeks = (owned: string[]): number =>
  ownedEffects(owned).reduce((n, e) => n + (e.effect.t === 'forgive' ? e.effect.v : 0), 0)
