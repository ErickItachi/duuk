export default function BrandLoader({
  label = "Preparando seu espaço",
  detail,
  leaving = false,
}) {
  return (
    <div
      className={`duuk-loader${leaving ? " is-leaving" : ""}`}
      role="status"
      aria-live="polite"
    >
      <div className="duuk-loader__content">
        <img
          src="/media/duuk-logo-white.png"
          alt="DUUK"
          width="718"
          height="886"
          fetchPriority="high"
        />
        <span className="duuk-loader__track" aria-hidden="true">
          <span />
        </span>
        <p>{label}</p>
        {detail && <small>{detail}</small>}
      </div>
    </div>
  );
}
