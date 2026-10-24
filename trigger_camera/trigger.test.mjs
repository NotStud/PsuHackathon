import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const listeners = new Map()
globalThis.window = {
  addEventListener: (name, fn) => listeners.set(name, fn),
  removeEventListener: (name) => listeners.delete(name),
}
globalThis.screen = { orientation: { angle: 0 } }
const source = await readFile(new URL('./trigger.js', import.meta.url), 'utf8')
const { FlickTrigger } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)

test('flick fires once per arming, ignores sideways motion, and cleans up', () => {
  const shots = []
  const trigger = new FlickTrigger({ onFire: (info) => shots.push(info) })
  const motion = (beta, gamma = 0) => trigger._onMotion({ rotationRate: { beta, gamma, alpha: 0 } })
  motion(100)
  assert.equal(shots.length, 0)
  trigger.arm()
  motion(0, 200)
  assert.equal(shots.length, 0)
  motion(5)
  motion(100)
  motion(100)
  assert.equal(shots.length, 1)
  assert.ok(shots[0].steadyAt <= shots[0].firedAt)
  assert.ok(shots[0].firedAt - shots[0].steadyAt <= 250)
  trigger.arm()
  motion(-100)
  assert.equal(shots.length, 2)
  trigger.arm()
  trigger.disarm()
  motion(100)
  assert.equal(shots.length, 2)
  trigger.destroy()
  assert.equal(listeners.has('devicemotion'), false)
})
