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

/** Una de las veces del día en que se hace un hábito, con su propia señal y hora de aviso. */
export interface Slot {
  moment: Moment
  cue?: string
  remindAt?: string
}

export interface Habit {
  id: string
  tramaId: string
  /** Segunda trama a la que también suma votos (opcional). */
  tramaId2?: string
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
  /** Hora del recordatorio, "HH:MM". */
  remindAt?: string
  /** Varias veces al día: una entrada por momento. Si falta, el hábito se hace una vez, en `moment`. */
  slots?: Slot[]
  /** Recompensa atada al hábito: completa "Y después, me doy…". */
  reward?: string
  /** Posición en la lista. Si falta, se ordena por fecha de creación. */
  order?: number
  /** Desde cuándo rige el ritmo actual. Los días anteriores no se reinterpretan. */
  rhythmSince?: ISODate
  /** Racha que traía el hábito cuando se cambió el ritmo; se suma mientras no se rompa. */
  streakCarry?: number
  createdOn: ISODate
  createdAt: number
  archived: boolean
}

/** El registro de un hábito en un día. Vale un voto, o uno por cada momento hecho si el hábito tiene varios. */
export interface Log {
  habitId: string
  date: ISODate
  state: 'full' | 'min'
  at: number
  /** Solo en hábitos de varias veces al día: los momentos hechos. */
  slots?: Moment[]
}

/** Cierre de un día de algo que se está dejando: queda fijo aunque después cambie el plan. */
export interface Closure {
  habitId: string
  date: ISODate
  limit: number
  ok: boolean
}

/** Período en pausa (enfermedad, viaje): esos días no cuentan a favor ni en contra. */
export interface Pause {
  from: ISODate
  /** Último día en pausa, incluido. Si falta, la pausa sigue abierta. */
  to?: ISODate
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

export interface ReminderSettings {
  enabled: boolean
  /** Aviso de rescate: uno al día si a esa hora todavía queda algo pendiente. */
  rescue: boolean
  rescueAt: string
}

export const DEFAULT_REMINDERS: ReminderSettings = { enabled: false, rescue: true, rescueAt: '20:30' }

/** Ajustes guardados junto a los datos (y por eso incluidos en el respaldo). */
export interface Meta {
  key: string
  value: unknown
}
