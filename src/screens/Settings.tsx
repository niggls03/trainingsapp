import { useRef, useState } from 'react'
import { db, exportAll, importAll, setSetting, todayStr } from '../db'
import { useData } from '../useData'

export function Settings({ onTutorial }: { onTutorial: () => void }) {
  const { loaded, weeklyGoal, hunterName } = useData()
  const fileRef = useRef<HTMLInputElement>(null)
  const [msg, setMsg] = useState('')
  if (!loaded) return null

  async function doExport() {
    const name = `trainingsapp-sicherung-${todayStr()}.json`
    const text = JSON.stringify(await exportAll(), null, 2)
    const file = new File([text], name, { type: 'application/json' })
    // Auf dem iPhone ist das Teilen-Menü der zuverlässige Weg, die Datei in Dateien/iCloud zu speichern.
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: name })
        setMsg('Sicherung erstellt.')
      } catch {
        setMsg('Abgebrochen.')
      }
      return
    }
    const url = URL.createObjectURL(file)
    const a = document.createElement('a')
    a.href = url
    a.download = name
    a.click()
    URL.revokeObjectURL(url)
    setMsg('Sicherung erstellt.')
  }

  async function doImport(file: File) {
    if (!window.confirm('Import ersetzt ALLE aktuellen Daten durch die Sicherung. Fortfahren?')) return
    try {
      await importAll(JSON.parse(await file.text()))
      setMsg('Sicherung eingespielt.')
    } catch (e) {
      setMsg('Fehler: ' + (e instanceof Error ? e.message : String(e)))
    }
  }

  return (
    <>
            <section className="panel">
        <h3 className="ptitle">Dein Name</h3>
        <input
          key={hunterName}
          placeholder="Jäger-Name"
          defaultValue={hunterName}
          onBlur={(e) => setSetting('hunterName', e.target.value.trim())}
        />
      </section>
      <section className="panel">
        <h3 className="ptitle">Hilfe</h3>
        <button className="block" onClick={onTutorial}>Tutorial noch einmal ansehen</button>
      </section>
      <section className="panel">
        <h3 className="ptitle">Wochenziel</h3>
        <p className="muted">Trainings pro Woche für deine Streak.</p>
        <div className="chips">
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <button key={n} className={n === weeklyGoal ? 'primary' : ''} onClick={() => setSetting('weeklyGoal', n)}>{n}</button>
          ))}
        </div>
      </section>
      <section className="panel">
        <h3 className="ptitle">Sicherung</h3>
        <p className="muted">
          Deine Daten liegen nur auf diesem Handy. Mach regelmäßig eine Sicherung und speichere die Datei z. B. in iCloud.
        </p>
        <button className="primary block" onClick={doExport}>Sicherung exportieren</button>
        <button className="block" onClick={() => fileRef.current?.click()}>Sicherung importieren</button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) doImport(f)
            e.target.value = ''
          }}
        />
        {msg && <p>{msg}</p>}
      </section>
      <section className="panel">
        <h3 className="ptitle">Alles zurücksetzen</h3>
        <button
          className="danger block"
          onClick={async () => {
            if (!window.confirm('Wirklich ALLE Daten löschen? Das geht nicht rückgängig.')) return
            await Promise.all([db.exercises.clear(), db.templates.clear(), db.workouts.clear(), db.settings.clear()])
            location.reload() // initApp legt danach die Grundeinstellungen neu an
          }}
        >
          Alle Daten löschen
        </button>
      </section>
    </>
  )
}
