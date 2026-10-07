import { describe, expect, it } from 'vitest'
import {
  ALL_SKILLS,
  BRANCHES,
  earnedPoints,
  forgiveWeeks,
  isRevealed,
  questCount,
  refund,
  sanitizeSkills,
  skillById,
  skillStatus,
  spentPoints,
  unlock,
} from './skills'

describe('punkte', () => {
  it('1 pro Level ab Level 2, plus 2 pro Rang über E', () => {
    expect(earnedPoints(1, 'E')).toBe(0)
    expect(earnedPoints(4, 'E')).toBe(3)
    expect(earnedPoints(5, 'D')).toBe(4 + 2)
    expect(earnedPoints(15, 'B')).toBe(14 + 6)
  })
  it('Quest-König: +1 je 10 erledigte Quest-Tage, nur mit Skill', () => {
    expect(earnedPoints(5, 'D', 25, false)).toBe(6)
    expect(earnedPoints(5, 'D', 25, true)).toBe(8)
  })
  it('ausgegebene Punkte', () => {
    expect(spentPoints(['kraft.root', 'kraft.l1'])).toBe(2)
  })
})

describe('baum-struktur', () => {
  it('56 Skills, eindeutige IDs, Voraussetzungen existieren, 14 je Ast', () => {
    const ids = ALL_SKILLS.map((s) => s.id)
    expect(ids).toHaveLength(56)
    expect(new Set(ids).size).toBe(56)
    for (const b of BRANCHES) expect(b.skills).toHaveLength(14)
    for (const s of ALL_SKILLS) for (const p of [...(s.requires.any ?? []), ...(s.requires.all ?? [])]) expect(ids).toContain(p)
  })
  it('keine zwei Skills auf demselben Platz und Level steigen nach unten nicht ab', () => {
    for (const b of BRANCHES) {
      const spots = b.skills.map((s) => `${s.col},${s.row}`)
      expect(new Set(spots).size).toBe(spots.length)
      for (const s of b.skills) {
        for (const p of [...(s.requires.any ?? []), ...(s.requires.all ?? [])]) {
          expect(skillById(p)!.minLevel).toBeLessThanOrEqual(s.minLevel)
        }
      }
    }
  })
  it('jeder Skill hat eine Wirkung, einen Titel oder ein Feature-Etikett', () => {
    for (const s of ALL_SKILLS) expect(Boolean(s.effect || s.title || s.later)).toBe(true)
  })
})

describe('freischalten', () => {
  it('Wurzel braucht nur Level und Punkte', () => {
    expect(skillStatus([], 1, 5, 'kraft.root').state).toBe('locked')
    expect(skillStatus([], 2, 5, 'kraft.root')).toEqual({ state: 'available', reasons: [] })
    expect(skillStatus([], 2, 0, 'kraft.root').reasons).toEqual(['1 Punkt(e) fehlen'])
  })
  it('beide Pfade sind frei, Abzweigung braucht den Vorgänger', () => {
    const owned = ['kraft.root']
    expect(skillStatus(owned, 5, 9, 'kraft.l1').state).toBe('available')
    expect(skillStatus(owned, 5, 9, 'kraft.r1').state).toBe('available')
    expect(skillStatus(owned, 20, 9, 'kraft.l2').state).toBe('locked')
  })
  it('Querverbindung braucht beide Pfade (alle)', () => {
    expect(skillStatus(['kraft.root', 'kraft.l1'], 20, 9, 'kraft.x').state).toBe('locked')
    expect(skillStatus(['kraft.root', 'kraft.l1', 'kraft.r1'], 20, 9, 'kraft.x').state).toBe('available')
  })
  it('Ziel braucht das Ende eines Pfads, 3b und 3a sind Alternativen', () => {
    const left = ['kraft.root', 'kraft.l1', 'kraft.l2', 'kraft.l3b', 'kraft.l4']
    expect(skillStatus(left, 20, 9, 'kraft.goal').state).toBe('available')
    expect(skillStatus(left.slice(0, 4), 20, 9, 'kraft.goal').state).toBe('locked')
    expect(skillStatus(left.slice(0, 3), 20, 9, 'kraft.l4').state).toBe('locked')
    expect(skillStatus([...left.slice(0, 3), 'kraft.l3a'], 20, 9, 'kraft.l4').state).toBe('available')
  })
  it('unlock ändert nichts bei gesperrt oder zu wenig Punkten', () => {
    expect(unlock([], 1, 5, 'kraft.root')).toEqual([])
    expect(unlock([], 2, 0, 'kraft.root')).toEqual([])
    expect(unlock([], 2, 1, 'kraft.root')).toEqual(['kraft.root'])
  })
})

describe('zurücksetzen', () => {
  const full = ['kraft.root', 'kraft.l1', 'kraft.r1', 'kraft.x']
  it('Skill mit allen Abhängigen zurückgeben', () => {
    expect(refund(['kraft.root', 'kraft.l1', 'kraft.l2', 'kraft.r1'], 'kraft.l1').sort()).toEqual(['kraft.r1', 'kraft.root'])
  })
  it('Querverbindung verschwindet, wenn eine der beiden Voraussetzungen fehlt (alle)', () => {
    expect(refund(full, 'kraft.l1')).not.toContain('kraft.x')
    expect(refund(full, 'kraft.r1')).not.toContain('kraft.x')
    expect(refund(full, 'kraft.root')).toEqual([])
  })
  it('Ziel bleibt, wenn der andere Pfad noch steht', () => {
    const owned = ['kraft.root', 'kraft.l1', 'kraft.l2', 'kraft.l3a', 'kraft.l4', 'kraft.r1', 'kraft.r2', 'kraft.r3a', 'kraft.r4', 'kraft.goal']
    const noLeft = refund(owned, 'kraft.l1')
    expect(noLeft).toContain('kraft.goal')
    expect(refund(noLeft, 'kraft.r1')).not.toContain('kraft.goal')
  })
  it('sanitize entfernt unbekannte IDs (z. B. aus der alten Baum-Version) und verwaiste Skills', () => {
    expect(sanitizeSkills(['kraft.L0', 'kraft.root', 'zzz', 'kraft.goal'])).toEqual(['kraft.root'])
    expect(sanitizeSkills(['kraft.root', 'kraft.root'])).toEqual(['kraft.root'])
  })
})

describe('sichtbarkeit und effekt-helfer', () => {
  it('Skills weit über deinem Level sind verborgen, Besitz ist immer sichtbar', () => {
    const legend = skillById('kraft.legend')!
    expect(isRevealed([], 5, legend)).toBe(false)
    expect(isRevealed([], 18, legend)).toBe(true)
    expect(isRevealed(['kraft.legend'], 1, legend)).toBe(true)
  })
  it('Quest-Anzahl und verzeihende Wochen', () => {
    expect(questCount([])).toBe(1)
    expect(questCount(['quests.root', 'quests.l1', 'quests.l2'])).toBe(3)
    expect(forgiveWeeks(['disziplin.root', 'disziplin.l1', 'disziplin.l2', 'disziplin.l3a', 'disziplin.l4'])).toBe(2)
  })
})
