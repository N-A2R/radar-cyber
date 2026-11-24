/**
 * Message d'erreur partagé par les vues : le texte dit ce qui a échoué, le
 * bouton offre la seule action utile — rejouer la requête.
 */
import { Button } from "@astryxdesign/core/Button";
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
        <Button label="Réessayer" className="error-retry__button" onClick={onRetry} />
      ) : null}
    </div>
  );
}
