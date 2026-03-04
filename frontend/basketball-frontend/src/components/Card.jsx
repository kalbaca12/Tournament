export default function Card({ title, actions, children }) {
  return (
    <section className="panel">
      {(title || actions) && (
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
          <div className="flex items-center gap-2">{actions}</div>
        </div>
      )}
      <div className="px-5 py-5">{children}</div>
    </section>
  );
}

