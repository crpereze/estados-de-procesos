import {
  advanceSimulation,
  admitProcess,
  canTransition,
  completeProcessIO,
  rejectProcess,
  requestProcessIO,
  resetSimulation,
  stateLabels,
} from './simulation.ts'
import type { Process, ProcessState, Simulation } from './simulation.ts'

/**
 * Normaliza nombres de estado tanto en español como en inglés,
 * admitiendo mayúsculas, minúsculas y tildes.
 */
export function normalizeState(input: string): ProcessState {
  const clean = input
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')

  switch (clean) {
    case 'new':
    case 'nuevo':
      return 'new'
    case 'ready':
    case 'listo':
      return 'ready'
    case 'running':
    case 'corriendo':
    case 'ejecucion':
    case 'ejecutando':
      return 'running'
    case 'blocked':
    case 'bloqueado':
      return 'blocked'
    case 'terminated':
    case 'terminado':
    case 'finalizado':
      return 'terminated'
    default:
      throw new Error(`Estado desconocido o inválido: "${input}"`)
  }
}

export interface StepValidation {
  from: ProcessState
  to: ProcessState
  fromLabel: string
  toLabel: string
  valid: boolean
  rule: string
}

export interface SequenceValidation {
  valid: boolean
  sequence: ProcessState[]
  sequenceLabels: string[]
  steps: StepValidation[]
  error?: string
}

/**
 * Reglas formales del modelo de 5 estados para cada transición permitida.
 */
const TRANSITION_RULES: Record<string, string> = {
  'new->ready': 'Admisión: el planificador de largo plazo coloca el proceso en la cola de Listos.',
  'new->terminated': 'Cancelación / Rechazo: el proceso es abortado o descartado antes de su admisión.',
  'ready->running': 'Despacho: el planificador de CPU asigna el procesador al proceso.',
  'running->ready': 'Expiración de Quantum / Preempción: el proceso cede la CPU y vuelve a Listos.',
  'running->blocked': 'Bloqueo por E/S: el proceso solicita una operación de E/S o evento externo.',
  'running->terminated': 'Terminación: el proceso completa su ráfaga de CPU o finaliza su ejecución.',
  'blocked->ready': 'E/S Completa: el dispositivo termina la operación y el proceso pasa a Listos.',
}

/**
 * Verifica formalmente si una secuencia de transiciones es válida en el modelo de 5 estados.
 */
export function verifyTransitionSequence(path: (ProcessState | string)[]): SequenceValidation {
  if (!path || path.length === 0) {
    return {
      valid: false,
      sequence: [],
      sequenceLabels: [],
      steps: [],
      error: 'La secuencia está vacía.',
    }
  }

  const sequence: ProcessState[] = path.map(s => (typeof s === 'string' ? normalizeState(s) : s))
  const sequenceLabels = sequence.map(s => stateLabels[s])

  if (sequence.length === 1) {
    return {
      valid: true,
      sequence,
      sequenceLabels,
      steps: [],
    }
  }

  const steps: StepValidation[] = []
  let allValid = true
  let firstError: string | undefined

  for (let i = 0; i < sequence.length - 1; i++) {
    const from = sequence[i]
    const to = sequence[i + 1]
    const valid = canTransition(from, to)
    const key = `${from}->${to}`
    const rule = valid
      ? TRANSITION_RULES[key] ?? `Transición permitida: ${stateLabels[from]} → ${stateLabels[to]}`
      : `Transición inválida: no está permitido pasar de ${stateLabels[from]} a ${stateLabels[to]} en el modelo de 5 estados.`

    if (!valid && allValid) {
      allValid = false
      firstError = rule
    }

    steps.push({
      from,
      to,
      fromLabel: stateLabels[from],
      toLabel: stateLabels[to],
      valid,
      rule,
    })
  }

  return {
    valid: allValid,
    sequence,
    sequenceLabels,
    steps,
    error: firstError,
  }
}

/**
 * Las cuatro trayectorias canónicas solicitadas para verificar.
 */
export interface CanonicalLifecycle {
  id: 1 | 2 | 3 | 4
  name: string
  pattern: string
  statesSpanish: string[]
  statesCanonical: ProcessState[]
  description: string
}

export const CANONICAL_LIFECYCLES: readonly CanonicalLifecycle[] = [
  {
    id: 1,
    name: 'Ejecución directa (sin interrupciones)',
    pattern: '[Nuevo - Listo - Ejecución - Terminado]',
    statesSpanish: ['Nuevo', 'Listo', 'Ejecución', 'Terminado'],
    statesCanonical: ['new', 'ready', 'running', 'terminated'],
    description: 'El proceso es admitido, despachado a CPU y completa todo su trabajo sin solicitar E/S ni ser interrumpido.',
  },
  {
    id: 2,
    name: 'Ejecución con bloqueo y reanudación de E/S',
    pattern: '[Nuevo - Listo - Ejecución - Bloqueado - Listo - Ejecución - Terminado]',
    statesSpanish: ['Nuevo', 'Listo', 'Ejecución', 'Bloqueado', 'Listo', 'Ejecución', 'Terminado'],
    statesCanonical: ['new', 'ready', 'running', 'blocked', 'ready', 'running', 'terminated'],
    description: 'El proceso inicia ejecución, solicita E/S pasando a Bloqueado, completa la operación regresando a Listo, y finalmente corre de nuevo hasta terminar.',
  },
  {
    id: 3,
    name: 'Expulsión por fin de Quantum (Round Robin)',
    pattern: '[Nuevo - Listo - Ejecución - Listo - Ejecución - Terminado]',
    statesSpanish: ['Nuevo', 'Listo', 'Ejecución', 'Listo', 'Ejecución', 'Terminado'],
    statesCanonical: ['new', 'ready', 'running', 'ready', 'running', 'terminated'],
    description: 'El proceso agota su quantum asignado mientras corre, es devuelto a la cola de Listos, y posteriormente vuelve a la CPU para finalizar.',
  },
  {
    id: 4,
    name: 'Cancelación / Rechazo antes de admisión',
    pattern: '[Nuevo - Terminado]',
    statesSpanish: ['Nuevo', 'Terminado'],
    statesCanonical: ['new', 'terminated'],
    description: 'El proceso es cancelado, abortado o rechazado por el sistema operativo antes de ser admitido a la memoria/cola de listos.',
  },
] as const

export interface EmulationResult {
  id: 1 | 2 | 3 | 4
  name: string
  pattern: string
  expected: ProcessState[]
  actual: ProcessState[]
  historyLabels: string[]
  verified: boolean
  logs: string[]
  process: Process
  stepsValidation: StepValidation[]
}

/**
 * Emula programáticamente la trayectoria 1:
 * [Nuevo → Listo → Ejecución → Terminado]
 */
export function emulatePath1(): EmulationResult {
  const logs: string[] = []
  const initial = resetSimulation(100)
  const pid = 501
  const process: Process = {
    pid,
    name: 'worker-directo',
    state: 'new',
    history: ['new'],
    total: 1,
    remaining: 1,
    arrival: 0,
    startedAt: null,
    finishedAt: null,
    quantumUsed: 0,
    ioAt: null,
    ioDuration: 2,
    ioRemaining: 0,
  }

  let state: Simulation = { ...initial, processes: [process], events: [] }
  logs.push(`Inicio: Proceso PID ${pid} creado en estado ${stateLabels[process.state]}`)

  // 1. Admitir: new -> ready
  state = admitProcess(state, pid)
  logs.push(`Acción "admit": PID ${pid} pasa a ${stateLabels[state.processes[0].state]}`)

  // 2. Avanzar tick: despacha a running y ejecuta 1 tick (remaining llega a 0 -> terminated)
  state = advanceSimulation(state)
  const finalProc = state.processes[0]
  logs.push(`Acción "step": PID ${pid} se despacha a Corriendo y termina trabajo -> ${stateLabels[finalProc.state]}`)

  const validation = verifyTransitionSequence(finalProc.history ?? [])
  const verified = validation.valid && JSON.stringify(finalProc.history) === JSON.stringify(CANONICAL_LIFECYCLES[0].statesCanonical)

  return {
    id: 1,
    name: CANONICAL_LIFECYCLES[0].name,
    pattern: CANONICAL_LIFECYCLES[0].pattern,
    expected: [...CANONICAL_LIFECYCLES[0].statesCanonical],
    actual: finalProc.history ?? [],
    historyLabels: (finalProc.history ?? []).map(s => stateLabels[s]),
    verified,
    logs,
    process: finalProc,
    stepsValidation: validation.steps,
  }
}

/**
 * Emula programáticamente la trayectoria 2:
 * [Nuevo → Listo → Ejecución → Bloqueado → Listo → Ejecución → Terminado]
 */
export function emulatePath2(): EmulationResult {
  const logs: string[] = []
  const initial = resetSimulation(200)
  const pid = 502
  const process: Process = {
    pid,
    name: 'worker-io',
    state: 'new',
    history: ['new'],
    total: 2,
    remaining: 2,
    arrival: 0,
    startedAt: null,
    finishedAt: null,
    quantumUsed: 0,
    ioAt: null,
    ioDuration: 2,
    ioRemaining: 0,
  }

  let state: Simulation = { ...initial, processes: [process], events: [] }
  logs.push(`Inicio: Proceso PID ${pid} en estado ${stateLabels[process.state]}`)

  // 1. Admitir: new -> ready
  state = admitProcess(state, pid)
  logs.push(`Acción "admit": PID ${pid} pasa a ${stateLabels[state.processes[0].state]}`)

  // 2. Avanzar tick: despacha a running, ejecuta 1 tick (queda 1 tick)
  state = advanceSimulation(state)
  logs.push(`Acción "step": PID ${pid} despachado a CPU -> ${stateLabels[state.processes[0].state]} (restante: ${state.processes[0].remaining})`)

  // 3. Solicitar E/S: running -> blocked
  state = requestProcessIO(state)
  logs.push(`Acción "request-io": PID ${pid} solicita E/S -> ${stateLabels[state.processes[0].state]}`)

  // 4. Completar E/S: blocked -> ready
  state = completeProcessIO(state, pid)
  logs.push(`Acción "complete-io": PID ${pid} finaliza E/S -> ${stateLabels[state.processes[0].state]}`)

  // 5. Avanzar tick: despacha de nuevo a running y ejecuta tick final (remaining 0 -> terminated)
  state = advanceSimulation(state)
  const finalProc = state.processes[0]
  logs.push(`Acción "step": PID ${pid} despachado nuevamente y finaliza -> ${stateLabels[finalProc.state]}`)

  const validation = verifyTransitionSequence(finalProc.history ?? [])
  const verified = validation.valid && JSON.stringify(finalProc.history) === JSON.stringify(CANONICAL_LIFECYCLES[1].statesCanonical)

  return {
    id: 2,
    name: CANONICAL_LIFECYCLES[1].name,
    pattern: CANONICAL_LIFECYCLES[1].pattern,
    expected: [...CANONICAL_LIFECYCLES[1].statesCanonical],
    actual: finalProc.history ?? [],
    historyLabels: (finalProc.history ?? []).map(s => stateLabels[s]),
    verified,
    logs,
    process: finalProc,
    stepsValidation: validation.steps,
  }
}

/**
 * Emula programáticamente la trayectoria 3:
 * [Nuevo → Listo → Ejecución → Listo → Ejecución → Terminado]
 */
export function emulatePath3(): EmulationResult {
  const logs: string[] = []
  const initial = resetSimulation(300)
  const pid = 503
  const process: Process = {
    pid,
    name: 'worker-quantum',
    state: 'new',
    history: ['new'],
    total: 2,
    remaining: 2,
    arrival: 0,
    startedAt: null,
    finishedAt: null,
    quantumUsed: 0,
    ioAt: null,
    ioDuration: 2,
    ioRemaining: 0,
  }

  // Quantum = 1 para forzar preempción al primer tick
  let state: Simulation = { ...initial, quantum: 1, processes: [process], events: [] }
  logs.push(`Inicio: PID ${pid} en estado ${stateLabels[process.state]} (Quantum = 1)`)

  // 1. Admitir: new -> ready
  state = admitProcess(state, pid)
  logs.push(`Acción "admit": PID ${pid} pasa a ${stateLabels[state.processes[0].state]}`)

  // 2. Avanzar tick: despacha a running, ejecuta 1 tick, agota quantum (1 >= 1) -> vuelve a ready, y el planificador lo redispatcha a running
  state = advanceSimulation(state)
  logs.push(`Acción "step": PID ${pid} corre 1 tick, agota quantum (preempción a Listo) y re-despacha a ${stateLabels[state.processes[0].state]}`)

  // 3. Avanzar tick: despacha a running de nuevo, ejecuta tick final (remaining 0) -> terminated
  state = advanceSimulation(state)
  const finalProc = state.processes[0]
  logs.push(`Acción "step": PID ${pid} vuelve a CPU y finaliza -> ${stateLabels[finalProc.state]}`)

  const validation = verifyTransitionSequence(finalProc.history ?? [])
  const verified = validation.valid && JSON.stringify(finalProc.history) === JSON.stringify(CANONICAL_LIFECYCLES[2].statesCanonical)

  return {
    id: 3,
    name: CANONICAL_LIFECYCLES[2].name,
    pattern: CANONICAL_LIFECYCLES[2].pattern,
    expected: [...CANONICAL_LIFECYCLES[2].statesCanonical],
    actual: finalProc.history ?? [],
    historyLabels: (finalProc.history ?? []).map(s => stateLabels[s]),
    verified,
    logs,
    process: finalProc,
    stepsValidation: validation.steps,
  }
}

/**
 * Emula programáticamente la trayectoria 4:
 * [Nuevo → Terminado]
 */
export function emulatePath4(): EmulationResult {
  const logs: string[] = []
  const initial = resetSimulation(400)
  const pid = 504
  const process: Process = {
    pid,
    name: 'worker-cancelado',
    state: 'new',
    history: ['new'],
    total: 3,
    remaining: 3,
    arrival: 0,
    startedAt: null,
    finishedAt: null,
    quantumUsed: 0,
    ioAt: null,
    ioDuration: 2,
    ioRemaining: 0,
  }

  let state: Simulation = { ...initial, processes: [process], events: [] }
  logs.push(`Inicio: Proceso PID ${pid} creado en estado ${stateLabels[process.state]}`)

  // 1. Rechazar / abortar: new -> terminated
  state = rejectProcess(state, pid)
  const finalProc = state.processes[0]
  logs.push(`Acción "reject": PID ${pid} abortado antes de admisión -> ${stateLabels[finalProc.state]}`)

  const validation = verifyTransitionSequence(finalProc.history ?? [])
  const verified = validation.valid && JSON.stringify(finalProc.history) === JSON.stringify(CANONICAL_LIFECYCLES[3].statesCanonical)

  return {
    id: 4,
    name: CANONICAL_LIFECYCLES[3].name,
    pattern: CANONICAL_LIFECYCLES[3].pattern,
    expected: [...CANONICAL_LIFECYCLES[3].statesCanonical],
    actual: finalProc.history ?? [],
    historyLabels: (finalProc.history ?? []).map(s => stateLabels[s]),
    verified,
    logs,
    process: finalProc,
    stepsValidation: validation.steps,
  }
}

/**
 * Despacha la emulación por identificador canónico (1, 2, 3 ó 4).
 */
export function emulateLifecyclePath(id: 1 | 2 | 3 | 4): EmulationResult {
  switch (id) {
    case 1:
      return emulatePath1()
    case 2:
      return emulatePath2()
    case 3:
      return emulatePath3()
    case 4:
      return emulatePath4()
  }
}

/**
 * Ejecuta y verifica las 4 trayectorias canónicas.
 */
export function verifyAllCanonicalLifecycles(): {
  allValid: boolean
  results: EmulationResult[]
} {
  const results = [emulatePath1(), emulatePath2(), emulatePath3(), emulatePath4()]
  const allValid = results.every(r => r.verified)
  return { allValid, results }
}
