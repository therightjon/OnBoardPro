/**
 * ThemeSettings - Personal theme preference settings
 * Allows users to choose between light, dark, and system themes
 */
import { Palette, Sun, Moon, Monitor } from "lucide-react";
import { useTheme } from "@/shared/components/layout/theme-provider";
import { SettingsSection } from "@/shared/components/settings/SettingsSection";
import { SettingsGroup } from "@/shared/components/settings/SettingsGroup";
import { SettingsRow } from "@/shared/components/settings/SettingsRow";
import { Switch } from "@/shared/components/ui/switch";
import { cn } from "@/lib/utils";

interface ThemeOptionProps {
  value: "light" | "dark" | "system";
  current: string;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  description: string;
  testId: string;
}

function ThemeOption({ value, current, onClick, icon, label, description, testId }: ThemeOptionProps) {
  const isSelected = current === value;
  
  return (
    <div
      className={cn(
        "border-2 rounded-lg p-4 cursor-pointer transition-all",
        isSelected 
          ? "border-primary bg-primary/5 shadow-sm" 
          : "border-border hover:border-primary/50 hover:bg-muted/50"
      )}
      onClick={onClick}
      data-testid={testId}
      role="radio"
      aria-checked={isSelected}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
    >
      <div className="flex items-center space-x-3">
        <div className={cn(
          "p-2 rounded-md",
          isSelected ? "bg-primary/10 text-primary" : "bg-muted"
        )}>
          {icon}
        </div>
        <div>
          <p className="font-medium">{label}</p>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
    </div>
  );
}

export function ThemeSettings() {
  const { theme, setTheme } = useTheme();

  return (
    <SettingsSection
      title="Appearance"
      description="Customize how the application looks and feels"
      icon={Palette}
      data-testid="settings-section-theme"
    >
      <div className="space-y-8">
        {/* Theme Selection */}
        <SettingsGroup
          label="Color Theme"
          description="Choose your preferred color scheme for the application"
        >
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <ThemeOption
              value="light"
              current={theme}
              onClick={() => setTheme("light")}
              icon={<Sun className="w-5 h-5" />}
              label="Light"
              description="Clean and bright"
              testId="theme-light"
            />
            <ThemeOption
              value="dark"
              current={theme}
              onClick={() => setTheme("dark")}
              icon={<Moon className="w-5 h-5" />}
              label="Dark"
              description="Easy on the eyes"
              testId="theme-dark"
            />
            <ThemeOption
              value="system"
              current={theme}
              onClick={() => setTheme("system")}
              icon={<Monitor className="w-5 h-5" />}
              label="System"
              description="Follow OS preference"
              testId="theme-system"
            />
          </div>
        </SettingsGroup>

        {/* Display Options */}
        <div className="border-t pt-6">
          <SettingsGroup
            label="Display Options"
            description="Additional display preferences"
          >
            <SettingsRow
              label="Compact Mode"
              helperText="Reduce spacing for higher information density"
            >
              <Switch data-testid="switch-compact-mode" />
            </SettingsRow>
            
            <SettingsRow
              label="Show Tooltips"
              helperText="Display helpful hints throughout the application"
            >
              <Switch defaultChecked data-testid="switch-tooltips" />
            </SettingsRow>
          </SettingsGroup>
        </div>
      </div>
    </SettingsSection>
  );
}

export default ThemeSettings;
