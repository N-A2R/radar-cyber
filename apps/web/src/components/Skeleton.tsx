/** États asynchrones partagés : le rendu visuel appartient à Astryx. */
import "./skeleton.css";
import { Button } from "@astryxdesign/core/Button";
import { EmptyState as AstryxEmptyState } from "@astryxdesign/core/EmptyState";
import { Skeleton as AstryxSkeleton } from "@astryxdesign/core/Skeleton";

type SkeletonProps = {
  label?: string;
  className?: string;
};

export function LoadingSkeleton({ label = "Chargement…", className }: SkeletonProps) {
  return (
    <div className={className ? `skeleton ${className}` : "skeleton"} role="status" aria-live="polite">
      {[0, 1, 2].map((i) => (
        <AstryxSkeleton key={i} className="skeleton__line" aria-hidden="true" />
      ))}
      <span className="skeleton__label">{label}</span>
    </div>
  );
}

type EmptyStateProps = {
  message: string;
  description?: string;
  actionLabel: string;
  onAction: () => void;
  className?: string;
  role?: "status" | "alert";
};

export function EmptyState({ message, description, actionLabel, onAction, className, role = "status" }: EmptyStateProps) {
  return (
    <AstryxEmptyState
      className={className}
      role={role}
      title={message}
      description={description}
      headingLevel={3}
      isCompact
      actions={<Button label={actionLabel} onClick={onAction} />}
    />
  );
}
