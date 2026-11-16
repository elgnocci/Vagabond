import type { Chapter } from '../domain/chapters'

/** Un capítulo: el resumen escrito de una semana. */
export function ChapterSheet({ chapter }: { chapter: Chapter }) {
  return (
    <div className="chapter">
      <p className="mono">Capítulo {chapter.number} · {chapter.range}</p>
      <h2>{chapter.title}</h2>
      {chapter.lines.map((line, i) => <p key={i} className={i === 0 ? 'lead-line' : undefined}>{line}</p>)}
    </div>
  )
}
