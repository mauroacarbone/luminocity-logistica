export function Proximamente({
  title,
  description,
}: {
  title: string
  description: string
}) {
  return (
    <section className="page">
      <header className="page-header">
        <h1>{title}</h1>
        <p>{description}</p>
      </header>
      <div className="soon-card">
        Esta pantalla queda para el siguiente paso. El menú ya navega hasta acá.
      </div>
    </section>
  )
}
