import { Icon } from "./components";
import { pageList } from "./ds/list";

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
    return <ErrorState onRetry={query.reload}>{query.error}</ErrorState>;
  if (!query.data)
    return (
      <div className="admin-panel">
        <EmptyState>{empty}</EmptyState>
      </div>
    );
  return (
    <>
      {query.error && (
        <ErrorState onRetry={query.reload}>{query.error}</ErrorState>
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
export function Avatar({ profile, size = 36, online = false }) {
  const avatar = (
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
  return online ? (
    <span className="admin-avatar-presence" title="Online agora">
      {avatar}
      <i aria-hidden="true" />
    </span>
  ) : avatar;
}

// Visible error with an optional retry. Network failures keep the data already on screen.
export function ErrorState({ children, onRetry, retryLabel = "Tentar novamente" }) {
  return (
    <div className="admin-error" role="alert">
      <Icon name="alertCircle" />
      <span>{children}</span>
      {onRetry && (
        <button type="button" className="admin-text-button" onClick={onRetry}>
          {retryLabel}
        </button>
      )}
    </div>
  );
}
export function EmptyState({ icon = "inbox", title, children, action }) {
  return (
    <div className="ds-empty">
      {icon && <Icon name={icon} className="ds-empty__icon" />}
      {title && <h3>{title}</h3>}
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}
// Field-level validation message; link it to the input with aria-describedby.
export function FieldError({ id, children }) {
  if (!children) return null;
  return (
    <p className="ds-field-error" id={id}>
      <Icon name="alertCircle" />
      <span>{children}</span>
    </p>
  );
}
export function SearchField({ value, onChange, label = "Buscar", placeholder, className = "" }) {
  return (
    <label className={`admin-search ${className}`.trim()}>
      <Icon name="search" />
      <span className="ds-visually-hidden">{label}</span>
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder || `${label}…`}
        autoComplete="off"
        spellCheck={false}
      />
    </label>
  );
}
// Pairs with usePagination from ./ds/list. Renders nothing when everything fits on one page.
export function Pagination({ pager, noun = "itens", label = "Paginação" }) {
  if (pager.pageCount <= 1) return null;
  const go = (page) => pager.setPage(page);
  return (
    <nav className="ds-pagination" aria-label={label}>
      <p>
        {pager.from}–{pager.to} de {pager.total} {noun}
      </p>
      <div className="ds-pagination__pages">
        <button
          type="button"
          aria-label="Página anterior"
          disabled={pager.page === 1}
          onClick={() => go(pager.page - 1)}
        >
          <Icon name="left" size={16} />
        </button>
        {pageList(pager.page, pager.pageCount).map((page) =>
          typeof page === "string" ? (
            <span key={page} className="ds-pagination__gap" aria-hidden="true">
              …
            </span>
          ) : (
            <button
              key={page}
              type="button"
              aria-label={`Página ${page}`}
              aria-current={page === pager.page ? "page" : undefined}
              onClick={() => go(page)}
            >
              {page}
            </button>
          ),
        )}
        <button
          type="button"
          aria-label="Próxima página"
          disabled={pager.page === pager.pageCount}
          onClick={() => go(pager.page + 1)}
        >
          <Icon name="right" size={16} />
        </button>
      </div>
    </nav>
  );
}
