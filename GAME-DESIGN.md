# Spiel-Entwurf: Charakter, Skill-Baum, Roguelike-Läufe

Status: nur Entwurf, noch nichts gebaut. Annahmen sind unten als Standardwerte gesetzt und leicht änderbar.

## Grundsatz
- Das Spiel ist eine Schicht über dem echten Training. Training eintragen, Plan, Verlauf, Analyse und Sicherung bleiben immer voll nutzbar. Skills sperren nie etwas davon.
- Belohnt wird nur echtes Training (Sätze, Trainings, Rekorde, Quests). Keine Klick-Abkürzungen.
- Alles Spielerische wird aus der Trainingshistorie berechnet. Gespeichert werden nur die Entscheidungen des Spielers: ausgegebene Skillpunkte und die laufende Woche.

## Charakter
- Level, Rang und Stats pro Muskelgruppe gibt es schon (`game.ts`).
- Neu: Eigener Tab „Charakter" mit Skill-Baum, Läufen und Inventar, getrennt vom Training.

## Skillpunkte
- 1 Punkt pro Level (ab Level 2) plus 2 Bonuspunkte bei jedem Rang-Aufstieg.
- Verfügbar = verdiente Punkte − Summe der Kosten freigeschalteter Skills. Gespeichert wird nur `skills: string[]` in den Einstellungen.
- „Umskillen" ist jederzeit kostenlos möglich (Roguelike-Gefühl ohne Frust).

## Baum (4 Äste, je 5 Skills, gestaffelt nach Mindestlevel und Vorgänger)
- **Kraft:** +10 % XP auf Rekorde, dann +20 %, Rekord-Combo (zwei Rekorde im Training geben Extra-XP), Gewichts-Meilensteine.
- **Disziplin:** Serien-Schutz (eine verpasste Woche wird verziehen), Wochenziel-Bonus-XP, Comeback-Bonus nach Pause.
- **Quests:** zweite Tages-Quest, Quest-XP +50 %, Wahl zwischen zwei Quests, Wochen-Quest.
- **Schatten:** Titel und Abzeichen, Farbthemen, Charakter-Rahmen (rein kosmetisch).

## Roguelike-Lauf (pro Woche)
- Montag startet ein Lauf mit 3 Räumen. Vor jedem Raum wählst du eine von zwei zufälligen Aufgaben, z. B. „Ein Rekord an einer Beinübung" oder „20 Sätze diese Woche".
- Der Raum zählt als geschafft, sobald dein echtes Training die Bedingung erfüllt.
- Boss am Ende: dein Wochenziel. Besiegt = dauerhafte Belohnung (Skillpunkt, Titel oder Relikt). Nicht besiegt = nächste Woche neuer Lauf, der Charakter bleibt.
- Relikte sind kleine passive Boni, die nur für den aktuellen Lauf gelten (z. B. +25 % XP für Beintraining).
- Zufall kommt aus einem Seed pro Woche, damit die Auswahl beim Neuladen gleich bleibt.

## Daten (keine Schemaänderung nötig)
- Neue Einstellungs-Schlüssel: `skills` (string[]), `run` ({ weekStart, seed, picked[], done[] }), `titles` (string[]).
- Alles andere wird berechnet.

## Dateien beim Bauen
- `src/skills.ts`: Baumdefinition, Punkteformel, Voraussetzungen, XP-Modifikatoren (reine Funktionen).
- `src/run.ts`: Wochenlauf, Seed, Raumbedingungen als Prüfung gegen die Historie.
- `src/screens/Character.tsx`: Tab „Charakter".
- `src/game.ts`: `xpForWorkout` bekommt die aktiven Skills als Parameter.
- Tests: Punktformel, Voraussetzungen, XP-Modifikatoren, Lauf-Bedingungen und Seed-Stabilität.

## Reihenfolge
1. Skills und Punkte (fester Baum, Tab „Charakter").
2. XP-Modifikatoren im Training, sichtbar im Abschlussfenster.
3. Wochenlauf mit Räumen und Boss.
4. Relikte und Kosmetik.
