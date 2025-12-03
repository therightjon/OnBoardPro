/**
 * SettingsGroup - Groups related settings fields with a label and description
 * Used within SettingsSection for organized field grouping
 */
import { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface SettingsGroupProps {
  /** Group label/heading */
  label: string;
  /** Optional description text */
  description?: string;
  /** Group content (typically form fields) */
  children: ReactNode;
  /** Additional class names */
  className?: string;
  /** Visual variant */
  variant?: "default" | "compact";
}

export function SettingsGroup({
  label,
  description,
  children,
  className,
  variant = "default",
}: SettingsGroupProps) {
  return (
    <div className={cn("space-y-4", className)}>
      <div className={cn(variant === "compact" ? "space-y-0.5" : "space-y-1")}>
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </h3>
        {description && (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

export default SettingsGroup;
