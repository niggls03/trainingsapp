import type { Effect } from './skills'

export type Rarity = 'gewöhnlich' | 'selten' | 'episch'

export interface Relic {
  id: string
  name: string
  icon: string
  rarity: Rarity
  desc: string
  effect: Effect
}

/** Relikte gelten für die laufende Woche (den aktuellen Lauf). Sie ändern nur XP, nie Trainingsdaten. */
export const RELICS: Relic[] = [
  { id: 'doppelschlag', name: 'Doppelschlag', icon: '⚡', rarity: 'gewöhnlich', desc: 'Dein erster Rekord pro Training gibt +25 XP extra.', effect: { t: 'firstRecord', v: 25 } },
  { id: 'ausdauer', name: 'Ausdauer-Amulett', icon: '🧿', rarity: 'gewöhnlich', desc: 'Jeder Satz gibt +2 XP extra.', effect: { t: 'setXp', v: 2 } },
  { id: 'volumenstein', name: 'Volumenstein', icon: '🪨', rarity: 'gewöhnlich', desc: 'Je volle 1.000 kg Volumen: +8 XP.', effect: { t: 'volume', v: 8 } },
  { id: 'eisenfaust', name: 'Eisenfaust', icon: '🥊', rarity: 'gewöhnlich', desc: 'Jeder Satz ab 40 kg: +3 XP.', effect: { t: 'heavySets', kg: 40, v: 3 } },
  { id: 'fruehstart', name: 'Ring des Frühstarts', icon: '💍', rarity: 'gewöhnlich', desc: 'Das 1. Training der Woche: +25 XP.', effect: { t: 'nthOfWeek', n: 1, v: 25 } },
  { id: 'beinbrecher', name: 'Beinbrecher', icon: '🗡️', rarity: 'selten', desc: '+25 % XP auf Sätze für Beine und Waden.', effect: { t: 'groupSetPct', groups: ['Beine', 'Waden'], v: 25 } },
  { id: 'brustpanzer', name: 'Brustpanzer', icon: '🛡️', rarity: 'selten', desc: '+25 % XP auf Sätze für Brust und Trizeps.', effect: { t: 'groupSetPct', groups: ['Brust', 'Trizeps'], v: 25 } },
  { id: 'rueckenwind', name: 'Rückenwind-Umhang', icon: '🧥', rarity: 'selten', desc: '+25 % XP auf Sätze für Rücken und Bizeps.', effect: { t: 'groupSetPct', groups: ['Rücken', 'Bizeps'], v: 25 } },
  { id: 'rekordkristall', name: 'Rekord-Kristall', icon: '💎', rarity: 'selten', desc: 'Jeder Rekord gibt +10 XP extra.', effect: { t: 'recordFlat', v: 10 } },
  { id: 'seelenfunke', name: 'Seelenfunke', icon: '✨', rarity: 'selten', desc: 'Jedes Training: +20 XP.', effect: { t: 'workoutXp', v: 20 } },
  { id: 'schattenpfad', name: 'Schattenpfad', icon: '🌑', rarity: 'episch', desc: 'Alle XP +10 %.', effect: { t: 'allPct', v: 10, minStreak: 0 } },
  { id: 'blutdurst', name: 'Blutdurst-Klinge', icon: '⚔️', rarity: 'episch', desc: 'Rekord-XP +50 %.', effect: { t: 'recordPct', v: 50 } },
  { id: 'krone', name: 'Krone des Monarchen', icon: '👑', rarity: 'episch', desc: 'Jedes Training: +40 XP.', effect: { t: 'workoutXp', v: 40 } },
]

const BY_ID = new Map(RELICS.map((r) => [r.id, r]))
export const relicById = (id: string): Relic | undefined => BY_ID.get(id)

export const RARITY_WEIGHT: Record<Rarity, number> = { gewöhnlich: 6, selten: 3, episch: 1 }

/** Effekte der aktiven Relikte, im selben Format wie die der Skills. */
export const relicEffects = (ids: string[]): { id: string; name: string; effect: Effect }[] =>
  ids.flatMap((id) => {
    const r = BY_ID.get(id)
    return r ? [{ id: `relic.${r.id}`, name: r.name, effect: r.effect }] : []
  })
