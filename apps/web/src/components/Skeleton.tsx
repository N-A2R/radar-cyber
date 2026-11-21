/**
 * États asynchrones partagés par les vues : trois lignes animées pendant un
 * appel réseau, et un état vide qui propose toujours une action concrète.
 * Le texte est rendu en clair dans les deux cas : jamais un squelette muet
 * pour les lecteurs d'écran, jamais une liste vide sans suite possible.
 */
import type { ReactNode } from "react";
import "./skeleton.css";

type SkeletonProps = {
  label?: string;
  className?: string;
};

export function LoadingSkeleton({ label = "Chargement…", className }: SkeletonProps) {
  return (
    <div
      className={className ? `skeleton ${className}` : "skeleton"}
      role="status"
      aria-live="polite"
    >
      <span className="skeleton__line" aria-hidden="true" />
      <span className="skeleton__line" aria-hidden="true" />
      <span className="skeleton__line" aria-hidden="true" />
      <span className="skeleton__label">{label}</span>
    </div>
  );
}

type EmptyStateProps = {
  message: ReactNode;
  actionLabel: string;
  onAction: () => void;
  className?: string;
  role?: "status" | "alert";
};

export function EmptyState({ message, actionLabel, onAction, className, role = "status" }: EmptyStateProps) {
  return (
    <div
      className={className ? `empty-state ${className}` : "empty-state"}
      role={role}
    >
      <p className="empty-state__message">{message}</p>
      <button type="button" className="empty-state__action" onClick={onAction}>
        {actionLabel}
      </button>
    </div>
  );
}
