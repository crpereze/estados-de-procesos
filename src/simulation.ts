export type SimulationMode = 'manual'
export type IOType = 'Teclado' | 'Disco' | 'Red' | 'Impresora'
export type EventKind = 'NUEVO' | 'READY' | 'CPU' | 'TICK' | 'E/S' | 'E/S COMPLETA' | 'FIN' | 'IDLE'
export type ProcessState = 'new' | 'ready' | 'running' | 'blocked' | 'terminated'

/** Orden canónico de los cinco estados del modelo de procesos. */
export const PROCESS_STATES: ProcessState[] = ['new', 'ready', 'running', 'blocked', 'terminated']

/** Etiquetas en español centralizadas para toda la interfaz. */
export const stateLabels: Record<ProcessState, string> = {
  new: 'Nuevo',
  ready: 'Listo',
  running: 'Corriendo',
  blocked: 'Bloqueado',
  terminated: 'Terminado',
}

export interface Process {
  pid: number; name: string; state: ProcessState; total: number; remaining: number
  ioType?: IOType; arrival: number; startedAt: number | null; finishedAt: number | null
  quantumUsed: number; ioAt: number | null; ioDuration: number; ioRemaining: number
}

export interface Simulation {
  processes: Process[]; tick: number; completed: number; busyTicks: number; nextPid: number
  mode?: SimulationMode; notice: string; seed: number; quantum: number; active?: boolean; automatic?: boolean; speed?: number
  timeline: { tick: number; pid: number | null }[]
  events: { tick: number; text: string; kind: EventKind }[]
}

export const MAX_PROCESSES = 15
const names = ['chrome.exe', 'systemd', 'node', 'python', 'worker', 'terminal', 'code', 'postgres', 'docker']

/**
 * Transiciones permitidas del modelo de cinco estados.
 * Cualquier transición ausente de este mapa se rechaza; en particular un proceso
 * Terminado nunca puede volver a Listo, Bloqueado o Corriendo.
 */
const TRANSITIONS: Record<ProcessState, ProcessState[]> = {
  new: ['ready'],
  ready: ['running'],
  running: ['ready', 'blocked', 'terminated'],
  blocked: ['ready'],
  terminated: [],
}

/** Comprueba si una transición entre estados es válida según el modelo. */
export function canTransition(from: ProcessState, to: ProcessState) {
  return TRANSITIONS[from].includes(to)
}

/** Cuenta los procesos no terminados, que son los que consume el límite de activos. */
export function activeProcessCount(state: Simulation) {
  return state.processes.filter(p => p.state !== 'terminated').length
}

/**
 * Avanza la semilla del generador seudorrandómico.
 * Mantiene las actualizaciones del reducer deterministas y reproducibles.
 */
function random(state: Simulation) {
  state.seed = (Math.imul(state.seed, 1664525) + 1013904223) >>> 0
  return state.seed / 4294967296 // 2 elevado a 32
}

/** Registra un evento reciente en el historial de la simulación. */
function event(state: Simulation, text: string, kind: EventKind = 'READY') {
  state.events = [{ tick: state.tick, text, kind }, ...state.events].slice(0, 10)
}

/**
 * Añade un proceso aleatorio en estado Nuevo.
 * El proceso no puede ejecutarse hasta ser admitido en la cola de Listos.
 * Respeta el límite de procesos activos (no terminados) y registra la creación.
 */
export function createRandomProcess(state: Simulation) {
  if (activeProcessCount(state) >= MAX_PROCESSES) return
  const total = 4 + Math.floor(random(state) * 15)
  const process: Process = {
    pid: state.nextPid++, name: names[Math.floor(random(state) * names.length)],
    state: 'new', total, remaining: total, arrival: state.tick, startedAt: null, finishedAt: null,
    quantumUsed: 0, ioAt: random(state) < 0.55 ? 1 + Math.floor(random(state) * (total - 1)) : null,
    ioDuration: 2 + Math.floor(random(state) * 4), ioRemaining: 0,
  }
  state.processes.push(process)
  event(state, `PID ${process.pid} → ${stateLabels.new} · nuevo proceso`, 'NUEVO')
}

/** Crea una sesión interactiva con 5–8 procesos Nuevos. */
export function resetSimulation(seed: number): Simulation {
  const state: Simulation = {
    processes: [], tick: 0, completed: 0, busyTicks: 0,
    nextPid: 101, mode: 'manual', notice: 'Admite un proceso Nuevo y pulsa Espacio para ejecutar.',
    seed, quantum: 3, active: false, automatic: false, speed: 1, timeline: [], events: []
  }
  const count = 5 + Math.floor(random(state) * 4)
  for (let i = 0; i < count; i++) createRandomProcess(state)
  return state
}

/**
 * Aplica una transición validada entre estados.
 * Al entrar en Listo o Bloqueado el proceso se coloca al final de la cola FIFO y
 * se reinicia su quantum consumido. Las transiciones inválidas no tienen efecto.
 */
function transitionProcess(state: Simulation, process: Process, target: ProcessState, reason: string, kind: EventKind) {
  if (!canTransition(process.state, target)) return false
  process.state = target
  if (target === 'ready' || target === 'blocked') {
    process.quantumUsed = 0
    state.processes = [...state.processes.filter(p => p.pid !== process.pid), process]
  }
  event(state, `PID ${process.pid} → ${stateLabels[target]} · ${reason}`, kind)
  return true
}

/**
 * Admite un proceso Nuevo en la cola de Listos (planificador a largo plazo).
 * Es idempotente: si el PID no existe o el proceso ya no está Nuevo, no hace nada
 * y devuelve el mismo estado para que los controles no corrompan la simulación.
 */
export function admitProcess(state: Simulation, pid: number): Simulation {
  const source = state.processes.find(p => p.pid === pid)
  if (!source || source.state !== 'new') return state
  const next: Simulation = { ...state, processes: state.processes.map(p => ({ ...p })) }
  const process = next.processes.find(p => p.pid === pid)!
  transitionProcess(next, process, 'ready', 'admitido a la cola de Listos', 'READY')
  next.notice = `PID ${pid} admitido: ahora está en ${stateLabels.ready}.`
  return next
}

/**
 * Mueve el primer proceso de Listos a Corriendo cuando la CPU está libre.
 * Solo los procesos Listos pueden recibir la CPU y el despacho no consume ticks:
 * el tick se consume en `advanceSimulation()`.
 */
export function scheduleNextProcess(state: Simulation) {
  if (state.processes.some(p => p.state === 'running')) return
  const next = state.processes.find(p => p.state === 'ready')
  if (next) {
    next.state = 'running'
    next.quantumUsed = 0
    event(state, `PID ${next.pid} → ${stateLabels.running}`, 'CPU')
  }
}

/**
 * Devuelve el estado después de un tick exacto de CPU.
 * Despacha si la CPU está libre y avanza el proceso Corriendo un tick.
 * Si finaliza pasa a Terminado; si agota el quantum vuelve al final de Listos.
 * Si no hay proceso Corriendo, la CPU queda en IDLE.
 */
export function advanceSimulation(previous: Simulation): Simulation {
  const state: Simulation = { ...previous, processes: previous.processes.map(p => ({ ...p })) }
  scheduleNextProcess(state)
  const running = state.processes.find(p => p.state === 'running')
  state.tick++

  if (running) {
    state.busyTicks++
    if (running.startedAt === null) running.startedAt = state.tick
    running.remaining--
    running.quantumUsed++
    event(state, `PID ${running.pid} ejecutó una unidad de CPU.`, 'TICK')
    state.notice = `PID ${running.pid} ejecutó un tick de CPU.`
    if (running.remaining === 0) {
      transitionProcess(state, running, 'terminated', 'finalizó su trabajo', 'FIN')
      running.finishedAt = state.tick
      state.completed++
      state.notice = `PID ${running.pid} terminó: registrado como ${stateLabels.terminated}.`
    } else if (running.quantumUsed >= state.quantum) {
      transitionProcess(state, running, 'ready', 'quantum agotado', 'READY')
      state.notice = 'Quantum agotado: proceso al final de Listos.'
    }
  }

  if (!running) {
    event(state, 'CPU sin procesos ejecutables.', 'IDLE')
    state.notice = 'CPU IDLE: completa una E/S o admite un proceso.'
  }
  scheduleNextProcess(state)
  state.timeline = [...state.timeline, { tick: state.tick, pid: running?.pid ?? null }].slice(-24)
  return state
}

/**
 * Solicita E/S manual para el proceso Corriendo.
 * Mueve el proceso Corriendo a Bloqueado, asigna un dispositivo de E/S y libera la CPU.
 */
export function requestProcessIO(state: Simulation): Simulation {
  if (!state.processes.some(p => p.state === 'running')) return state
  const next = { ...state, processes: state.processes.map(p => ({ ...p })) }
  const process = next.processes.find(p => p.state === 'running')!
  const types: IOType[] = ['Teclado', 'Disco', 'Red', 'Impresora']
  process.ioType = types[Math.floor(random(next) * types.length)]
  process.ioAt = null
  process.ioRemaining = process.ioDuration
  transitionProcess(next, process, 'blocked', `esperando ${process.ioType.toLowerCase()}`, 'E/S')
  next.notice = 'CPU liberada: proceso esperando E/S.'
  return next
}

/**
 * Completa la E/S de un PID Bloqueado.
 * Mueve el proceso Bloqueado al final de Listos y reinicia su quantum usado.
 */
export function completeProcessIO(state: Simulation, pid: number): Simulation {
  const source = state.processes.find(p => p.pid === pid)
  if (!source || source.state !== 'blocked') return state
  const next = { ...state, processes: state.processes.map(p => ({ ...p })) }
  const process = next.processes.find(p => p.pid === pid)!
  process.ioRemaining = 0
  transitionProcess(next, process, 'ready', 'E/S completada', 'E/S COMPLETA')
  next.notice = 'Operación completada: proceso listo para ejecutarse.'
  return next
}

export interface TimingMetrics { avgTurnaround: number; avgResponse: number; avgWait: number; finished: number }

/**
 * Calcula tiempos promedio sobre los procesos Terminados con datos completos.
 */
export function timingMetrics(state: Simulation): TimingMetrics {
  const finished = state.processes.filter(p => p.state === 'terminated' && p.startedAt !== null && p.finishedAt !== null)
  if (!finished.length) return { avgTurnaround: 0, avgResponse: 0, avgWait: 0, finished: 0 }
  const round = (value: number) => Math.round(value * 10) / 10
  const turnaround = finished.reduce((sum, p) => sum + (p.finishedAt! - p.arrival), 0) / finished.length
  const response = finished.reduce((sum, p) => sum + (p.startedAt! - p.arrival), 0) / finished.length
  const wait = finished.reduce((sum, p) => sum + (p.finishedAt! - p.arrival) - p.total, 0) / finished.length
  return { avgTurnaround: round(turnaround), avgResponse: round(response), avgWait: round(wait), finished: finished.length }
}

export type Action = { type: 'step' | 'add' | 'request-io' | 'admit-next' }
  | { type: 'admit'; pid: number }
  | { type: 'complete-io'; pid: number }
  | { type: 'complete-slot'; slot: number }
  | { type: 'quantum' | 'reset'; value: number }
  | { type: 'clock' | 'toggle' | 'automatic' }
  | { type: 'mode'; value?: string }
  | { type: 'speed'; value?: number }

/**
 * Punto único para controles manuales y atajos.
 */
export function simulationReducer(state: Simulation, action: Action): Simulation {
  switch (action.type) {
    case 'request-io': return requestProcessIO(state)
    case 'complete-io': return completeProcessIO(state, action.pid)
    case 'admit': return admitProcess(state, action.pid)
    case 'admit-next': {
      const pending = state.processes.find(p => p.state === 'new')
      return pending ? admitProcess(state, pending.pid) : state
    }
    case 'complete-slot': {
      const process = state.processes.filter(p => p.state === 'blocked')[action.slot]
      return process ? completeProcessIO(state, process.pid) : state
    }
    case 'step': return advanceSimulation(state)
    case 'quantum': return { ...state, quantum: Math.max(1, Math.min(8, action.value)) }
    case 'reset': return resetSimulation(action.value)
    case 'add': {
      const next = { ...state, processes: [...state.processes] }
      createRandomProcess(next)
      return next
    }
    case 'clock':
    case 'toggle':
    case 'automatic':
    case 'speed':
    case 'mode':
    default:
      return state
  }
}
