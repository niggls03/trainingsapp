import { useState } from 'react'
import { setSetting } from '../db'

interface Step {
  icon: string
  title: string
  body: string[]
}

const STEPS: Step[] = [
  {
    icon: '⚔️',
    title: 'Willkommen, Jäger',
    body: [
      'Diese App ist dein persönliches System: Du trägst nach dem Training deine Sätze ein, siehst deinen Fortschritt und steigst Level für Level auf, wie in Solo Leveling.',
      'Alle Daten bleiben auf diesem Handy. Gleich zeige ich dir in wenigen Schritten, was die App kann.',
    ],
  },
  {
    icon: '🗂️',
    title: '1. Lege deinen Plan an',
    body: [
      'Die App startet leer. Du bestimmst alles selbst.',
      'Tab „Plan“ → „Neuer Trainingstag“: Gib einem Tag einen Namen (z. B. „Brust + Bizeps“) und füge Übungen hinzu. Neue Übungen tippst du einfach ein.',
      'Die Muskelgruppe einer Übung bestimmt, welche Stats bei dir wachsen.',
    ],
  },
  {
    icon: '🏋️',
    title: '2. Training starten',
    body: [
      'Tab „Start“ → tippe auf einen deiner Trainingstage. Du siehst alle Übungen des Tages.',
      '„Freies Training“ startet leer: Du fügst Übungen spontan hinzu.',
      'Über das Datum oben kannst du auch ein Training nachtragen, das du gestern gemacht hast.',
    ],
  },
  {
    icon: '✍️',
    title: '3. Sätze eintragen',
    body: [
      'Pro Satz trägst du Gewicht (kg) und Wiederholungen (Wdh.) ein. Bei Übungen ohne Gewicht, z. B. Liegestütze, lässt du kg leer.',
      'Die Werte vom letzten Mal sind schon eingetragen. Du änderst nur, was diesmal anders war.',
      '„+ Satz“ fügt eine Zeile hinzu, „Satz entfernen“ löscht sie. Am Ende: „Training speichern“.',
    ],
  },
  {
    icon: '✨',
    title: '4. XP, Level und Rang',
    body: [
      'Für jeden Satz bekommst du 10 XP, für jedes Training 50 XP und für jeden neuen Rekord 25 XP.',
      'Mit genug XP steigst du im Level auf. Dein Rang wächst mit dem Level: E → D → C → B → A → S.',
      'Rekord heißt: mehr Gewicht oder mehr Wiederholungen als je zuvor bei dieser Übung.',
    ],
  },
  {
    icon: '📜',
    title: '5. Tägliche Quest',
    body: [
      'Jeden Tag gibt es eine Körpergewichts-Quest, z. B. „50 × Liegestütze“. Sie wechselt täglich.',
      '„Quest starten“ legt die Übung bei Bedarf an und öffnet ein Training. Schaffst du die Wiederholungen in einem Training, gibt es +40 XP.',
    ],
  },
  {
    icon: '🌑',
    title: '6. Charakter und Skill-Baum',
    body: [
      'Im Tab „Charakter“ gibst du Skillpunkte aus: 1 Punkt pro Level und 2 Bonuspunkte bei jedem Rang-Aufstieg.',
      'Es gibt vier Äste (Kraft, Disziplin, Quests, Schatten) mit je 14 Skills. Jeder Ast teilt sich in zwei Pfade, die du beide ausbauen kannst. Skills weit über deinem Level sind noch als „???“ verborgen.',
      'Skills geben Bonus-XP (z. B. mehr XP für Rekorde) oder ändern das Aussehen. Sie wirken nur auf neue Trainings, nie rückwirkend. Umskillen ist kostenlos.',
    ],
  },
  {
    icon: '🗺️',
    title: '7. Wochenlauf und Boss',
    body: [
      'Jede Woche startet ein neuer Lauf, den du im Tab „Charakter“ unter „Wochenlauf“ findest: eine Dungeon-Karte mit 3 Reihen aus je 2 Räumen und einem Boss.',
      'Pro Reihe wählst du einen Raum. Seine Aufgabe zählt nur Training ab dem Tag, an dem du ihn betrittst. Geräumte Räume geben XP, Relikt- und Elite-Räume zusätzlich ein Relikt zur Wahl (1 aus 3), das bis Wochenende gilt.',
      'Der Boss steht für dein Wochenziel: Jedes Training dieser Woche schlägt ihm 1 Lebenspunkt ab. Besiegst du ihn, gibt es +150 XP und 1 Skillpunkt.',
    ],
  },
  {
    icon: '🔥',
    title: '8. Wochenziel und Serie',
    body: [
      'Du legst fest, wie oft pro Woche du trainieren willst (Tab „Mehr“, Standard: 3).',
      'Jede Woche mit erreichtem Ziel verlängert deine Serie. Eine verpasste Woche setzt sie zurück, dein Level bleibt.',
    ],
  },
  {
    icon: '📈',
    title: '9. Verlauf und Analyse',
    body: [
      '„Verlauf“ zeigt alle Trainings. Du kannst sie ändern oder löschen.',
      '„Analyse“ zeigt pro Übung Diagramme: Top-Gewicht, geschätztes Maximum (1RM) und Volumen (Gewicht × Wiederholungen), dazu deine Rekorde.',
    ],
  },
  {
    icon: '💾',
    title: '10. Sicherung nicht vergessen',
    body: [
      'Deine Daten liegen nur auf diesem Gerät. Geht das Handy verloren oder wird der Browser geleert, sind sie weg.',
      'Tab „Mehr“ → „Sicherung exportieren“ und die Datei in iCloud oder Dateien speichern. Am besten einmal pro Woche.',
      'Du findest dieses Tutorial jederzeit wieder über das ? oben rechts.',
    ],
  },
]

export function Tutorial({ onClose, withName }: { onClose: () => void; withName: boolean }) {
  const [i, setI] = useState(0)
  const [name, setName] = useState('')
  const step = STEPS[i]
  const last = i === STEPS.length - 1

  async function close() {
    if (withName && name.trim()) await setSetting('hunterName', name.trim())
    await setSetting('tutorialDone', true)
    onClose()
  }

  return (
    <div className="overlay">
      <div className="panel tutorial">
        <small className="sys">[ SYSTEM ] · {i + 1} / {STEPS.length}</small>
        <div className="ticon">{step.icon}</div>
        <h2>{step.title}</h2>
        {step.body.map((t) => (
          <p key={t}>{t}</p>
        ))}
        {i === 0 && withName && (
          <label className="field">
            <small className="muted">Wie heißt du? (erscheint auf deinem Status-Fenster, optional)</small>
            <input placeholder="Jäger-Name" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
        )}
        <div className="dots">
          {STEPS.map((_, k) => (
            <span key={k} className={k === i ? 'on' : ''} />
          ))}
        </div>
        <div className="row">
          {i > 0 && <button onClick={() => setI(i - 1)}>Zurück</button>}
          <button className="primary" onClick={() => (last ? close() : setI(i + 1))}>
            {last ? 'Los geht’s' : 'Weiter'}
          </button>
        </div>
        {!last && (
          <button className="ghost block" onClick={close}>
            Tutorial überspringen
          </button>
        )}
      </div>
    </div>
  )
}
