import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { isTrialDriver, matchesTrialDriver } from '../src/trialDriver.js'

const previous = {
  id: process.env.TRIAL_DRIVER_ID,
  name: process.env.TRIAL_DRIVER_NAME,
}

afterEach(() => {
  if (previous.id === undefined) delete process.env.TRIAL_DRIVER_ID
  else process.env.TRIAL_DRIVER_ID = previous.id
  if (previous.name === undefined) delete process.env.TRIAL_DRIVER_NAME
  else process.env.TRIAL_DRIVER_NAME = previous.name
})

function admin(name, extra = {}) {
  return { id: 'admin-1', role: 'admin', name, active: true, ...extra }
}

test('el nombre por defecto es Francis, primer nombre o nombre completo', () => {
  delete process.env.TRIAL_DRIVER_ID
  delete process.env.TRIAL_DRIVER_NAME
  assert.equal(matchesTrialDriver(admin('Francis')), true)
  assert.equal(matchesTrialDriver(admin('francis garcía')), true)
  assert.equal(matchesTrialDriver(admin('Francisca')), false)
  assert.equal(matchesTrialDriver(admin('Mauro')), false)
  assert.equal(matchesTrialDriver({ id: 'c1', role: 'chofer', name: 'Francis', active: true }), false)
})

test('un admin inactivo coincide pero no actúa como chofer', () => {
  delete process.env.TRIAL_DRIVER_ID
  delete process.env.TRIAL_DRIVER_NAME
  const user = admin('Francis', { active: false })
  assert.equal(matchesTrialDriver(user), true)
  assert.equal(isTrialDriver(user), false)
})

test('TRIAL_DRIVER_ID elige una sola cuenta y TRIAL_DRIVER_NAME vacío no matchea', () => {
  process.env.TRIAL_DRIVER_ID = 'otro'
  delete process.env.TRIAL_DRIVER_NAME
  assert.equal(matchesTrialDriver(admin('Francis')), false)
  assert.equal(matchesTrialDriver(admin('Francis', { id: 'otro' })), true)

  delete process.env.TRIAL_DRIVER_ID
  process.env.TRIAL_DRIVER_NAME = ''
  assert.equal(matchesTrialDriver(admin('Francis')), false)
  process.env.TRIAL_DRIVER_NAME = 'Ana'
  assert.equal(matchesTrialDriver(admin('Ana López')), true)
})
