import { FieldError } from '../admin/forms'

// A labelled control with an optional hint and a field-level error, linked by id.
export function OfficeField({ label, optional = false, htmlFor, hint, hintId, error, errorId, className = '', children }) {
  return (
    <div className={`admin-field ${className}`.trim()}>
      <label className="admin-label" htmlFor={htmlFor}>
        {label}
        {optional && <span className="office-optional"> · opcional</span>}
      </label>
      {children}
      {hint && <small id={hintId}>{hint}</small>}
      <FieldError id={errorId}>{error}</FieldError>
    </div>
  )
}

// Skeleton rows that follow the list layout while data loads.
export function ListSkeleton({ label, rows = 4 }) {
  return (
    <div className="office-list-skeleton" role="status">
      <span className="ds-visually-hidden">{label}</span>
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} aria-hidden="true">
          <span className="ds-skeleton ds-skeleton--circle" />
          <span className="office-list-skeleton__lines">
            <span className="ds-skeleton ds-skeleton--text" />
            <span className="ds-skeleton ds-skeleton--text" />
          </span>
        </div>
      ))}
    </div>
  )
}
