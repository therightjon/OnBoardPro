/**
 * ColorPickerPopover — A color picker with preset palette, custom hex input, and clear option.
 *
 * Used in the Tiptap toolbar for text-color and highlight-color,
 * and in the global email layout settings for brand colors.
 */
import { useState, useCallback } from "react";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/shared/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";

// ============================================================================
// Preset palette — 16 curated email-safe colors
// ============================================================================

const PRESET_COLORS = [
  // Row 1 — neutrals + dark
  { hex: "#000000", label: "Black" },
  { hex: "#1e293b", label: "Slate 800" },
  { hex: "#374151", label: "Gray 700" },
  { hex: "#6b7280", label: "Gray 500" },
  // Row 2 — brand / accents
  { hex: "#ef4444", label: "Red 500" },
  { hex: "#f97316", label: "Orange 500" },
  { hex: "#eab308", label: "Yellow 500" },
  { hex: "#22c55e", label: "Green 500" },
  // Row 3 — blue / cool
  { hex: "#3b82f6", label: "Blue 500" },
  { hex: "#6366f1", label: "Indigo 500" },
  { hex: "#8b5cf6", label: "Violet 500" },
  { hex: "#ec4899", label: "Pink 500" },
  // Row 4 — light / pastel
  { hex: "#ffffff", label: "White" },
  { hex: "#f1f5f9", label: "Slate 100" },
  { hex: "#dbeafe", label: "Blue 100" },
  { hex: "#dcfce7", label: "Green 100" },
] as const;

// ============================================================================
// Types
// ============================================================================

interface ColorPickerPopoverProps {
  /** Currently selected color (hex), or null if none */
  currentColor: string | null;
  /** Called when user picks a color or clears */
  onSelect: (color: string | null) => void;
  /** Trigger element — renders inside the popover trigger */
  children: React.ReactNode;
  /** Tooltip label */
  title?: string;
  /** Whether to show the clear button (default: true) */
  showClear?: boolean;
  /** Popover alignment */
  align?: "start" | "center" | "end";
}

// ============================================================================
// Component
// ============================================================================

export function ColorPickerPopover({
  currentColor,
  onSelect,
  children,
  title,
  showClear = true,
  align = "start",
}: ColorPickerPopoverProps) {
  const [customHex, setCustomHex] = useState(currentColor ?? "");
  const [open, setOpen] = useState(false);

  const handleSelect = useCallback(
    (color: string | null) => {
      onSelect(color);
      setOpen(false);
    },
    [onSelect],
  );

  const handleCustomApply = useCallback(() => {
    const trimmed = customHex.trim();
    if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(trimmed)) {
      handleSelect(trimmed);
    }
  }, [customHex, handleSelect]);

  const trigger = title ? (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>{children}</PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">
          {title}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  ) : (
    <PopoverTrigger asChild>{children}</PopoverTrigger>
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      {trigger}
      <PopoverContent className="w-[220px] p-3" align={align}>
        {/* Preset grid */}
        <div className="grid grid-cols-4 gap-1.5 mb-3">
          {PRESET_COLORS.map(({ hex, label }) => (
            <button
              key={hex}
              type="button"
              title={label}
              className={cn(
                "h-7 w-full rounded border transition-all hover:scale-110",
                currentColor === hex
                  ? "ring-2 ring-primary ring-offset-1"
                  : "border-border",
                hex === "#ffffff" && "border-gray-300",
              )}
              style={{ backgroundColor: hex }}
              onClick={() => handleSelect(hex)}
            />
          ))}
        </div>

        {/* Custom hex input */}
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Custom hex</Label>
          <div className="flex gap-1.5">
            <div className="relative flex-1">
              <Input
                value={customHex}
                onChange={(e) => setCustomHex(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleCustomApply();
                  }
                }}
                placeholder="#000000"
                className="text-xs h-8 pl-8"
              />
              {/* Color preview swatch */}
              <div
                className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 rounded border border-border"
                style={{
                  backgroundColor: /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(
                    customHex.trim(),
                  )
                    ? customHex.trim()
                    : "transparent",
                }}
              />
            </div>
            <Button
              size="sm"
              variant="outline"
              className="h-8 px-2 text-xs"
              onClick={handleCustomApply}
            >
              Apply
            </Button>
          </div>
        </div>

        {/* Clear */}
        {showClear && (
          <Button
            variant="ghost"
            size="sm"
            className="w-full mt-2 h-7 text-xs text-muted-foreground"
            onClick={() => handleSelect(null)}
          >
            <X className="h-3 w-3 mr-1" />
            Clear color
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}
