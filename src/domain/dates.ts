/** Fecha local en formato YYYY-MM-DD. Se compara como texto. */
export type ISODate = string

const pad = (n: number) => String(n).padStart(2, '0')

export function toISO(d: Date): ISODate {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Mediodía local, para que los cambios de hora no muevan el día. */
export function fromISO(s: ISODate): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d, 12)
}

export function addDays(s: ISODate, n: number): ISODate {
  const d = fromISO(s)
  d.setDate(d.getDate() + n)
  return toISO(d)
}

/** 0 = lunes … 6 = domingo. */
export function weekdayMon(s: ISODate): number {
  return (fromISO(s).getDay() + 6) % 7
}

export function diffDays(a: ISODate, b: ISODate): number {
  return Math.round((fromISO(b).getTime() - fromISO(a).getTime()) / 86_400_000)
}

export function startOfWeek(s: ISODate): ISODate {
  return addDays(s, -weekdayMon(s))
}

export function startOfMonth(s: ISODate): ISODate {
  return s.slice(0, 8) + '01'
}

export function periodStart(s: ISODate, period: 'week' | 'month'): ISODate {
  return period === 'week' ? startOfWeek(s) : startOfMonth(s)
}

export function periodEnd(start: ISODate, period: 'week' | 'month'): ISODate {
  if (period === 'week') return addDays(start, 6)
  const d = fromISO(start)
  return toISO(new Date(d.getFullYear(), d.getMonth() + 1, 0, 12))
}

export function prevPeriodStart(start: ISODate, period: 'week' | 'month'): ISODate {
  if (period === 'week') return addDays(start, -7)
  const d = fromISO(start)
  return toISO(new Date(d.getFullYear(), d.getMonth() - 1, 1, 12))
}

const DAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

/** "Sábado 14 nov" */
export function formatDay(s: ISODate): string {
  const d = fromISO(s)
  return `${DAYS[weekdayMon(s)]} ${d.getDate()} ${MONTHS[d.getMonth()]}`
}

/** "14 nov" */
export function formatShort(s: ISODate): string {
  const d = fromISO(s)
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`
}
