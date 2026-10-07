import { useState } from 'react'
import { Analysis } from './Analysis'
import { History } from './History'

/** Verlauf und Analyse in einem Tab. */
export function Progress({ onEdit }: { onEdit: (id: string) => void }) {
  const [view, setView] = useState<'history' | 'analysis'>('history')
  return (
    <>
      <div className="tabs seg">
        <button className={view === 'history' ? 'on' : ''} onClick={() => setView('history')}>Verlauf</button>
        <button className={view === 'analysis' ? 'on' : ''} onClick={() => setView('analysis')}>Analyse</button>
      </div>
      {view === 'history' ? <History onEdit={onEdit} /> : <Analysis />}
    </>
  )
}
