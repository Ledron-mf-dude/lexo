export default function Placeholder({ title }: { title: string }) {
  return (
    <section className="glass rounded-3xl p-8">
      <h1 className="text-3xl font-light tracking-tight">{title}</h1>
      <p className="mt-2 text-white/50">Розділ у розробці.</p>
    </section>
  )
}
