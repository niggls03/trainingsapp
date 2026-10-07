/** Tore (Dungeons) und Monster. Alle Zahlen hier sind Balancing und leicht änderbar. */

export interface MonsterDef {
  name: string
  icon: string
}

export interface Gate {
  id: string
  name: string
  /** Jäger-Rang, ab dem das Tor betreten werden darf */
  rank: 'E' | 'D' | 'C'
  /** Mindest-Level des Jägers (passend zu `rankFromLevel`) */
  minLevel: number
  monsters: MonsterDef[]
  boss: MonsterDef
  /** Grundwerte eines Monsters auf Etage 1 */
  hp: number
  atk: number
  def: number
  spd: number
  /** Gold pro Sieg auf Etage 1 */
  gold: number
}

export const FLOORS = 5

export const GATES: Gate[] = [
  {
    id: 'e-hoehle',
    name: 'Höhle der Schleimlinge',
    rank: 'E',
    minLevel: 1,
    monsters: [
      { name: 'Schleimling', icon: '🟢' },
      { name: 'Riesenratte', icon: '🐀' },
      { name: 'Kobold', icon: '👺' },
    ],
    boss: { name: 'Kobold-Häuptling', icon: '👹' },
    hp: 80,
    atk: 12,
    def: 2,
    spd: 0.8,
    gold: 2,
  },
  {
    id: 'd-gruft',
    name: 'Gruft der Knochen',
    rank: 'D',
    minLevel: 5,
    monsters: [
      { name: 'Skelett', icon: '💀' },
      { name: 'Fledermaus', icon: '🦇' },
      { name: 'Ghul', icon: '🧟' },
    ],
    boss: { name: 'Knochenritter', icon: '🗡️' },
    hp: 300,
    atk: 30,
    def: 7,
    spd: 0.9,
    gold: 6,
  },
  {
    id: 'c-wald',
    name: 'Wald der Dunkelheit',
    rank: 'C',
    minLevel: 10,
    monsters: [
      { name: 'Schattenwolf', icon: '🐺' },
      { name: 'Dornenspinne', icon: '🕷️' },
      { name: 'Waldschrat', icon: '🌲' },
    ],
    boss: { name: 'Alpha-Wolf', icon: '🐲' },
    hp: 1000,
    atk: 70,
    def: 16,
    spd: 1,
    gold: 18,
  },
]

export const gateById = (id: string): Gate | undefined => GATES.find((g) => g.id === id)
