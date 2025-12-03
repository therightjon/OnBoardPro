/**
 * SettingsRow - A single row within a settings group
 * Provides consistent layout for label + control pairs
 */
import { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Label } from "@/shared/components/ui/label";

export interface SettingsRowProps {
  /** Row label */
  label: string;
  /** Optional helper text below the label */
  helperText?: string;
  /** The control element (switch, input, select, etc.) */
  children: ReactNode;
  /** Additional class names */
  className?: string;
  /** HTML for attribute to associate label with input */
  htmlFor?: string;
  /** Layout variant */
  variant?: "horizontal" | "vertical";
}

export function SettingsRow({
  label,
  helperText,
  children,
  className,
  htmlFor,
  variant = "horizontal",
}: SettingsRowProps) {
  if (variant === "vertical") {
    return (
      <div className={cn("space-y-2", className)}>
        <div>
          <Label htmlFor={htmlFor} className="font-medium">
            {label}
          </Label>
          {helperText && (
            <p className="text-sm text-muted-foreground">{helperText}</p>
          )}
        </div>
        {children}
      </div>
    );
  }

  return (
    <div className={cn("flex items-center justify-between gap-4", className)}>
      <div className="min-w-0 flex-1">
        <Label htmlFor={htmlFor} className="font-medium">
          {label}
        </Label>
        {helperText && (
          <p className="text-sm text-muted-foreground">{helperText}</p>
        )}
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  );
}

export default SettingsRow;
