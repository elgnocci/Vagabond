import { toISO, type ISODate } from './domain/dates'

const KEY = 'vagabond-day-end'

/** Hora en que termina el día (0 a 5). Con 3, lo que marques a las 00:30 cuenta para el día anterior. */
export function getDayEnd(): number {
  try {
    const raw = localStorage.getItem(KEY)
    const v = Number(raw)
    // Sin valor guardado rige el predeterminado (las 3:00).
    return raw !== null && raw !== '' && Number.isInteger(v) && v >= 0 && v <= 5 ? v : 3
  } catch {
    return 3
  }
}

export function setDayEnd(hour: number) {
  try {
    localStorage.setItem(KEY, String(hour))
  } catch {
    // Sin almacenamiento disponible: vale solo para esta visita.
  }
}

/** El día "de hábitos" en curso. */
export function todayISO(now = new Date()): ISODate {
  return toISO(new Date(now.getTime() - getDayEnd() * 3_600_000))
}

/**
 * La hora del reloj como "HH:MM", para comparar con las horas de los avisos de hoy.
 * Pasada la medianoche y antes del cierre del día devuelve "24:00": hoy ya no queda nada por avisar.
 */
export function clockNow(now = new Date()): string {
  if (toISO(now) > todayISO(now)) return '24:00'
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
}
