/**
 * DangerZone - Container for destructive/high-risk actions
 * Visually distinct with warnings and requires explicit confirmation
 */
import { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { AlertTriangle } from "lucide-react";

export interface DangerZoneProps {
  /** Section title */
  title?: string;
  /** Warning description */
  description?: string;
  /** Destructive actions/buttons */
  children: ReactNode;
  /** Additional class names */
  className?: string;
}

export function DangerZone({
  title = "Danger Zone",
  description,
  children,
  className,
}: DangerZoneProps) {
  return (
    <div
      className={cn(
        "rounded-lg border-2 border-destructive/30 bg-destructive/5 p-4 space-y-4",
        className
      )}
    >
      <div className="flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
        <div className="space-y-1">
          <h4 className="font-semibold text-destructive">{title}</h4>
          {description && (
            <p className="text-sm text-muted-foreground">{description}</p>
          )}
        </div>
      </div>
      <div className="pl-8">{children}</div>
    </div>
  );
}

export default DangerZone;
