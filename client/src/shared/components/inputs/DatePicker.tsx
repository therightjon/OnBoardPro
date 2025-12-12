import { useState } from "react";
import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { Calendar } from "@/shared/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/components/ui/popover";
import { cn } from "@/lib/utils";

/**
 * Parse a date string or Date object as a local date, avoiding UTC timezone shifts.
 * This ensures that a date like "2025-11-28T00:00:00.000Z" displays as Nov 28 
 * regardless of the user's local timezone.
 */
export const parseAsLocalDate = (dateStr: string | Date | null | undefined): Date | null => {
  if (!dateStr) return null;
  
  if (dateStr instanceof Date) {
    if (isNaN(dateStr.getTime())) return null;
    // Use UTC components to avoid timezone shift
    return new Date(dateStr.getUTCFullYear(), dateStr.getUTCMonth(), dateStr.getUTCDate());
  }
  
  // For date-only strings (YYYY-MM-DD), parse as local date directly
  const dateOnlyRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (dateOnlyRegex.test(dateStr)) {
    const [year, month, day] = dateStr.split('-').map(Number);
    return new Date(year, month - 1, day);
  }
  
  // For full ISO strings, extract UTC date components to create local midnight
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  // Use UTC components to avoid timezone shift
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
};

/**
 * Format a Date object to YYYY-MM-DD string for API submission
 * Uses UTC components since Calendar component creates dates at UTC midnight
 */
export const formatDateForApi = (date: Date | null | undefined): string | null => {
  if (!date) return null;
  // Use UTC components to get the calendar date that was selected
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

interface DatePickerProps {
  /** Currently selected date (can be Date, ISO string, or null) */
  value?: Date | string | null;
  /** Callback when date changes */
  onChange: (date: Date | undefined) => void;
  /** Placeholder text when no date selected */
  placeholder?: string;
  /** Function to determine if a date should be disabled */
  disabled?: (date: Date) => boolean;
  /** Whether the entire picker is disabled */
  isDisabled?: boolean;
  /** Test ID for the trigger button */
  testId?: string;
  /** Additional class names for the trigger button */
  className?: string;
  /** Whether to show a clear button when a date is selected */
  showClear?: boolean;
  /** Callback when clear is clicked */
  onClear?: () => void;
}

export function DatePicker({
  value,
  onChange,
  placeholder = "Pick a date",
  disabled,
  isDisabled = false,
  testId,
  className,
  showClear = false,
  onClear,
}: DatePickerProps) {
  const [isOpen, setIsOpen] = useState(false);

  // Parse the value to a local Date
  const selectedDate = value ? parseAsLocalDate(value) ?? undefined : undefined;

  const handleSelect = (date: Date | undefined) => {
    onChange(date);
    setIsOpen(false);
  };

  const handleClear = () => {
    if (onClear) {
      onClear();
    } else {
      onChange(undefined);
    }
    setIsOpen(false);
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          disabled={isDisabled}
          className={cn(
            "w-full pl-3 text-left font-normal",
            !selectedDate && "text-muted-foreground",
            className
          )}
          data-testid={testId}
        >
          {selectedDate ? format(selectedDate, "PPP") : <span>{placeholder}</span>}
          <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selectedDate}
          onSelect={handleSelect}
          disabled={disabled}
          initialFocus
        />
        {showClear && selectedDate && (
          <div className="flex justify-end p-3 pt-0">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleClear}
            >
              Clear
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
