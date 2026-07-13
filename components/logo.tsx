export function OrsLogo({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`brand ${compact ? "brand--compact" : ""}`}>
      <div className="brand__mark" aria-hidden="true">
        <svg viewBox="0 0 44 44" role="img">
          <path d="M8 31V21h6v10H8Zm11 0V14h6v17h-6Zm11 0V8h6v23h-6Z" />
          <path d="m8 16 9-7 7 4 12-9" className="brand__arrow" />
          <path d="m30 4h6v6" className="brand__arrow" />
        </svg>
      </div>
      {!compact && (
        <div className="brand__copy">
          <strong>ORS</strong>
          <span>CONNECT</span>
        </div>
      )}
    </div>
  );
}
