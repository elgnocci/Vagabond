import { afterEach, describe, expect, it, vi } from 'vitest'
import { clockNow, getDayEnd, todayISO } from './day'

const store = (value: string | null) => vi.stubGlobal('localStorage', { getItem: () => value, setItem: () => {} })
afterEach(() => vi.unstubAllGlobals())

describe('fin del día', () => {
  it('sin nada guardado, el día termina a las 3:00', () => {
    store(null)
    expect(getDayEnd()).toBe(3)
    expect(todayISO(new Date(2026, 10, 16, 2, 45))).toBe('2026-11-15')
    expect(todayISO(new Date(2026, 10, 16, 3, 0))).toBe('2026-11-16')
  })
  it('respeta la hora elegida, incluida medianoche', () => {
    store('0')
    expect(getDayEnd()).toBe(0)
    expect(todayISO(new Date(2026, 10, 16, 0, 5))).toBe('2026-11-16')
    store('9')
    expect(getDayEnd()).toBe(3)
  })
  it('pasada la medianoche, hoy ya no quedan avisos por programar', () => {
    store(null)
    expect(clockNow(new Date(2026, 10, 16, 1, 30))).toBe('24:00')
    expect(clockNow(new Date(2026, 10, 16, 8, 5))).toBe('08:05')
  })
})
