/**
 * SettingsSection - Reusable wrapper for settings sections
 * Provides consistent styling, headings, and descriptions for settings groups
 */
import { ReactNode } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";

export interface SettingsSectionProps {
  /** Section title displayed in the header */
  title: string;
  /** Optional description text below the title */
  description?: string;
  /** Optional icon component displayed before the title */
  icon?: LucideIcon;
  /** Section content */
  children: ReactNode;
  /** Optional actions to display in the header (e.g., buttons) */
  actions?: ReactNode;
  /** Additional class names for the card */
  className?: string;
  /** Test ID for testing purposes */
  "data-testid"?: string;
}

export function SettingsSection({
  title,
  description,
  icon: Icon,
  children,
  actions,
  className,
  "data-testid": testId,
}: SettingsSectionProps) {
  return (
    <Card className={cn("", className)} data-testid={testId}>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2 text-lg">
            {Icon && <Icon className="h-5 w-5" />}
            {title}
          </CardTitle>
          {description && (
            <CardDescription>{description}</CardDescription>
          )}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export default SettingsSection;
