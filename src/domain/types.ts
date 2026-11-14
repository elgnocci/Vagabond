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
  /** Frase de identidad: completa "Soy alguien que…". */
  identity?: string
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
  /** Versión de 2 minutos, para los días malos. */
  minVersion?: string
  /** Señal libre: completa "Después de…". */
  cue?: string
  /** Apilamiento: el hábito tras el cual se hace este. */
  anchorId?: string
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
