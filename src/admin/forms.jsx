export function Field({ label, value, onChange, children, ...props }) {
  return (
    <label className="admin-field">
      <span>{label}</span>
      {children || (
        <input
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
          {...props}
        />
      )}
    </label>
  );
}
export function PageTitle({ eyebrow, title, description, children }) {
  return (
    <div className="admin-page-title">
      <div>
        <p className="admin-eyebrow">{eyebrow || "DUUK / EQUIPE"}</p>
        <h1>
          {title}
          <span>.</span>
        </h1>
        {description && <p>{description}</p>}
      </div>
      {children && <div className="admin-title-actions">{children}</div>}
    </div>
  );
}
export function QueryState({
  query,
  children,
  empty = "Nenhum registro por aqui ainda.",
}) {
  if (query.loading && !query.data) return <LoadingPanel />;
  if (query.error && !query.data)
    return (
      <div className="admin-error" role="alert">
        {query.error}
        <button className="admin-text-button" onClick={query.reload}>
          Tentar novamente
        </button>
      </div>
    );
  if (!query.data)
    return (
      <div className="admin-panel admin-empty">
        <p>{empty}</p>
      </div>
    );
  return (
    <>
      {query.error && (
        <p className="admin-error" role="alert">
          {query.error}{" "}
          <button className="admin-text-button" onClick={query.reload}>
            Tentar novamente
          </button>
        </p>
      )}
      {children}
    </>
  );
}
export function LoadingPanel({ label = "Carregando seu espaço…" }) {
  return (
    <div className="admin-panel admin-query-skeleton" role="status">
      <p>{label}</p>
      <span aria-hidden="true" />
      <span aria-hidden="true" />
      <span aria-hidden="true" />
    </div>
  );
}
export function Avatar({ profile, size = 36 }) {
  return (
    <span className="admin-avatar" style={{ width: size, height: size }}>
      {profile?.avatar_url ? (
        <img src={profile.avatar_url} alt="" />
      ) : (
        <span>
          {(profile?.name || "DUUK")
            .split(" ")
            .slice(0, 2)
            .map((s) => s[0])
            .join("")}
        </span>
      )}
    </span>
  );
}
