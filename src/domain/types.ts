import type { ISODate } from './dates'

export type TramaColor = 'teal' | 'lila' | 'rosa' | 'lima' | 'cielo'
/** Orden fijo: así se asignan a las tramas nuevas y así se distinguen mejor entre vecinos. */
export const TRAMA_COLORS: TramaColor[] = ['teal', 'lila', 'lima', 'rosa', 'cielo']

export type Moment = 'morning' | 'afternoon' | 'night'
export type Period = 'week' | 'month'

/** Cada cuánto se hace un hábito. `days` usa 0 = lunes … 6 = domingo. */
export type Rhythm =
  | { kind: 'days'; days: number[] }
  | { kind: 'quota'; period: Period; times: number }

export interface ReduceStage {
  from: ISODate
  /** Tope diario desde esa fecha. */
  limit: number
}

/** Plan para dejar algo: topes que bajan por etapas hasta llegar a cero en `quitDate`. */
export interface ReducePlan {
  stages: ReduceStage[]
  quitDate: ISODate
}

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
  /** 'reduce' = algo que se quiere dejar (tabaco). Si falta, es un hábito a construir. */
  kind?: 'build' | 'reduce'
  plan?: ReducePlan
  /** Qué hacer cuando venga el antojo: completa "Voy a…". */
  urgePlan?: string
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

/** Una vez que se consumió lo que se quiere dejar (un cigarro). */
export interface Use {
  id?: number
  habitId: string
  date: ISODate
  at: number
}

/** Un antojo resistido. Cada uno es un voto. */
export interface Urge {
  id?: number
  habitId: string
  date: ISODate
  at: number
}

/** Un voto, venga de donde venga. */
export interface Vote {
  habitId: string
  date: ISODate
}

/** Algo que hay que hacer una vez y no es un hábito (ir al dentista). No da votos. */
export interface Todo {
  id: string
  title: string
  due?: ISODate
  done: boolean
  doneAt?: number
  createdAt: number
}
