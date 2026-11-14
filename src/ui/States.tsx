
function Seed() {
  return (
    <div className="seed" aria-hidden="true">
      {Array.from({ length: 21 }, (_, i) => <i key={i} className={i === 10 ? 'one' : undefined} />)}
    </div>
  )
}

export function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="state">
      <Seed />
      <h2>Toda trama empieza con <em>un voto.</em></h2>
      <p>Cada vez que cumples un hábito, votas por la persona que quieres ser. Parte con uno pequeño.</p>
      <button className="btn" onClick={onCreate}>Crear mi primer hábito</button>
    </div>
  )
}

export function LoadingState() {
  return (
    <div aria-busy="true" aria-label="Cargando">
      <div className="sk hero-sk" />
      <div className="sk" />
      <div className="sk" />
      <div className="sk" />
    </div>
  )
}

export function ErrorState() {
  return (
    <div className="screen">
      <div className="state" role="alert">
        <Seed />
        <h2>No pudimos abrir tus datos.</h2>
        <p>Tus hábitos siguen guardados en este teléfono. Vuelve a intentarlo; si se repite, cierra la app y ábrela de nuevo.</p>
        <button className="btn" onClick={() => location.reload()}>Reintentar</button>
      </div>
    </div>
  )
}
