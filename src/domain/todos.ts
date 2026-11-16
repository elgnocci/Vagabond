import { addDays, diffDays, formatDay, formatShort, type ISODate } from './dates'
import type { Todo } from './types'

export interface TodoGroups {
  overdue: Todo[]
  today: Todo[]
  upcoming: Todo[]
  undated: Todo[]
  done: Todo[]
}

const byDue = (a: Todo, b: Todo) => (a.due! < b.due! ? -1 : a.due! > b.due! ? 1 : a.createdAt - b.createdAt)

export function groupTodos(todos: Todo[], today: ISODate): TodoGroups {
  const open = todos.filter((t) => !t.done)
  const dated = open.filter((t) => t.due).sort(byDue)
  return {
    overdue: dated.filter((t) => t.due! < today),
    today: dated.filter((t) => t.due === today),
    upcoming: dated.filter((t) => t.due! > today),
    undated: open.filter((t) => !t.due).sort((a, b) => a.createdAt - b.createdAt),
    done: todos.filter((t) => t.done).sort((a, b) => (b.doneAt ?? 0) - (a.doneAt ?? 0)),
  }
}

/** Lo que se muestra en Hoy: atrasados, los de hoy y los de los próximos días. */
export function todosForToday(todos: Todo[], today: ISODate, days = 7): Todo[] {
  const until = addDays(today, days)
  return todos.filter((t) => !t.done && t.due && t.due <= until).sort(byDue)
}

/** "Hoy", "Mañana", "Ayer", "Martes 17" si falta menos de una semana, o "17 nov". */
export function dueLabel(due: ISODate, today: ISODate): string {
  const d = diffDays(today, due)
  if (d === 0) return 'Hoy'
  if (d === 1) return 'Mañana'
  if (d === -1) return 'Ayer'
  if (d > 1 && d < 7) return formatDay(due).split(' ').slice(0, 2).join(' ')
  return formatShort(due)
}
