import { useEffect, useState, type ReactNode } from 'react'
import { initApp } from './init'
import { useData } from './useData'
import { ownedThemes } from './skills'
import { reconcileStored } from './runStore'
import { Tutorial } from './components/Tutorial'
import { Home } from './screens/Home'
import { WorkoutScreen } from './screens/Workout'
import { Plan } from './screens/Plan'
import { History } from './screens/History'
import { Analysis } from './screens/Analysis'
import { Settings } from './screens/Settings'
import { Character } from './screens/Character'

export type CharView = 'skills' | 'run'
export type Tab = 'home' | 'character' | 'plan' | 'history' | 'analysis' | 'settings'
export interface WorkoutRequest {
  templateId?: string
  editId?: string
  /** Name einer Quest-Übung, die (falls nötig) angelegt und direkt ins Training gelegt wird */
  questExercise?: { name: string; group: string }
}

const Icon = ({ children }: { children: ReactNode }) => (
  <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    {children}
  </svg>
)

const TABS: [Tab, string, ReactNode][] = [
  ['home', 'Status', <Icon><path d="M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7z" /></Icon>],
  ['character', 'Charakter', <Icon><circle cx="12" cy="8" r="4" /><path d="M4 21c1-5 4-7 8-7s7 2 8 7" /></Icon>],
  ['history', 'Verlauf', <Icon><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></Icon>],
  ['analysis', 'Analyse', <Icon><path d="M3 17l6-6 4 4 8-8" /><path d="M15 7h6v6" /></Icon>],
  ['plan', 'Plan', <Icon><path d="M4 6h16M4 12h16M4 18h10" /></Icon>],
  ['settings', 'Mehr', <Icon><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2" /></Icon>],
]

const TITLES: Record<Tab, string> = {
  home: 'Status',
  character: 'Charakter',
  history: 'Verlauf',
  analysis: 'Analyse',
  plan: 'Plan',
  settings: 'Mehr',
}

export default function App() {
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')
  const [tab, setTab] = useState<Tab>('home')
  const [charView, setCharView] = useState<CharView>('skills')
  const [workout, setWorkout] = useState<WorkoutRequest | null>(null)
  const [showTutorial, setShowTutorial] = useState(false)
  const { loaded, tutorialDone, skills, theme } = useData()
  const activeTheme = theme && ownedThemes(skills).includes(theme) ? theme : ''

  useEffect(() => {
    // Browser bitten, die Daten nicht von selbst zu löschen
    navigator.storage?.persist?.().catch(() => {})
    initApp()
      .then(() => reconcileStored()) // Lauf der Woche anlegen (mit eingefrorenem Wochenziel)
      .then(() => setReady(true))
      .catch((e) => setError(String(e)))
  }, [])

  // Farbthema auf die ganze Seite anwenden
  useEffect(() => {
    if (activeTheme) document.documentElement.dataset.theme = activeTheme
    else delete document.documentElement.dataset.theme
  }, [activeTheme])

  if (error) return <p className="center">Fehler beim Start: {error}</p>
  if (!ready || !loaded) return <p className="muted center">System lädt…</p>

  const firstRun = !tutorialDone
  const tutorial = (firstRun || showTutorial) && (
    <Tutorial withName={firstRun} onClose={() => setShowTutorial(false)} />
  )

  if (workout) {
    return (
      <>
        <WorkoutScreen {...workout} onDone={() => setWorkout(null)} />
        {tutorial}
      </>
    )
  }

  return (
    <div className="app">
      <header className="sysbar">
        <div>
          <small className="sys">[ SYSTEM ]</small>
          <h1>{TITLES[tab]}</h1>
        </div>
        <button className="help" onClick={() => setShowTutorial(true)} aria-label="Tutorial öffnen">
          ?
        </button>
      </header>
      <main>
        {tab === 'home' && (
          <Home
            onStart={setWorkout}
            onNavigate={(t, view) => {
              if (view) setCharView(view)
              setTab(t)
            }}
          />
        )}
        {tab === 'character' && <Character view={charView} onView={setCharView} />}
        {tab === 'history' && <History onEdit={(id) => setWorkout({ editId: id })} />}
        {tab === 'analysis' && <Analysis />}
        {tab === 'plan' && <Plan />}
        {tab === 'settings' && <Settings onTutorial={() => setShowTutorial(true)} />}
      </main>
      <nav>
        {TABS.map(([t, label, icon]) => (
          <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>
            {icon}
            {label}
          </button>
        ))}
      </nav>
      {tutorial}
    </div>
  )
}
