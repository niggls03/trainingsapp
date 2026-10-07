import { useEffect, useRef, useState } from 'react'
import { setSetting } from '../db'
import {
  BRANCHES,
  isRevealed,
  parentIds,
  refund,
  skillStatus,
  unlock,
  type Skill,
  type SkillState,
} from '../skills'
import { useData } from '../useData'

const COL_X = [40, 110, 180, 250, 320]
const rowY = (row: number) => 56 + row * 100
const VIEW_W = 360
const VIEW_H = rowY(6) + 74
const COLOR: Record<SkillState, string> = { unlocked: '#3dffb0', available: '#4cd9ff', locked: '#243a6e' }
const MIN_K = 0.6
const MAX_K = 3
const TAP_SLOP = 8

const MARK: Record<string, string> = { root: '◆', x: '✦', goal: '★', legend: '♛' }
const markOf = (s: Skill): string => {
  const part = s.id.split('.')[1]
  if (MARK[part]) return MARK[part]
  return part.replace(/\D/g, '')
}

/** Namen auf höchstens zwei Zeilen à ca. 12 Zeichen verteilen. */
function wrap(name: string): string[] {
  if (name.length <= 12) return [name]
  const words = name.split(' ')
  if (words.length === 1) return [name.slice(0, 11) + '…']
  let first = ''
  for (const w of words) {
    if ((first + ' ' + w).trim().length > 12 && first) break
    first = (first + ' ' + w).trim()
  }
  const rest = name.slice(first.length).trim()
  return [first, rest.length > 12 ? rest.slice(0, 11) + '…' : rest]
}

type View = { x: number; y: number; k: number }
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/** Vollbild-Skill-Baum: mit einem Finger verschieben, mit zwei Fingern zoomen, Skill antippen für Details. */
export function SkillTree({ initialBranch, onClose }: { initialBranch: number; onClose: () => void }) {
  const { skills, player } = useData()
  const { lv, free } = player
  const [branchIdx, setBranchIdx] = useState(initialBranch)
  const [selected, setSelected] = useState<string | null>(null)
  const [view, setView] = useState<View>({ x: 0, y: 0, k: 1 })
  const box = useRef<HTMLDivElement>(null)
  const viewRef = useRef(view)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const gesture = useRef({ moved: 0, startDist: 0, startK: 1 })

  const branch = BRANCHES[branchIdx]
  const byId = new Map(branch.skills.map((s) => [s.id, s]))
  const pos = (s: Skill) => ({ x: COL_X[s.col], y: rowY(s.row) })
  const sel = selected ? branch.skills.find((s) => s.id === selected) : undefined

  const apply = (v: View) => {
    const el = box.current
    if (el) {
      const w = el.clientWidth
      const h = el.clientHeight
      const cw = VIEW_W * v.k
      const ch = VIEW_H * v.k
      // Baum darf nicht ganz aus dem Fenster geschoben werden
      v = {
        k: v.k,
        x: cw <= w ? (w - cw) / 2 : clamp(v.x, w - cw - 40, 40),
        y: ch <= h ? (h - ch) / 2 : clamp(v.y, h - ch - 40, 40),
      }
    }
    viewRef.current = v
    setView(v)
  }

  // Beim Öffnen und Ast-Wechsel: auf Fensterbreite einpassen, oben beginnen
  useEffect(() => {
    const el = box.current
    if (!el) return
    const k = clamp(el.clientWidth / VIEW_W, MIN_K, MAX_K)
    apply({ k, x: 0, y: 0 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchIdx])

  // Hintergrund nicht mitscrollen
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  const dist = () => {
    const [a, b] = [...pointers.current.values()]
    return Math.hypot(a.x - b.x, a.y - b.y)
  }
  const mid = () => {
    const [a, b] = [...pointers.current.values()]
    const r = box.current!.getBoundingClientRect()
    return { x: (a.x + b.x) / 2 - r.left, y: (a.y + b.y) / 2 - r.top }
  }

  const onDown = (e: React.PointerEvent) => {
    box.current?.setPointerCapture(e.pointerId)
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pointers.current.size === 1) gesture.current.moved = 0
    if (pointers.current.size === 2) {
      gesture.current.startDist = dist()
      gesture.current.startK = viewRef.current.k
      gesture.current.moved = TAP_SLOP + 1
    }
  }

  const onMove = (e: React.PointerEvent) => {
    const prev = pointers.current.get(e.pointerId)
    if (!prev) return
    const cur = { x: e.clientX, y: e.clientY }
    const v = viewRef.current
    if (pointers.current.size === 1) {
      const dx = cur.x - prev.x
      const dy = cur.y - prev.y
      gesture.current.moved += Math.abs(dx) + Math.abs(dy)
      pointers.current.set(e.pointerId, cur)
      if (gesture.current.moved > TAP_SLOP) apply({ ...v, x: v.x + dx, y: v.y + dy })
    } else if (pointers.current.size === 2) {
      const before = mid()
      pointers.current.set(e.pointerId, cur)
      const after = mid()
      const k = clamp(gesture.current.startK * (dist() / gesture.current.startDist), MIN_K, MAX_K)
      // Punkt unter den Fingern bleibt unter den Fingern
      const wx = (before.x - v.x) / v.k
      const wy = (before.y - v.y) / v.k
      apply({ k, x: after.x - wx * k, y: after.y - wy * k })
    }
  }

  const onUp = (e: React.PointerEvent) => {
    const wasSingle = pointers.current.size === 1
    pointers.current.delete(e.pointerId)
    if (wasSingle && e.type === 'pointerup' && gesture.current.moved <= TAP_SLOP) {
      // Tippen: Skill unter dem Finger suchen (Pointer Capture verhindert normale Klicks auf den Knoten)
      const hit = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-skill]')
      setSelected(hit ? hit.getAttribute('data-skill') : null)
    }
    if (pointers.current.size === 1) {
      // Von zwei Fingern auf einen: nicht ruckartig springen
      gesture.current.moved = TAP_SLOP + 1
    }
  }

  const save = (next: string[]) => setSetting('skills', next)
  const revealed = sel ? isRevealed(skills, lv.level, sel) : false
  const status = sel ? skillStatus(skills, lv.level, free, sel.id) : null

  return (
    <div className="treefull" role="dialog" aria-label="Skill-Baum">
      <header className="treehead">
        <div className="tabs">
          {BRANCHES.map((b, i) => (
            <button
              key={b.key}
              className={i === branchIdx ? 'on' : ''}
              onClick={() => {
                setBranchIdx(i)
                setSelected(null)
              }}
            >
              <span>{b.icon}</span>
              {b.title}
            </button>
          ))}
        </div>
        <div className="between">
          <span className="points">{free} Skillpunkte frei</span>
          <button onClick={onClose}>Schließen ✕</button>
        </div>
      </header>

      <div
        ref={box}
        className="treepan"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      >
        <svg
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          width={VIEW_W * view.k}
          height={VIEW_H * view.k}
          style={{ transform: `translate(${view.x}px, ${view.y}px)` }}
          role="img"
          aria-label={`Skill-Baum ${branch.title}`}
        >
          {branch.skills.flatMap((s) =>
            parentIds(s).map((p) => {
              const a = pos(byId.get(p)!)
              const b = pos(s)
              const on = skills.includes(s.id) && skills.includes(p)
              return <line key={s.id + p} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={on ? '#3dffb0' : '#243a6e'} strokeWidth="2.4" />
            }),
          )}
          <text x={COL_X[0]} y={rowY(2) + 68} className="pathlabel">{branch.leftName.toUpperCase()}</text>
          <text x={COL_X[4]} y={rowY(2) + 68} className="pathlabel">{branch.rightName.toUpperCase()}</text>
          {branch.skills.map((s) => {
            const st = skillStatus(skills, lv.level, free, s.id).state
            const shown = isRevealed(skills, lv.level, s)
            const c = shown ? COLOR[st] : '#1a2650'
            const { x, y } = pos(s)
            const big = ['root', 'goal', 'legend'].includes(s.id.split('.')[1])
            const r = big ? 24 : 20
            const lines = shown ? wrap(s.name) : ['???']
            return (
              <g key={s.id} data-skill={s.id}>
                <circle cx={x} cy={y} r={32} fill="transparent" />
                <circle
                  cx={x}
                  cy={y}
                  r={r}
                  fill={st === 'unlocked' ? 'rgba(61,255,176,.15)' : '#0a1228'}
                  stroke={c}
                  strokeWidth="2.6"
                  strokeDasharray={selected === s.id ? '4 3' : undefined}
                  style={shown && st !== 'locked' ? { filter: `drop-shadow(0 0 6px ${c})` } : undefined}
                />
                <text x={x} y={y + 4} style={{ fill: c, fontSize: 13, fontWeight: 700 }}>{shown ? markOf(s) : '?'}</text>
                {lines.map((ln, i) => (
                  <text key={i} x={x} y={y + r + 12 + i * 10} className="nodelabel">{ln}</text>
                ))}
              </g>
            )
          })}
        </svg>
        {!sel && <small className="treehint">Ziehen = bewegen · Zwei Finger = zoomen · Skill antippen = Details</small>}
      </div>

      {sel && status && (
        <section className="treesheet" onPointerDown={(e) => e.stopPropagation()}>
          <div className="between">
            <small className="sys">{branch.icon} {branch.title.toUpperCase()}</small>
            <button onClick={() => setSelected(null)} aria-label="Details schließen">✕</button>
          </div>
          {revealed ? (
            <>
              <h3>{sel.name}</h3>
              <p className="muted">{sel.desc}</p>
              <small>
                Kosten: <b className="points">{sel.cost} {sel.cost === 1 ? 'Punkt' : 'Punkte'}</b> · Ab Level {sel.minLevel}
              </small>
              {sel.later && <small className="warn">Wirkt erst, sobald der {sel.later} gebaut ist.</small>}
              {status.reasons.length > 0 && <small className="warn">{status.reasons.join(' · ')}</small>}
              {status.state === 'unlocked' ? (
                <button className="danger block" onClick={() => save(refund(skills, sel.id))}>
                  Zurücksetzen (Punkte zurück)
                </button>
              ) : (
                <button
                  className="primary block"
                  disabled={status.state !== 'available' || status.reasons.length > 0}
                  onClick={() => save(unlock(skills, lv.level, free, sel.id))}
                >
                  Freischalten
                </button>
              )}
            </>
          ) : (
            <>
              <h3>???</h3>
              <p className="muted">Dieser Skill ist noch verborgen. Er wird sichtbar, sobald du Level {sel.minLevel - 4} erreichst.</p>
            </>
          )}
        </section>
      )}
    </div>
  )
}
