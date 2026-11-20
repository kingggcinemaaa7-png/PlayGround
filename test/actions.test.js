import test from 'node:test'
import assert from 'node:assert/strict'

import {
  ACTIONS,
  ACTION_ORDER,
  CHAOS_RULES,
  DEFAULT_CATALOG,
  DEFAULT_MAPPING,
  DEFAULT_SETTINGS,
  demoAvatar,
  demoUsers,
  mergeMapping,
  normalizeMapping,
  normalizeSettings,
  resolveChatAction,
  resolveGiftAction,
  stepChaos
} from '../public/js/shared/actions.js'

test('action catalogue is internally consistent', () => {
  assert.ok(ACTION_ORDER.length >= 6)
  for (const id of ACTION_ORDER) {
    assert.ok(ACTIONS[id], `missing action ${id}`)
    assert.equal(ACTIONS[id].id, id)
    assert.ok(ACTIONS[id].title)
    assert.ok(ACTIONS[id].icon)
  }
  for (const gift of DEFAULT_CATALOG) {
    assert.ok(gift.id)
    assert.ok(gift.name)
    assert.ok(gift.coins >= 1)
  }
})

test('gift ranges map every documented coin band', () => {
  const cases = [
    [1, 'SPAWN_IMPATIENT'],
    [9, 'SPAWN_IMPATIENT'],
    [10, 'OKEY_FIGHT'],
    [29, 'OKEY_FIGHT'],
    [30, 'THROW_TOST_CAY'],
    [99, 'THROW_TOST_CAY'],
    [100, 'ZABITA_RAID'],
    [299, 'ZABITA_RAID'],
    [300, 'MUHTAR_VIP'],
    [999999, 'MUHTAR_VIP']
  ]
  for (const [coins, expected] of cases) {
    assert.equal(resolveGiftAction(DEFAULT_MAPPING, { giftId: 'x', coins, name: 'test' }), expected, `${coins} jeton`)
  }
})

test('a gap between ranges falls back to the impatient customer', () => {
  const mapping = normalizeMapping({
    ranges: [
      { min: 10, max: 20, action: 'OKEY_FIGHT' },
      { min: 40, max: 60, action: 'THROW_TOST_CAY' }
    ]
  })
  assert.equal(resolveGiftAction(mapping, { coins: 30 }), 'SPAWN_IMPATIENT')
})

test('explicit gift id overrides win over the coin range', () => {
  const mapping = normalizeMapping({ overrides: { '5655': 'MUHTAR_VIP' } })
  assert.equal(resolveGiftAction(mapping, { giftId: '5655', coins: 1 }), 'MUHTAR_VIP')
  // Unknown ids still use the coin range.
  assert.equal(resolveGiftAction(mapping, { giftId: '9999', coins: 10 }), 'OKEY_FIGHT')
})

test('gift name matches an override when no number is available', () => {
  const mapping = normalizeMapping({ overrides: { 'Özel Gül': 'THROW_TOST_CAY' } })
  assert.equal(resolveGiftAction(mapping, { giftId: null, coins: 0, name: 'Özel Gül' }), 'THROW_TOST_CAY')
})

test('chat commands accept numbers, emoji suffixes and whitespace', () => {
  assert.equal(resolveChatAction(DEFAULT_MAPPING, '1'), 'JOIN_CUSTOMER')
  assert.equal(resolveChatAction(DEFAULT_MAPPING, ' 2 '), 'JOIN_APPRENTICE')
  assert.equal(resolveChatAction(DEFAULT_MAPPING, '1️⃣'), 'JOIN_CUSTOMER')
  assert.equal(resolveChatAction(DEFAULT_MAPPING, '2️⃣'), 'JOIN_APPRENTICE')
  assert.equal(resolveChatAction(DEFAULT_MAPPING, 'çay'), null)
  assert.equal(resolveChatAction(DEFAULT_MAPPING, ''), null)
})

test('normalizeMapping repairs invalid input', () => {
  const mapping = normalizeMapping({
    likes: 'NOT_REAL',
    commands: { 1: 'OKEY_FIGHT', 2: 'NOPE' },
    ranges: [
      { min: 20, max: 10, action: 'NOPE' },
      { min: 1, max: 5, action: 'ZABITA_RAID' }
    ],
    overrides: { a: 'MUHTAR_VIP', b: 'NOPE' }
  })
  assert.equal(mapping.likes, 'BOOST_STOVE')
  assert.equal(mapping.commands['1'], 'OKEY_FIGHT')
  assert.equal(mapping.commands['2'], 'JOIN_APPRENTICE')
  assert.equal(mapping.ranges[0].min, 1)
  assert.equal(mapping.ranges[0].action, 'ZABITA_RAID')
  assert.deepEqual(mapping.overrides, { a: 'MUHTAR_VIP' })
})

test('mergeMapping applies patches and can delete overrides with null', () => {
  const base = normalizeMapping({ overrides: { '1': 'MUHTAR_VIP', '2': 'OKEY_FIGHT' } })
  const merged = mergeMapping(base, {
    likes: 'SPAWN_IMPATIENT',
    commands: { 2: 'JOIN_CUSTOMER' },
    overrides: { '1': null, '3': 'ZABITA_RAID' }
  })
  assert.equal(merged.likes, 'SPAWN_IMPATIENT')
  assert.equal(merged.commands['2'], 'JOIN_CUSTOMER')
  assert.equal(merged.overrides['1'], undefined)
  assert.equal(merged.overrides['3'], 'ZABITA_RAID')
  assert.equal(merged.overrides['2'], 'OKEY_FIGHT')

  const unchanged = mergeMapping(merged, { overrides: { '3': null } })
  assert.equal(unchanged.overrides['3'], undefined)
})

test('normalizeSettings clamps and rejects unknown values', () => {
  const s = normalizeSettings({
    roundSeconds: -5,
    chaosTarget: 999,
    timeOfDay: 'noon',
    bloom: 12,
    fog: -1,
    volume: 4,
    aspect: '1:1',
    autoDemo: 'yes'
  })
  assert.equal(s.roundSeconds, 60)
  assert.equal(s.chaosTarget, 200)
  assert.equal(s.timeOfDay, DEFAULT_SETTINGS.timeOfDay)
  assert.equal(s.bloom, 2.5)
  assert.equal(s.fog, 0)
  assert.equal(s.volume, 1)
  assert.equal(s.aspect, 'auto')
  assert.equal(s.autoDemo, true)
})

test('stepChaos grows with customers and shrinks with apprentices', () => {
  const busy = stepChaos({ chaos: 20 }, 2, { customers: 3, apprentices: 0 })
  assert.ok(busy.chaos > 20)
  assert.ok(busy.rate > CHAOS_RULES.base)

  const calm = stepChaos({ chaos: 80 }, 2, { customers: 0, apprentices: 4, stoves: 2, muhtar: true })
  assert.ok(calm.chaos < 80)
  assert.ok(calm.rate < CHAOS_RULES.base)
})

test('stepChaos never leaves the 0..100 range', () => {
  assert.equal(stepChaos({ chaos: 0 }, 60, { apprentices: 4, muhtar: true }).chaos, 0)
  assert.equal(stepChaos({ chaos: 99 }, 60, { customers: 20, fights: 4, zabita: true }).chaos, 100)
})

test('demo avatars are deterministic data URIs', () => {
  const user = demoUsers[0]
  const a = demoAvatar(user)
  const b = demoAvatar(user)
  assert.equal(a, b)
  assert.match(a, /^data:image\/svg\+xml;charset=utf-8,/)
  assert.ok(decodeURIComponent(a).includes(user.nickname.slice(0, 2).toUpperCase()))
})
