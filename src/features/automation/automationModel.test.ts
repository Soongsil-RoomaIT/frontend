import { describe, expect, it } from 'vitest'
import { applyAutomationChange, describeRule, parseAutomation, validateRules } from './automationModel'

const rulesShape = {
  enabled: true,
  quietHours: '22-07',
  rules: [
    { id: 'humidityHigh', metric: 'humidity', threshold: 70, enabled: true, label: '습도 상한', unit: '%', min: 30, max: 95 },
    { id: 'humidityLow', metric: 'humidity', threshold: 60, enabled: false },
    { id: 'pm25Bad', metric: 'pm25', threshold: 35 },
    { id: 'custom', metric: 'light', threshold: 300, unit: 'lx' },
  ],
}
const flatShape = { enabled: true, mode: 'AUTO', humidityOn: 65, humidityOff: 55, pm25On: 35, rainProbability: 60, quietHours: '22-07' }

describe('parseAutomation', () => {
  it('reads the rules shape, keeping server details', () => {
    const a = parseAutomation(rulesShape)
    expect(a.enabled).toBe(true)
    expect(a.rules.map((r) => [r.id, r.threshold, r.enabled])).toEqual([
      ['humidityHigh', 70, true],
      ['humidityLow', 60, false],
      ['pm25Bad', 35, null],
      ['custom', 300, null],
    ])
    expect(a.rules[0]?.label).toBe('습도 상한')
  })

  it('reads a bare rule array', () => {
    const a = parseAutomation(rulesShape.rules)
    expect(a.enabled).toBeNull()
    expect(a.rules).toHaveLength(4)
  })

  it('reads the flat shape, one rule per numeric key', () => {
    const a = parseAutomation(flatShape)
    expect(a.enabled).toBe(true)
    expect(a.rules.map((r) => r.id)).toEqual(['humidityOn', 'humidityOff', 'pm25On', 'rainProbability'])
    expect(a.rules.every((r) => r.enabled === null)).toBe(true)
  })

  it('drops rules without a numeric threshold', () => {
    expect(parseAutomation({ rules: [{ id: 'x', threshold: 'high' }, { threshold: 1 }] }).rules).toEqual([])
  })

  it.each([[null], ['x'], [1]])('rejects %j', (v) => {
    expect(() => parseAutomation(v)).toThrow()
  })
})

describe('describeRule', () => {
  it('prefers server details, then the catalog, then the id', () => {
    const a = parseAutomation(rulesShape)
    expect(describeRule(a.rules[0]!)).toMatchObject({ label: '습도 상한', unit: '%', min: 30, max: 95 })
    expect(describeRule(a.rules[1]!)).toMatchObject({ label: '제습기 끄기', unit: '%', min: 20, max: 90 })
    expect(describeRule(a.rules[3]!)).toMatchObject({ label: 'custom', unit: 'lx', min: null, max: null, description: null })
    expect(describeRule(parseAutomation({ constructor: 5 }).rules[0]!).label).toBe('constructor')
  })
})

describe('applyAutomationChange', () => {
  it('writes thresholds and switches into the rules shape, keeping unknown fields', () => {
    const body = applyAutomationChange(parseAutomation(rulesShape), {
      enabled: false,
      rules: { humidityHigh: { threshold: 66 }, humidityLow: { enabled: true }, pm25Bad: { enabled: false } },
    }) as typeof rulesShape
    expect(body.enabled).toBe(false)
    expect(body.quietHours).toBe('22-07')
    expect(body.rules[0]).toMatchObject({ threshold: 66, enabled: true, label: '습도 상한' })
    expect(body.rules[1]).toMatchObject({ threshold: 60, enabled: true })
    // No switch on the server for this rule, so none is invented
    expect(body.rules[2]).toEqual({ id: 'pm25Bad', metric: 'pm25', threshold: 35 })
  })

  it('writes into a bare array', () => {
    const body = applyAutomationChange(parseAutomation(rulesShape.rules), { enabled: true, rules: { custom: { threshold: 250 } } })
    expect(Array.isArray(body)).toBe(true)
    expect((body as { threshold: number }[])[3]?.threshold).toBe(250)
  })

  it('writes into the flat shape without inventing keys', () => {
    const body = applyAutomationChange(parseAutomation(flatShape), {
      enabled: false,
      rules: { humidityOn: { threshold: 68 }, ghost: { threshold: 1 } },
    }) as Record<string, unknown>
    expect(body).toEqual({ ...flatShape, enabled: false, humidityOn: 68 })
  })

  it('does not add a master switch the server lacks', () => {
    const body = applyAutomationChange(parseAutomation({ humidityOn: 65 }), { enabled: true }) as Record<string, unknown>
    expect(body).toEqual({ humidityOn: 65 })
  })

  it('leaves the original untouched', () => {
    const a = parseAutomation(rulesShape)
    applyAutomationChange(a, { rules: { humidityHigh: { threshold: 1 } } })
    expect(a.rules[0]?.threshold).toBe(70)
    expect(rulesShape.rules[0]?.threshold).toBe(70)
  })
})

describe('validateRules', () => {
  const rules = parseAutomation(rulesShape).rules

  it('parses valid input', () => {
    const { values, errors } = validateRules(rules, { humidityHigh: '72', custom: '0' })
    expect(errors).toEqual({})
    expect(values).toEqual({ humidityHigh: 72, custom: 0 })
  })

  it.each([
    ['empty', ''],
    ['blank', '  '],
    ['text', 'abc'],
    ['too low', '10'],
    ['too high', '96'],
    ['infinite', 'Infinity'],
  ])('rejects %s', (_n, input) => {
    expect(validateRules(rules, { humidityHigh: input }).errors.humidityHigh).toBeTruthy()
  })

  it('has no range for an unknown rule', () => {
    expect(validateRules(rules, { custom: '99999' }).errors).toEqual({})
  })

  it.each([
    ['equal', '70'],
    ['inverted', '75'],
  ])('rejects a %s low humidity against the current high', (_n, low) => {
    expect(validateRules(rules, { humidityLow: low }).errors.humidityLow).toContain('낮아야')
  })

  it('blames the edited side of the pair', () => {
    expect(validateRules(rules, { humidityHigh: '55' }).errors.humidityHigh).toContain('낮아야')
  })

  it('also checks the flat-shape pair', () => {
    const flat = parseAutomation(flatShape).rules
    expect(validateRules(flat, { humidityOff: '70' }).errors.humidityOff).toBeTruthy()
    expect(validateRules(flat, { humidityOff: '50' }).errors).toEqual({})
  })

  it('ignores ids that are not rules', () => {
    expect(validateRules(rules, { ghost: 'x' })).toEqual({ values: {}, errors: {} })
  })
})
