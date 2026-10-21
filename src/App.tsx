import { useEffect, useReducer, useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Keyboard, HardDrive, Globe, Printer, Activity, ArrowRight, CheckCheck, CirclePause, Cpu, FilePlus2, ListOrdered, LogIn, Plus, RotateCcw, SkipForward, Terminal, Timer, Workflow } from 'lucide-react'
import { MAX_PROCESSES, PROCESS_STATES, activeProcessCount, resetSimulation, simulationReducer, stateLabels } from './simulation'
import type { Process, ProcessState } from './simulation'
import { handleKeyboardCommand } from './keyboard'
import './App.css'

const initialState = resetSimulation(Date.now() >>> 0)

const workflowSteps = [
  { key: 'n', label: 'N', name: 'Crear', flow: '→ Nuevo', state: 'new' },
  { key: 'a', label: 'A', name: 'Admitir', flow: 'Nuevo → Listo', state: 'ready' },
  { key: ' ', label: 'ESPACIO', name: 'Despachar / CPU', flow: 'Listo → Corriendo', state: 'running' },
  { key: 'i', label: 'I', name: 'Solicitar E/S', flow: 'Corriendo → Bloqueado', state: 'blocked' },
  { key: '1-9', label: '1–9', name: 'Completar E/S', flow: 'Bloqueado → Listo', state: 'ready' },
]

const workflowFooterShortcuts: Record<ProcessState, string | null> = {
  new: 'A',
  ready: 'ESPACIO',
  running: 'I',
  blocked: '1–9',
  terminated: null,
}

const stateMeta: Record<ProcessState, { Icon: LucideIcon; subtitle: string; footer: string; empty: string; emptyHint: string }> = {
  new: { Icon: FilePlus2, subtitle: 'Creados, pendientes de admisión', footer: 'Admisión → Listo', empty: 'Sin procesos nuevos', emptyHint: 'Los procesos creados aparecerán aquí' },
  ready: { Icon: ListOrdered, subtitle: 'En espera de CPU', footer: 'Despacho a CPU', empty: 'Cola vacía', emptyHint: 'Los procesos admitidos aparecerán aquí' },
  running: { Icon: Cpu, subtitle: 'Ejecutando en CPU', footer: 'Quantum agotado → Listo', empty: 'CPU IDLE', emptyHint: 'El próximo proceso ocupará este lugar' },
  blocked: { Icon: CirclePause, subtitle: 'Esperando entrada / salida', footer: 'E/S completada → Listo', empty: 'Sin operaciones de E/S', emptyHint: 'Los procesos bloqueados aparecerán aquí' },
  terminated: { Icon: CheckCheck, subtitle: 'Trabajo finalizado', footer: 'Salida definitiva', empty: 'Nada terminado', emptyHint: 'Los procesos finalizados se conservan aquí' },
}

function ProcessCard({ process: p, quantum, slot, onComplete, onAdmit, flashed }: { process: Process; quantum: number; slot: number; onComplete: () => void; onAdmit: () => void; flashed: boolean }) {
  const IOIcon = { Teclado: Keyboard, Disco: HardDrive, Red: Globe, Impresora: Printer }[p.ioType ?? 'Disco']
  const progress = Math.round((p.total - p.remaining) / p.total * 100)

  return <article className={`process-card ${p.state} ${flashed ? 'cpu-flash' : ''}`}>
    <div className="card-top"><span className="pid">PID {p.pid}</span><span className="state-label"><i />{stateLabels[p.state]}</span></div>
    <h3><Terminal size={17} />{p.name}</h3>
    {p.state === 'running' && <div className="cpu-visual animated" aria-hidden="true"><Cpu size={40} /><div className="signal">{Array.from({ length: 16 }, (_, i) => <i key={i} style={{ height: `${12 + (i * 17 % 35)}px`, animationDelay: `${i * 0.08}s` }} />)}</div></div>}
    <div className="progress-label"><span>CPU ejecutada</span><strong>{progress}%</strong></div>
    <div className="progress" role="progressbar" aria-label={`CPU ejecutada PID ${p.pid}`} aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${progress}%` }} /></div>
    <div className="card-bottom"><span><Timer size={13} />{p.remaining} ticks restantes</span><span>{p.total} total</span></div>
    {p.state === 'running' && <div className="quantum"><span>Quantum utilizado</span><strong>{p.quantumUsed} / {quantum}</strong><div>{Array.from({ length: quantum }, (_, i) => <i className={i < p.quantumUsed ? 'used' : ''} key={i} />)}</div></div>}
    {p.state === 'new' && <div className="admit-row"><span><FilePlus2 size={14} /> Pendiente de admisión</span><button className="admit" onClick={onAdmit} aria-label={`Admitir PID ${p.pid}`}><LogIn size={13} />Admitir <kbd className="btn-kbd">A</kbd></button></div>}
    {p.state === 'blocked' && <div className="io-wait"><span><IOIcon size={14} /> Esperando {p.ioType ?? 'E/S'}</span><strong>Pendiente</strong><button className="complete-io" onClick={onComplete} aria-label={`Completar E/S de PID ${p.pid}`}>{slot < 9 && <kbd>{slot + 1}</kbd>}Completar E/S <ArrowRight size={13} /></button></div>}
    <div className="arrival">Llegada T{String(p.arrival).padStart(3, '0')}{p.finishedAt !== null && <span>Terminó T{String(p.finishedAt).padStart(3, '0')}</span>}</div>
  </article>
}

function App() {
  const [state, dispatch] = useReducer(simulationReducer, initialState)
  const [pressed, setPressed] = useState('')
  const [flashedPid, setFlashedPid] = useState<number | null>(null)
  
  useEffect(() => {
    let releaseTimer: number | undefined
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target
      if (event.defaultPrevented || (target instanceof HTMLElement && (target.isContentEditable || target.closest('input, textarea, select, [role="textbox"]')))) return
      // Espacio sobre un botón enfocado conserva su activación nativa y evita duplicar acciones.
      if (event.key === ' ' && target instanceof HTMLElement && target.closest('button, a, [role="button"]')) return
      const action = handleKeyboardCommand(event)
      if (!action) {
        if (event.repeat && event.key === ' ') event.preventDefault()
        return
      }
      event.preventDefault()
      dispatch(action)
      setPressed(event.key.toLowerCase())
      window.clearTimeout(releaseTimer)
      releaseTimer = window.setTimeout(() => setPressed(''), 220)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.clearTimeout(releaseTimer)
    }
  }, [])

  useEffect(() => {
    if (!state.tick) return
    const pid = state.timeline.at(-1)?.pid ?? null
    const frame = window.requestAnimationFrame(() => setFlashedPid(pid))
    const timer = window.setTimeout(() => setFlashedPid(null), 250)
    return () => { window.cancelAnimationFrame(frame); window.clearTimeout(timer) }
  }, [state.tick, state.timeline])

  const blockedProcesses = state.processes.filter(p => p.state === 'blocked')
  const hasRunning = state.processes.some(p => p.state === 'running')
  const pending = state.processes.find(p => p.state === 'new')
  const active = activeProcessCount(state)
  
  return <div className="app-shell">
    <header className="header"><div className="brand-icon"><Workflow size={23} /></div><div><h1>Process State Simulator</h1><p>Un vistazo al interior del sistema operativo</p></div><div className="session-status live" role="status"><i />Control manual</div><span className="local-label">LOCAL ENGINE <span>v1.0</span></span></header>
    <main>
      <div className="section-intro"><div><div className="eyebrow">PLANIFICACIÓN DE PROCESOS</div><h2>Cada proceso, en su momento.</h2><p>Observa cómo la CPU distribuye su tiempo mediante el control manual.</p></div><span className="algorithm"><span />Round Robin <span className="algorithm-detail">PREEMPTIVE</span></span></div>
      <section className="controls" aria-label="Controles de simulación">
        <button className="primary" onClick={() => dispatch({ type: 'step' })}><SkipForward size={16} />Avanzar CPU<kbd className="btn-kbd">ESPACIO</kbd></button>
        <button disabled={!pending} onClick={() => dispatch({ type: 'admit-next' })}><LogIn size={16} />Admitir {pending ? `PID ${pending.pid}` : ''}<kbd className="btn-kbd">A</kbd></button>
        <button disabled={!hasRunning} onClick={() => dispatch({ type: 'request-io' })}><HardDrive size={16} />Solicitar E/S<kbd className="btn-kbd">I</kbd></button>
        <button className="icon-button" title="Reiniciar simulación (R)" aria-label="Reiniciar simulación" onClick={() => dispatch({ type: 'reset', value: Date.now() >>> 0 })}><RotateCcw size={16} /></button>
        <span className="control-divider" />
        <button disabled={active >= MAX_PROCESSES} onClick={() => dispatch({ type: 'add' })}><Plus size={16} />Proceso <kbd className="btn-kbd">N</kbd><span className="key-hint">{active}/{MAX_PROCESSES}</span></button>
        <div className="settings"><label>Quantum <select value={state.quantum} onChange={e => dispatch({ type: 'quantum', value: Number(e.target.value) })}>{Array.from({ length: 8 }, (_, i) => <option key={i} value={i + 1}>{i + 1} ticks</option>)}</select></label></div>
      </section>
      <section className="keyboard-bar" aria-label="Flujo de procesos con atajos de teclado">
        <div className="keyboard-title"><Workflow size={15} /><span>Flujo de procesos:</span></div>
        <div className="workflow-steps">
          {workflowSteps.map((step, idx) => (
            <div key={step.key} className="workflow-step-wrapper">
              <span className={`workflow-step ${step.state} ${pressed === step.key || (step.key === '1-9' && /^[1-9]$/.test(pressed)) ? 'key-pressed' : ''}`}>
                <kbd>{step.label}</kbd>
                <span className="step-name">{step.name}</span>
                <span className="step-flow">{step.flow}</span>
              </span>
              {idx < workflowSteps.length - 1 && <ArrowRight size={12} className="workflow-arrow" />}
            </div>
          ))}
          <span className="workflow-divider" />
          <span className={`workflow-step reset ${pressed === 'r' ? 'key-pressed' : ''}`}>
            <kbd>R</kbd>
            <span className="step-name">Reiniciar</span>
          </span>
        </div>
      </section>
      <div className="context-notice" role="status" aria-live="polite"><Activity size={14} />{state.notice || 'Sigue el flujo de teclas (N → A → ESPACIO → I → 1–9) para controlar el ciclo de vida.'}</div>
      <div className="board-heading"><h2><Activity size={16} />Estados del proceso</h2><span><i />1 CPU · {state.quantum} ticks por turno</span></div>
      <section className="process-board" aria-label="Estados de procesos">{PROCESS_STATES.map((status, index) => {
        const processes = state.processes.filter(p => p.state === status)
        const { Icon, subtitle, footer, empty, emptyHint } = stateMeta[status]
        return <section className={`state-column ${status}`} key={status}><header><div className="column-icon"><Icon size={19} /></div><div><h2>{stateLabels[status]} <span>{processes.length}</span></h2><p>{subtitle}</p></div><span className="state-code">0{index + 1}</span></header><div className="process-list">{processes.map(p => <ProcessCard key={p.pid} process={p} quantum={state.quantum} slot={blockedProcesses.findIndex(blocked => blocked.pid === p.pid)} onComplete={() => dispatch({ type: 'complete-io', pid: p.pid })} onAdmit={() => dispatch({ type: 'admit', pid: p.pid })} flashed={flashedPid === p.pid} />)}{processes.length === 0 && <div className="empty-state"><Icon size={30} /><strong>{empty}</strong><span>{emptyHint}</span></div>}</div><footer><span>{workflowFooterShortcuts[status] && <kbd className="btn-kbd">{workflowFooterShortcuts[status]}</kbd>}{footer}</span><ArrowRight size={14} /></footer></section>
      })}</section>
      <section className="timeline-panel"><div className="panel-heading"><h2><Activity size={16} />Historial de CPU <span>GANTT</span></h2><span>Últimos 24 ticks</span></div><div className="timeline" aria-label="Historial de uso de CPU">{state.timeline.length ? state.timeline.map(slot => <div className={`time-slot ${slot.pid === null ? 'idle' : ''}`} key={slot.tick} title={`Tick ${slot.tick}: ${slot.pid === null ? 'CPU inactiva' : `PID ${slot.pid}`}`}><div style={slot.pid === null ? undefined : { borderTopColor: `hsl(${(slot.pid * 47) % 360} 55% 65%)` }}>{slot.pid ?? 'IDLE'}</div><span>{slot.tick}</span></div>) : <div className="timeline-empty"><Activity size={18} />Inicia la simulación o avanza un tick para ver la actividad de la CPU.</div>}</div><div className="timeline-caption"><span>Cada bloque representa 1 tick de CPU</span><span>TIEMPO <ArrowRight size={12} /></span></div></section>
      <section className="events-panel"><div className="panel-heading"><h2><Terminal size={16} />Registro de eventos</h2><span>Transiciones en tiempo real</span></div><div className="event-list">{state.events.map((event, i) => <div key={`${event.tick}-${i}`}><time>T{String(event.tick).padStart(3, '0')}</time><span className={`event-tag event-${event.kind.replaceAll('/', '').replaceAll(' ', '-')}`}>{event.kind}</span><span className={event.text.includes('terminó') ? 'muted' : ''}>{event.text}</span>{i === 0 && <small>ÚLTIMO</small>}</div>)}</div></section>
      <footer className="page-footer"><span><span className="green">●</span> Motor local · Sin conexión al servidor</span><span>NEW <ArrowRight size={11} /> READY <ArrowRight size={11} /> RUNNING <ArrowRight size={11} /> BLOCKED <ArrowRight size={11} /> TERMINATED</span></footer>
    </main>
  </div>
}
export default App
