export type SimulationMode = 'automatic' | 'manual'
export type IOType = 'Teclado' | 'Disco' | 'Red' | 'Impresora'
export type EventKind = 'READY' | 'CPU' | 'TICK' | 'E/S' | 'E/S COMPLETA' | 'FIN' | 'IDLE'
export type ProcessState = 'ready' | 'running' | 'blocked'
export interface Process {
  pid: number; name: string; state: ProcessState; total: number; remaining: number
  ioType?: IOType; arrival: number; quantumUsed: number; ioAt: number | null; ioDuration: number; ioRemaining: number
}
export interface Simulation {
  processes: Process[]; tick: number; completed: number; busyTicks: number; nextPid: number
  mode: SimulationMode; notice: string; seed: number; quantum: number; active: boolean; automatic: boolean; speed: number
  timeline: { tick: number; pid: number | null }[]
  events: { tick: number; text: string; kind: EventKind }[]
}
export const MAX_PROCESSES = 15
const names = ['chrome.exe', 'systemd', 'node', 'python', 'worker', 'terminal', 'code', 'postgres']
/** Advances the stored PRNG seed, keeping reducer updates deterministic and replayable. */
function random(state: Simulation) {
  state.seed = (Math.imul(state.seed, 1664525) + 1013904223) >>> 0
  return state.seed / 4294967296
}
function event(state: Simulation, text: string, kind: EventKind = 'READY') {
  state.events = [{ tick: state.tick, text, kind }, ...state.events].slice(0, 10)
}
/** Adds one randomly generated Ready process to an owned draft, respecting the active cap. */
export function createRandomProcess(state: Simulation) {
  if (state.processes.length >= MAX_PROCESSES) return
  const total = 4 + Math.floor(random(state) * 15)
  const process: Process = {
    pid: state.nextPid++, name: names[Math.floor(random(state) * names.length)],
    state: 'ready', total, remaining: total, arrival: state.tick, quantumUsed: 0,
    ioAt: random(state) < 0.55 ? 1 + Math.floor(random(state) * (total - 1)) : null,
    ioDuration: 2 + Math.floor(random(state) * 4), ioRemaining: 0,
  }
  state.processes.push(process)
  event(state, `PID ${process.pid} → Lista · nuevo proceso`)
}
/** Creates a fresh paused session with 5–8 processes and empty metrics/history. */
export function resetSimulation(seed: number): Simulation {
  const state: Simulation = { processes: [], tick: 0, completed: 0, busyTicks: 0,
    nextPid: 101, mode: 'automatic', notice: '', seed, quantum: 3, active: false, automatic: false, speed: 1, timeline: [], events: [] }
  const count = 5 + Math.floor(random(state) * 4)
  for (let i = 0; i < count; i++) createRandomProcess(state)
  return state
}
/** Moves a process to the queue tail. Array order is the Ready FIFO order. */
function transitionProcess(state: Simulation, process: Process, target: ProcessState, reason: string) {
  process.state = target
  process.quantumUsed = 0
  state.processes = [...state.processes.filter(p => p.pid !== process.pid), process]
  event(state, `PID ${process.pid} → ${target === 'ready' ? 'Lista' : 'Bloqueado'} · ${reason}`, target === 'blocked' ? 'E/S' : reason === 'E/S completada' ? 'E/S COMPLETA' : 'READY')
}
/** Dispatches the first Ready process only if CPU is free; does not consume CPU time. */
export function scheduleNextProcess(state: Simulation) {
  if (state.processes.some(p => p.state === 'running')) return
  const next = state.processes.find(p => p.state === 'ready')
  if (next) {
    next.state = 'running'
    next.quantumUsed = 0
    event(state, `PID ${next.pid} → Corriendo`, 'CPU')
  }
}
/**
 * Returns a new state after exactly one interval. CPU and already-blocked I/O advance
 * concurrently. Completion wins over I/O, which wins over quantum expiry. New I/O
 * begins on the next tick; arrivals/released processes join the FIFO tail. Gantt
 * Manual mode freezes I/O and arrivals, ignores scheduled I/O and dispatches only
 * at the start of the next CPU step. Both modes share the same scheduler. Gantt
 * records the process that actually consumed this interval, including IDLE.
 */
export function advanceSimulation(previous: Simulation): Simulation {
  const state: Simulation = { ...previous, processes: previous.processes.map(p => ({ ...p })) }
  scheduleNextProcess(state)
  const running = state.processes.find(p => p.state === 'running')
  const manual = state.mode === 'manual'
  const blocked = manual ? [] : state.processes.filter(p => p.state === 'blocked')
  state.tick++
  for (const process of blocked) {
    process.ioRemaining--
    if (process.ioRemaining === 0) transitionProcess(state, process, 'ready', 'E/S completada')
  }
  if (running) {
    state.busyTicks++
    running.remaining--
    running.quantumUsed++
    event(state, `PID ${running.pid} ejecutó una unidad de CPU.`, 'TICK')
    state.notice = `PID ${running.pid} ejecutó un tick de CPU.`
    if (running.remaining === 0) {
      state.processes = state.processes.filter(p => p.pid !== running.pid)
      state.completed++
      event(state, `PID ${running.pid} → Finalizado`, 'FIN')
      state.notice = `PID ${running.pid} finalizado: CPU liberada.`
    } else if (!manual && running.ioAt !== null && running.ioAt <= running.total - running.remaining) {
      running.ioRemaining = running.ioDuration
      running.ioAt = null
      transitionProcess(state, running, 'blocked', `E/S · ${running.ioDuration} ticks`)
    } else if (running.quantumUsed >= state.quantum) {
      transitionProcess(state, running, 'ready', 'quantum agotado')
      state.notice = 'Quantum agotado: proceso al final de Lista.'
    }
  }
  if (!running) {
    event(state, 'CPU sin procesos ejecutables.', 'IDLE')
    state.notice = 'CPU IDLE: completa una E/S o crea un proceso.'
  }
  state.timeline = [...state.timeline, { tick: state.tick, pid: running?.pid ?? null }].slice(-24)
  if (!manual && state.automatic && state.tick % 3 === 0 && random(state) < 0.6) createRandomProcess(state)
  if (!manual) scheduleNextProcess(state)
  return state
}
/** Changes mode without resetting queues or work; both directions pause the clock. */
export function setSimulationMode(state: Simulation, mode: SimulationMode): Simulation {
  return { ...state, mode, active: false, notice: mode === 'manual' ? 'Control manual: pulsa Espacio para ejecutar.' : 'Modo automático listo: pulsa Iniciar.' }
}
/** Requests user-controlled I/O on the running process, releasing CPU without dispatch. */
export function requestProcessIO(state: Simulation): Simulation {
  if (state.mode !== 'manual' || !state.processes.some(p => p.state === 'running')) return state
  const next = { ...state, processes: state.processes.map(p => ({ ...p })) }
  const process = next.processes.find(p => p.state === 'running')!
  const types: IOType[] = ['Teclado', 'Disco', 'Red', 'Impresora']
  process.ioType = types[Math.floor(random(next) * types.length)]
  process.ioRemaining = process.ioDuration
  transitionProcess(next, process, 'blocked', `esperando ${process.ioType.toLowerCase()}`)
  next.notice = 'CPU liberada: proceso esperando E/S.'
  return next
}
/** Completes only a currently blocked PID, returning it to FIFO Ready, never Running. */
export function completeProcessIO(state: Simulation, pid: number): Simulation {
  if (state.mode !== 'manual' || !state.processes.some(p => p.pid === pid && p.state === 'blocked')) return state
  const next = { ...state, processes: state.processes.map(p => ({ ...p })) }
  const process = next.processes.find(p => p.pid === pid)!
  process.ioRemaining = 0
  transitionProcess(next, process, 'ready', 'E/S completada')
  next.notice = 'Operación completada: proceso listo para ejecutarse.'
  return next
}
export type Action = { type: 'clock' | 'step' | 'toggle' | 'add' | 'automatic' | 'request-io' }
  | { type: 'mode'; value: SimulationMode }
  | { type: 'complete-io'; pid: number }
  | { type: 'complete-slot'; slot: number }
  | { type: 'speed' | 'quantum' | 'reset'; value: number }
/** Single entry point for controls and timer; paused clock events are ignored. */
export function simulationReducer(state: Simulation, action: Action): Simulation {
  switch (action.type) {
    case 'mode': return setSimulationMode(state, action.value)
    case 'request-io': return requestProcessIO(state)
    case 'complete-io': return completeProcessIO(state, action.pid)
    case 'complete-slot': {
      const process = state.processes.filter(p => p.state === 'blocked')[action.slot]
      return process ? completeProcessIO(state, process.pid) : state
    }
    case 'clock': return state.mode === 'automatic' && state.active ? advanceSimulation(state) : state
    case 'step': return { ...advanceSimulation(state), active: false }
    case 'toggle': return state.mode === 'manual' ? state : { ...state, active: !state.active }
    case 'automatic': return { ...state, automatic: !state.automatic }
    case 'speed': return { ...state, speed: action.value }
    case 'quantum': return { ...state, quantum: Math.max(1, Math.min(8, action.value)) }
    case 'reset': return { ...resetSimulation(action.value), mode: state.mode }
    case 'add': {
      const next = { ...state, processes: [...state.processes] }
      createRandomProcess(next)
      return next
    }
  }
}
