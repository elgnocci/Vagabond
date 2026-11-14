import type { ISODate } from './dates'

export type TramaColor = 'teal' | 'lila' | 'rosa' | 'lima' | 'cielo'
export const TRAMA_COLORS: TramaColor[] = ['teal', 'lila', 'rosa', 'lima', 'cielo']

export type Moment = 'morning' | 'afternoon' | 'night'
export type Period = 'week' | 'month'

/** Cada cuánto se hace un hábito. `days` usa 0 = lunes … 6 = domingo. */
export type Rhythm =
  | { kind: 'days'; days: number[] }
  | { kind: 'quota'; period: Period; times: number }

export interface Trama {
  id: string
  name: string
  color: TramaColor
  order: number
  createdAt: number
}

export interface Habit {
  id: string
  tramaId: string
  name: string
  moment: Moment
  rhythm: Rhythm
  createdOn: ISODate
  createdAt: number
  archived: boolean
}

/** Un registro = un voto. Como máximo uno por hábito y día. */
export interface Log {
  habitId: string
  date: ISODate
  state: 'full' | 'min'
  at: number
}
