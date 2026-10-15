import type { Action } from './simulation'

/** Maps one fresh, unmodified keystroke to a reducer action. Callers exclude editable targets. */
export function handleKeyboardCommand(event: {
  key: string; repeat: boolean; altKey: boolean; ctrlKey: boolean; metaKey: boolean; isComposing: boolean
}): Action | null {
  if (event.repeat || event.altKey || event.ctrlKey || event.metaKey || event.isComposing) return null
  const key = event.key.toLowerCase()
  if (key === ' ') return { type: 'step' }
  if (key === 'i') return { type: 'request-io' }
  if (key === 'n') return { type: 'add' }
  if (key === 'r') return { type: 'reset', value: Date.now() >>> 0 }
  if (/^[1-9]$/.test(key)) return { type: 'complete-slot', slot: Number(key) - 1 }
  return null
}
