import test from 'node:test'
import assert from 'node:assert/strict'
import { handleKeyboardCommand } from '../src/keyboard.ts'
const key = (key, extra = {}) => ({ key, repeat: false, altKey: false, ctrlKey: false, metaKey: false, isComposing: false, ...extra })
test('keyboard commands map to reducer actions including uppercase and blocked slots', () => {
  assert.deepEqual(handleKeyboardCommand(key(' ')), { type: 'step' })
  assert.deepEqual(handleKeyboardCommand(key('I')), { type: 'request-io' })
  assert.deepEqual(handleKeyboardCommand(key('A')), { type: 'admit-next' })
  assert.deepEqual(handleKeyboardCommand(key('a')), { type: 'admit-next' })
  assert.deepEqual(handleKeyboardCommand(key('N')), { type: 'add' })
  assert.equal(handleKeyboardCommand(key('R')).type, 'reset')
  for (let i = 1; i <= 9; i++) assert.deepEqual(handleKeyboardCommand(key(String(i))), { type: 'complete-slot', slot: i - 1 })
  assert.equal(handleKeyboardCommand(key('0')), null)
  assert.equal(handleKeyboardCommand(key('Enter')), null)
})
test('held keys, system shortcuts and composition do not generate commands', () => {
  for (const flag of ['repeat', 'altKey', 'ctrlKey', 'metaKey', 'isComposing']) {
    for (const value of [' ', 'i', 'n', 'r', '1']) assert.equal(handleKeyboardCommand(key(value, { [flag]: true })), null)
  }
})
