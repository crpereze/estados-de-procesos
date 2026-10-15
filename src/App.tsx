import { useEffect, useReducer, useState } from 'react'
import { Keyboard, HardDrive, Globe, Printer, Activity, ArrowRight, CheckCheck, CirclePause, Cpu, Gauge, Layers, ListOrdered, Pause, Play, Plus, RotateCcw, SkipForward, Terminal, Timer, Workflow } from 'lucide-react'
import { MAX_PROCESSES, resetSimulation, simulationReducer } from './simulation'
import type { Process, ProcessState } from './simulation'
import { handleKeyboardCommand } from './keyboard'
import './App.css'

const initialState = resetSimulation(Date.now() >>> 0)
const labels = { ready: 'Lista', running: 'Corriendo', blocked: 'Bloqueado' }
function ProcessCard({ process: p, quantum, active, manual, slot, onComplete, flashed }: { process: Process; quantum: number; active: boolean; manual: boolean; slot: number; onComplete: () => void; flashed: boolean }) {
  const IOIcon = { Teclado: Keyboard, Disco: HardDrive, Red: Globe, Impresora: Printer }[p.ioType ?? 'Disco']
  const progress = Math.round((p.total - p.remaining) / p.total * 100)
  return <article className={`process-card ${p.state} ${flashed ? 'cpu-flash' : ''}`}>
    <div className="card-top"><span className="pid">PID {p.pid}</span><span className="state-label"><i />{labels[p.state]}</span></div>
    <h3><Terminal size={17} />{p.name}</h3>
    {p.state === 'running' && <div className={`cpu-visual ${active ? 'animated' : ''}`} aria-hidden="true"><Cpu size={40} /><div className="signal">{Array.from({ length: 16 }, (_, i) => <i key={i} style={{ height: `${12 + (i * 17 % 35)}px`, animationDelay: `${i * 0.08}s` }} />)}</div></div>}
    <div className="progress-label"><span>CPU ejecutada</span><strong>{progress}%</strong></div>
    <div className="progress" role="progressbar" aria-label={`CPU ejecutada PID ${p.pid}`} aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${progress}%` }} /></div>
    <div className="card-bottom"><span><Timer size={13} />{p.remaining} ticks restantes</span><span>{p.total} total</span></div>
    {p.state === 'running' && <div className="quantum"><span>Quantum utilizado</span><strong>{p.quantumUsed} / {quantum}</strong><div>{Array.from({ length: quantum }, (_, i) => <i className={i < p.quantumUsed ? 'used' : ''} key={i} />)}</div></div>}
    {p.state === 'blocked' && <div className="io-wait"><span><IOIcon size={14} /> Esperando {p.ioType ?? 'E/S'}</span><strong>{manual ? 'Pendiente' : `${p.ioRemaining} ticks`}</strong>{manual ? <button className="complete-io" onClick={onComplete} aria-label={`Completar E/S de PID ${p.pid}`}>{slot < 9 && <kbd>{slot + 1}</kbd>}Completar E/S <ArrowRight size={13} /></button> : <div className="progress"><span style={{ width: `${p.ioRemaining / p.ioDuration * 100}%` }} /></div>}</div>}
    <div className="arrival">Llegada T{String(p.arrival).padStart(3, '0')}{!manual && p.ioAt !== null && <span>E/S programada</span>}</div>
  </article>
}
function App() {
  const [state, dispatch] = useReducer(simulationReducer, initialState)
  const manual = state.mode === 'manual'
  const [pressed, setPressed] = useState('')
  const [flashedPid, setFlashedPid] = useState<number | null>(null)
  useEffect(() => {
    if (!state.active || manual) return
    const timer = window.setInterval(() => dispatch({ type: 'clock' }), 1000 / state.speed)
    return () => window.clearInterval(timer)
  }, [state.active, state.speed, manual])
  useEffect(() => {
    if (!manual) return
    let releaseTimer: number | undefined
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target
      if (event.defaultPrevented || (target instanceof HTMLElement && (target.isContentEditable || target.closest('input, textarea, select, [role="textbox"]')))) return
      // Space on a focused button keeps its native activation, avoiding double actions.
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
  }, [manual])
  useEffect(() => {
    if (!manual || !state.tick) return
    const pid = state.timeline.at(-1)?.pid ?? null
    const frame = window.requestAnimationFrame(() => setFlashedPid(pid))
    const timer = window.setTimeout(() => setFlashedPid(null), 250)
    return () => { window.cancelAnimationFrame(frame); window.clearTimeout(timer) }
  }, [manual, state.tick, state.timeline])
  const blockedProcesses = state.processes.filter(p => p.state === 'blocked')
  const hasRunning = state.processes.some(p => p.state === 'running')
  const ready = state.processes.filter(p => p.state === 'ready').length
  const blocked = state.processes.filter(p => p.state === 'blocked').length
  const usage = state.tick ? Math.round(state.busyTicks / state.tick * 100) : 0
  const metrics = [
    { label: 'Procesos activos', value: state.processes.length.toString().padStart(2, '0'), Icon: Layers, color: '' },
    { label: 'En lista', value: ready.toString().padStart(2, '0'), Icon: ListOrdered, color: 'blue' },
    { label: 'Bloqueados', value: blocked.toString().padStart(2, '0'), Icon: CirclePause, color: 'amber' },
    { label: 'Finalizados', value: state.completed.toString().padStart(2, '0'), Icon: CheckCheck, color: '' },
    { label: 'Uso acumulado CPU', value: `${usage}%`, Icon: Gauge, color: 'green' },
    { label: 'Tick actual', value: state.tick.toString().padStart(3, '0'), Icon: Timer, color: '' },
  ]
  return <div className="app-shell">
    <header className="header"><div className="brand-icon"><Workflow size={23} /></div><div><h1>Process State Simulator</h1><p>Un vistazo al interior del sistema operativo</p></div><div className={`session-status ${state.active ? 'live' : ''}`} role="status"><i />{manual ? 'Laboratorio manual' : state.active ? 'Simulación activa' : 'Simulación pausada'}</div><span className="local-label">LOCAL ENGINE <span>v1.0</span></span></header>
    <main>
      <div className="section-intro"><div><div className="eyebrow">PLANIFICACIÓN DE PROCESOS</div><h2>Cada proceso, en su momento.</h2><p>Observa cómo la CPU distribuye su tiempo.</p></div><span className="algorithm"><span />Round Robin <span className="algorithm-detail">PREEMPTIVE</span></span></div>
      <div className="mode-selector" role="group" aria-label="Modo de simulación"><button aria-pressed={!manual} onClick={() => dispatch({ type: 'mode', value: 'automatic' })}><Timer size={15} />Modo automático</button><button aria-pressed={manual} onClick={() => dispatch({ type: 'mode', value: 'manual' })}><Keyboard size={15} />Modo manual</button><span>{manual ? 'Tú controlas la CPU y las operaciones de E/S' : 'Ejecución con reloj y E/S temporizada'}</span></div>
      <section className="controls" aria-label="Controles de simulación">
        {!manual && <button className="primary" onClick={() => dispatch({ type: 'toggle' })}>{state.active ? <Pause size={16} /> : <Play size={16} />}{state.active ? 'Pausar' : 'Iniciar'}</button>}
        <button className={manual ? 'primary' : ''} onClick={() => dispatch({ type: 'step' })}><SkipForward size={16} />{manual ? 'Avanzar CPU' : 'Siguiente tick'}</button>
        {manual && <button disabled={!hasRunning} onClick={() => dispatch({ type: 'request-io' })}><HardDrive size={16} />Solicitar E/S</button>}
        <button className="icon-button" title="Reiniciar simulación" aria-label="Reiniciar simulación" onClick={() => dispatch({ type: 'reset', value: Date.now() >>> 0 })}><RotateCcw size={16} /></button>
        <span className="control-divider" />
        <button disabled={state.processes.length >= MAX_PROCESSES} onClick={() => dispatch({ type: 'add' })}><Plus size={16} />Proceso <span className="key-hint">{state.processes.length}/{MAX_PROCESSES}</span></button>
        <div className="settings"><label>Quantum <select value={state.quantum} onChange={e => dispatch({ type: 'quantum', value: Number(e.target.value) })}>{Array.from({ length: 8 }, (_, i) => <option key={i} value={i + 1}>{i + 1} ticks</option>)}</select></label><label>Velocidad <select disabled={manual} value={state.speed} onChange={e => dispatch({ type: 'speed', value: Number(e.target.value) })}>{[0.5, 1, 2, 4].map(speed => <option key={speed} value={speed}>{speed}x</option>)}</select></label><button disabled={manual} className="auto-control" role="switch" aria-checked={state.automatic} onClick={() => dispatch({ type: 'automatic' })}><span className={`switch ${state.automatic ? 'on' : ''}`} />Autogeneración</button></div>
      </section>
      {manual && <section className="keyboard-bar" aria-label="Atajos de teclado"><Keyboard size={17} />{[[' ', 'ESPACIO', 'Ejecutar'], ['i', 'I', 'Solicitar E/S'], ['1-9', '1–9', 'Completar E/S'], ['n', 'N', 'Nuevo proceso'], ['r', 'R', 'Reiniciar']].map(([key, label, text]) => <span key={key} className={pressed === key || (key === '1-9' && /^[1-9]$/.test(pressed)) ? 'key-pressed' : ''}><kbd>{label}</kbd>{text}</span>)}</section>}
      {manual && <div className="context-notice" role="status" aria-live="polite"><Activity size={14} />{state.notice || 'Pulsa Espacio para ejecutar un tick de CPU.'}</div>}
      <section className="metrics" aria-label="Métricas">{metrics.map(({ label, value, Icon, color }) => <div className="metric" key={label}><div><span>{label}</span><Icon size={15} className={color} /></div><strong className={color}>{value}</strong>{label === 'Uso acumulado CPU' && <div className="mini-meter"><span style={{ width: `${usage}%` }} /></div>}</div>)}</section>
      <div className="board-heading"><h2><Activity size={16} />Estados del proceso</h2><span><i />1 CPU · {state.quantum} ticks por turno</span></div>
      <section className="process-board" aria-label="Estados de procesos">{(['ready', 'running', 'blocked'] as ProcessState[]).map((status, index) => {
        const processes = state.processes.filter(p => p.state === status)
        const Icon = status === 'ready' ? ListOrdered : status === 'running' ? Cpu : CirclePause
        return <section className={`state-column ${status}`} key={status}><header><div className="column-icon"><Icon size={19} /></div><div><h2>{labels[status]} <span>{processes.length}</span></h2><p>{['En espera de CPU', 'Ejecutando en CPU', 'Esperando entrada / salida'][index]}</p></div><span className="state-code">0{index + 1}</span></header><div className="process-list">{processes.map(p => <ProcessCard key={p.pid} process={p} quantum={state.quantum} active={state.active} manual={manual} slot={blockedProcesses.findIndex(blocked => blocked.pid === p.pid)} onComplete={() => dispatch({ type: 'complete-io', pid: p.pid })} flashed={manual && flashedPid === p.pid} />)}{processes.length === 0 && <div className="empty-state"><Icon size={30} /><strong>{status === 'running' ? 'CPU IDLE' : status === 'ready' ? 'Cola vacía' : 'Sin operaciones de E/S'}</strong><span>{status === 'running' ? 'El próximo proceso ocupará este lugar' : status === 'ready' ? 'Los nuevos procesos aparecerán aquí' : 'Los procesos bloqueados aparecerán aquí'}</span></div>}</div><footer>{['Despacho a CPU', 'Quantum agotado → Lista', 'E/S completada → Lista'][index]}<ArrowRight size={14} /></footer></section>
      })}</section>
      <section className="timeline-panel"><div className="panel-heading"><h2><Activity size={16} />Historial de CPU <span>GANTT</span></h2><span>Últimos 24 ticks</span></div><div className="timeline" aria-label="Historial de uso de CPU">{state.timeline.length ? state.timeline.map(slot => <div className={`time-slot ${slot.pid === null ? 'idle' : ''}`} key={slot.tick} title={`Tick ${slot.tick}: ${slot.pid === null ? 'CPU inactiva' : `PID ${slot.pid}`}`}><div style={slot.pid === null ? undefined : { borderTopColor: `hsl(${(slot.pid * 47) % 360} 55% 65%)` }}>{slot.pid ?? 'IDLE'}</div><span>{slot.tick}</span></div>) : <div className="timeline-empty"><Activity size={18} />Inicia la simulación o avanza un tick para ver la actividad de la CPU.</div>}</div><div className="timeline-caption"><span>Cada bloque representa 1 tick de CPU</span><span>TIEMPO <ArrowRight size={12} /></span></div></section>
      <section className="events-panel"><div className="panel-heading"><h2><Terminal size={16} />Registro de eventos</h2><span>Transiciones en tiempo real</span></div><div className="event-list">{state.events.map((event, i) => <div key={`${event.tick}-${i}`}><time>T{String(event.tick).padStart(3, '0')}</time><span className={`event-tag event-${event.kind.replaceAll('/', '').replaceAll(' ', '-')}`}>{event.kind}</span><span className={event.text.includes('Finalizado') ? 'muted' : ''}>{event.text}</span>{i === 0 && <small>ÚLTIMO</small>}</div>)}</div></section>
      <footer className="page-footer"><span><span className="green">●</span> Motor local · Sin conexión al servidor</span><span>READY <ArrowRight size={11} /> RUNNING <ArrowRight size={11} /> BLOCKED</span></footer>
    </main>
  </div>
}
export default App
