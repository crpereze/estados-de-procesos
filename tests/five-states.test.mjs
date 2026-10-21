import test from 'node:test'
import assert from 'node:assert/strict'
import {
  advanceSimulation, admitProcess, completeProcessIO, canTransition, createRandomProcess, resetSimulation,
  scheduleNextProcess, simulationReducer, timingMetrics, MAX_PROCESSES, stateLabels,
} from '../src/simulation.ts'

const process = (pid, overrides = {}) => ({
  pid, name: 'worker', state: 'new', total: 7, remaining: 7, arrival: 0,
  startedAt: null, finishedAt: null, quantumUsed: 0, ioAt: null, ioDuration: 2, ioRemaining: 0, ...overrides,
})
const session = (...processes) => ({ ...resetSimulation(42), processes, events: [] })
const manual = (...processes) => simulationReducer(session(...processes), { type: 'mode', value: 'manual' })
const act = (state, type, extra = {}) => simulationReducer(state, { type, ...extra })

test('1. creating a process places it in Nuevo', () => {
  const state = { ...resetSimulation(7), processes: [] }
  createRandomProcess(state)
  assert.equal(state.processes.length, 1)
  assert.equal(state.processes[0].state, 'new')
  assert.equal(state.events[0].kind, 'NUEVO')
  assert.match(state.events[0].text, new RegExp(stateLabels.new))
})

test('2. a Nuevo process is never selected by the scheduler', () => {
  const state = session(process(101))
  scheduleNextProcess(state)
  assert.equal(state.processes[0].state, 'new')
  assert.equal(state.timeline.length, 0)
})

test('3. admission moves Nuevo to Listo and records the event without mutating the previous state', () => {
  const before = session(process(101))
  const snapshot = structuredClone(before)
  const after = admitProcess(before, 101)
  assert.notEqual(after, before)
  assert.equal(after.processes[0].state, 'ready')
  assert.equal(after.processes[0].quantumUsed, 0)
  assert.equal(after.events[0].kind, 'READY')
  assert.match(after.events[0].text, /Listo/)
  assert.deepEqual(before, snapshot)
})

test('4. admission is idempotent and rejects incompatible or unknown processes', () => {
  const admitted = admitProcess(session(process(101)), 101)
  assert.equal(admitProcess(admitted, 101), admitted)
  const running = session(process(101, { state: 'running' }))
  assert.equal(admitProcess(running, 101), running)
  const unknown = session(process(101))
  assert.equal(admitProcess(unknown, 999), unknown)
})

test('5. the scheduler selects the first Listo process following FIFO', () => {
  const state = session(process(101, { state: 'ready' }), process(102, { state: 'ready' }))
  scheduleNextProcess(state)
  assert.equal(state.processes.find(p => p.pid === 101).state, 'running')
  assert.equal(state.processes.find(p => p.pid === 102).state, 'ready')
})

test('6. dispatch does not consume CPU until the next tick', () => {
  const state = manual(process(101, { state: 'ready' }))
  scheduleNextProcess(state)
  assert.equal(state.processes[0].state, 'running')
  assert.equal(state.processes[0].remaining, 7)
  assert.equal(state.busyTicks, 0)
  const stepped = act(state, 'step')
  assert.equal(stepped.processes[0].remaining, 6)
  assert.equal(stepped.busyTicks, 1)
})

test('7. quantum expiry returns the process to the end of the ready queue', () => {
  let state = session(process(101, { state: 'ready' }), process(102, { state: 'ready' }))
  for (let i = 0; i < 3; i++) state = advanceSimulation(state)
  assert.equal(state.processes.find(p => p.pid === 102).state, 'running')
  assert.equal(state.processes.find(p => p.pid === 101).state, 'ready')
  assert.ok(state.processes.map(p => p.pid).indexOf(102) < state.processes.map(p => p.pid).indexOf(101))
})

test('8. an I/O request blocks the Corriendo process and frees the CPU', () => {
  let state = manual(process(101, { state: 'ready' }))
  state = act(state, 'step')
  assert.equal(state.processes[0].state, 'running')
  state = act(state, 'request-io')
  assert.equal(state.processes[0].state, 'blocked')
  assert.equal(state.processes.filter(p => p.state === 'running').length, 0)
  assert.ok(state.processes[0].ioRemaining > 0)
  assert.ok(['Teclado', 'Disco', 'Red', 'Impresora'].includes(state.processes[0].ioType))
})

test('9. a Bloqueado process returns to Listo when its I/O completes', () => {
  let state = manual(process(101, { state: 'ready' }))
  state = act(act(state, 'step'), 'request-io')
  state = act(state, 'complete-io', { pid: 101 })
  assert.equal(state.processes[0].state, 'ready')
  assert.equal(state.processes[0].quantumUsed, 0)
})

test('10. a manual I/O request clears the stale automatic I/O point', () => {
  let state = manual(process(101, { state: 'ready', ioAt: 1 }))
  state = act(state, 'step')
  state = act(state, 'request-io')
  assert.equal(state.processes[0].ioAt, null)
  state = act(state, 'complete-io', { pid: 101 })
  state = { ...act(state, 'mode', { value: 'automatic' }), active: true }
  for (let i = 0; i < 6; i++) state = advanceSimulation(state)
  assert.notEqual(state.processes[0].state, 'blocked')
})

test('11. termination keeps the process in Terminado with its finished tick', () => {
  let state = session(process(101, { state: 'ready', total: 2, remaining: 2 }))
  for (let i = 0; i < 2; i++) state = advanceSimulation(state)
  assert.equal(state.completed, 1)
  assert.equal(state.processes.length, 1)
  assert.equal(state.processes[0].state, 'terminated')
  assert.equal(state.processes[0].finishedAt, 2)
})

test('12. a Terminado process cannot run, block or return to Listo', () => {
  const terminated = session(process(101, { state: 'terminated', remaining: 0, finishedAt: 1 }))
  for (const target of ['new', 'ready', 'running', 'blocked']) assert.equal(canTransition('terminated', target), false)
  scheduleNextProcess(terminated)
  assert.equal(terminated.processes[0].state, 'terminated')
  assert.equal(admitProcess(terminated, 101), terminated)
  const advanced = advanceSimulation(terminated)
  assert.equal(advanced.processes[0].state, 'terminated')
  assert.equal(advanced.completed, 0)
})

test('13. completed is not increased twice for the same process', () => {
  let state = session(process(101, { state: 'ready', total: 1, remaining: 1 }))
  state = advanceSimulation(state)
  assert.equal(state.completed, 1)
  for (let i = 0; i < 5; i++) state = advanceSimulation(state)
  assert.equal(state.completed, 1)
  assert.equal(state.processes.filter(p => p.state === 'terminated').length, 1)
})

test('14. terminated processes do not block creating new ones within the active limit', () => {
  const state = { ...resetSimulation(3), processes: [] }
  for (let i = 0; i < 5; i++) createRandomProcess(state)
  state.processes = state.processes.map(p => ({ ...p, state: 'terminated', remaining: 0 }))
  for (let i = 0; i < MAX_PROCESSES; i++) createRandomProcess(state)
  assert.equal(state.processes.filter(p => p.state !== 'terminated').length, MAX_PROCESSES)
  const before = state.processes.length
  createRandomProcess(state)
  assert.equal(state.processes.length, before)
})

test('15. explicit admission moves new process to ready before scheduling', () => {
  let state = session(process(101), process(102))
  state = admitProcess(state, 101)
  state = admitProcess(state, 102)
  state = advanceSimulation(state)
  assert.equal(state.processes.find(p => p.pid === 101).state, 'running')
  assert.equal(state.processes.find(p => p.pid === 102).state, 'ready')
  assert.equal(state.completed, 0)
})

test('15b. a process created between ticks remains Nuevo until explicitly admitted', () => {
  const state = { ...resetSimulation(11), processes: [] }
  createRandomProcess(state)
  assert.equal(state.processes[0].state, 'new')
  const advanced = advanceSimulation(state)
  assert.equal(advanced.processes[0].state, 'new')
  const admitted = admitProcess(advanced, advanced.processes[0].pid)
  assert.equal(admitted.processes[0].state, 'ready')
})

test('16. manual mode admits explicitly and preserves its clock semantics', () => {
  let state = manual(process(101))
  assert.equal(act(state, 'clock'), state)
  state = act(state, 'admit-next')
  assert.equal(state.processes[0].state, 'ready')
  assert.equal(state.tick, 0)
  state = act(state, 'step')
  assert.equal(state.tick, 1)
  assert.equal(state.processes[0].state, 'running')
})

test('17. the Gantt records busy ticks and IDLE ticks', () => {
  let state = session(process(101, { state: 'ready', total: 3, remaining: 3 }))
  for (let i = 0; i < 3; i++) state = advanceSimulation(state)
  state = advanceSimulation(state)
  assert.deepEqual(state.timeline.map(t => t.pid), [101, 101, 101, null])
})

test('18. reset leaves a valid state and metrics', () => {
  const dirty = advanceSimulation({ ...session(process(101, { state: 'ready' })), active: true })
  const reset = simulationReducer(dirty, { type: 'reset', value: 58 })
  assert.equal(reset.tick, 0)
  assert.equal(reset.completed, 0)
  assert.equal(reset.busyTicks, 0)
  assert.deepEqual(reset.timeline, [])
  assert.ok(reset.processes.length >= 5 && reset.processes.length <= 8)
  assert.ok(reset.processes.every(p => p.state === 'new' && p.remaining === p.total && p.startedAt === null && p.finishedAt === null))
})

test('edge: a single remaining CPU unit finishes on the same tick', () => {
  const state = advanceSimulation(session(process(101, { state: 'ready', total: 1, remaining: 1 })))
  assert.equal(state.processes[0].state, 'terminated')
  assert.equal(state.timeline[0].pid, 101)
})

test('edge: minimum quantum rotates between processes every tick', () => {
  let state = { ...session(process(101, { state: 'ready' }), process(102, { state: 'ready' })), quantum: 1 }
  state = advanceSimulation(state)
  state = advanceSimulation(state)
  assert.deepEqual(state.timeline.map(t => t.pid), [101, 102])
})

test('edge: completing I/O returns blocked processes to ready and scheduler recovers FIFO', () => {
  let state = session(process(101, { state: 'blocked', ioRemaining: 2 }), process(102, { state: 'blocked', ioRemaining: 2 }))
  state = completeProcessIO(state, 101)
  state = completeProcessIO(state, 102)
  assert.equal(state.processes.find(p => p.pid === 101).state, 'ready')
  assert.equal(state.processes.find(p => p.pid === 102).state, 'ready')
  state = advanceSimulation(state)
  assert.equal(state.processes.find(p => p.pid === 101).state, 'running')
  assert.equal(state.processes.find(p => p.pid === 102).state, 'ready')
})

test('edge: all processes in non-executable states produce IDLE without corruption', () => {
  let state = manual(process(101), process(102, { state: 'blocked', ioRemaining: 2 }))
  state = act(state, 'step')
  assert.equal(state.timeline.at(-1).pid, null)
  assert.equal(state.busyTicks, 0)
  assert.equal(state.processes.find(p => p.pid === 101).state, 'new')
  assert.equal(state.processes.find(p => p.pid === 102).state, 'blocked')
})

test('allowed transitions match the five-state model exactly', () => {
  assert.ok(canTransition('new', 'ready'))
  assert.ok(canTransition('new', 'terminated'))
  assert.ok(canTransition('ready', 'running'))
  assert.ok(canTransition('running', 'ready'))
  assert.ok(canTransition('running', 'blocked'))
  assert.ok(canTransition('running', 'terminated'))
  assert.ok(canTransition('blocked', 'ready'))
  const forbidden = [['new', 'running'], ['new', 'blocked'], ['ready', 'blocked'], ['ready', 'terminated'], ['blocked', 'running'], ['blocked', 'terminated'], ['terminated', 'ready'], ['terminated', 'running'], ['running', 'new']]
  for (const [from, to] of forbidden) assert.equal(canTransition(from, to), false, `${from} -> ${to}`)
})

test('rejecting a new process transitions directly from Nuevo to Terminado', () => {
  const state = session(process(101))
  const rejected = act(state, 'reject', { pid: 101 })
  assert.equal(rejected.processes[0].state, 'terminated')
  assert.equal(rejected.completed, 1)
  assert.deepEqual(rejected.processes[0].history, ['new', 'terminated'])
})

test('timing metrics average finished processes accurately', () => {
  let state = session(process(101, { state: 'ready', total: 4, remaining: 4, arrival: 0 }))
  for (let i = 0; i < 4; i++) state = advanceSimulation(state)
  const times = timingMetrics(state)
  assert.equal(times.finished, 1)
  assert.equal(times.avgTurnaround, 4)
  assert.equal(times.avgResponse, 1)
  assert.equal(times.avgWait, 0)
})

test('invalid admission or I/O actions do not corrupt the simulation', () => {
  const state = manual(process(101), process(102, { state: 'terminated', remaining: 0 }))
  assert.equal(act(state, 'admit', { pid: 102 }), state)
  assert.equal(act(state, 'admit', { pid: 999 }), state)
  assert.equal(act(state, 'complete-io', { pid: 999 }), state)
  assert.equal(act(state, 'complete-slot', { slot: 5 }), state)
})
