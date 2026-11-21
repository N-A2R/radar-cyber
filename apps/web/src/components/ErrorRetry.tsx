/**
 * Message d'erreur partagé par les vues : le texte dit ce qui a échoué, le
 * bouton offre la seule action utile — rejouer la requête.
 */
export function ErrorRetry({
  message,
  onRetry,
  className = "",
}: {
  message: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div className={`error-retry${className ? ` ${className}` : ""}`} role="alert">
      <span className="error-retry__message">{message}</span>
      {onRetry ? (
        <button type="button" className="error-retry__button" onClick={onRetry}>
          Réessayer
        </button>
      ) : null}
    </div>
  );
}
