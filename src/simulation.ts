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
const names = ['chrome.exe', 'systemd', 'node', 'python', 'worker', 'terminal', 'code', 'postgres', 'docker']

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
 * Añade un proceso aleatorio directamente al estado Lista.
 * Respeta el límite de procesos activos y registra la llegada en el historial.
 */
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

/** Crea una sesión pausada con 5–8 procesos iniciales y métricas vacías. */
export function resetSimulation(seed: number): Simulation {
  const state: Simulation = {
    processes: [], tick: 0, completed: 0, busyTicks: 0,
    nextPid: 101, mode: 'automatic', notice: '', seed, quantum: 3, active: false, automatic: false, speed: 1, timeline: [], events: []
  }
  const count = 5 + Math.floor(random(state) * 4)
  for (let i = 0; i < count; i++) createRandomProcess(state)
  return state
}

/**
 * Mueve un proceso al final de la cola FIFO de Lista y reinicia su quantum usado.
 * Se usa al agotar el quantum o al completar una E/S; nunca lo pasa directamente
 * a Ejecutando. Si el destino es Bloqueado, la CPU queda libre para otro despacho.
 */
function transitionProcess(state: Simulation, process: Process, target: ProcessState, reason: string) {
  process.state = target
  process.quantumUsed = 0
  state.processes = [...state.processes.filter(p => p.pid !== process.pid), process]
  event(state, `PID ${process.pid} → ${target === 'ready' ? 'Lista' : 'Bloqueado'} · ${reason}`, target === 'blocked' ? 'E/S' : reason === 'E/S completada' ? 'E/S COMPLETA' : 'READY')
}

/**
 * Mueve el primer proceso de Lista a Ejecutando cuando la CPU está libre.
 * El despacho no consume CPU: el tick se consume en `advanceSimulation()`.
 */
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
 * Devuelve el estado después de un tick exacto.
 * En automático, la CPU y las E/S bloqueadas avanzan en paralelo. La prioridad
 * es finalizar, después bloquear por E/S y por último devolver por quantum.
 * Una E/S nueva comienza a descontarse en el siguiente tick; los procesos que
 * regresan se añaden al final de Lista. En manual se congelan E/S y llegadas,
 * pero se conserva este mismo planificador. El Gantt registra el PID ejecutado
 * o `IDLE` si no hubo proceso Ejecutando.
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

/**
 * Cambia entre modo automático y manual sin reiniciar procesos, colas ni métricas.
 * El cambio pausa el reloj para que el usuario pueda continuar desde el mismo punto.
 */
export function setSimulationMode(state: Simulation, mode: SimulationMode): Simulation {
  return { ...state, mode, active: false, notice: mode === 'manual' ? 'Control manual: pulsa Espacio para ejecutar.' : 'Modo automático listo: pulsa Iniciar.' }
}

/**
 * Solicita E/S manual para el proceso Ejecutando.
 * La tecla `I` o el botón correspondiente mueve Ejecutando a Bloqueado, asigna
 * teclado, disco, red o impresora y libera la CPU. No despacha otro proceso en
 * la misma acción: el siguiente Espacio o tick automático realiza ese despacho.
 * Si no hay un proceso Ejecutando, no cambia el estado.
 */
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

/**
 * Completa la E/S de un PID Bloqueado.
 * La tecla numérica o el botón mueve Bloqueado al final de Lista y reinicia su
 * quantum usado; nunca lo mueve directamente a Ejecutando. El planificador decidirá
 * cuándo recibe la CPU según la cola FIFO.
 */
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

/**
 * Punto único para controles y reloj.
 * En manual, `step` avanza un tick y las acciones de E/S son explícitas; en
 * automático, `clock` solo avanza mientras la simulación está activa.
 */
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
