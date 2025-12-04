import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { Button } from "@/shared/components/ui/button";
import { Calendar } from "@/shared/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/components/ui/popover";
import { useToast } from "@/shared/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";

type LooDateType = "issued" | "accepted";

// Helper to parse date string as local date (avoids UTC timezone issues)
const parseAsLocalDate = (dateStr: string | Date | null | undefined): Date | null => {
  if (!dateStr) return null;
  if (dateStr instanceof Date) {
    const d = new Date(dateStr);
    d.setHours(0, 0, 0, 0);
    return d;
  }
  // For date-only strings (YYYY-MM-DD), parse as local date
  const dateOnlyRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (dateOnlyRegex.test(dateStr)) {
    const [year, month, day] = dateStr.split('-').map(Number);
    return new Date(year, month - 1, day);
  }
  // For full ISO strings, parse and normalize to local midnight
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  d.setHours(0, 0, 0, 0);
  return d;
};

interface LooDateDialogProps {
  candidateId: string;
  type: LooDateType;
  /** LOI date for validation (LOO Issued must be on or after LOI date) */
  letterOfIntentDate?: string | Date | null;
  /** LOO Issued date for validation (LOO Accepted must be on or after LOO Issued) */
  offerLetterIssuedAt?: string | Date | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

const CONFIG: Record<LooDateType, {
  title: string;
  description: string;
  label: string;
  field: "offerLetterIssuedAt" | "offerLetterAcceptedAt";
  successMessage: string;
}> = {
  issued: {
    title: "Record LOO Issued Date",
    description: "Enter the date when the Letter of Offer was sent to the candidate.",
    label: "LOO Issued Date",
    field: "offerLetterIssuedAt",
    successMessage: "LOO Issued date recorded successfully",
  },
  accepted: {
    title: "Record LOO Accepted Date",
    description: "Enter the date when the candidate accepted the Letter of Offer. This will activate their onboarding tasks.",
    label: "LOO Accepted Date",
    field: "offerLetterAcceptedAt",
    successMessage: "LOO Accepted date recorded successfully. Onboarding tasks have been generated.",
  },
};

export function LooDateDialog({
  candidateId,
  type,
  letterOfIntentDate,
  offerLetterIssuedAt,
  open,
  onOpenChange,
  onSuccess,
}: LooDateDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);

  const config = CONFIG[type];

  // Parse reference dates for validation (using local date parsing to avoid timezone issues)
  const loiDate = parseAsLocalDate(letterOfIntentDate);
  const issuedDate = parseAsLocalDate(offerLetterIssuedAt);

  const updateMutation = useMutation({
    mutationFn: async (date: Date) => {
      const payload = {
        [config.field]: format(date, "yyyy-MM-dd"),
      };
      const response = await apiRequest("PATCH", `/api/candidates/${candidateId}`, payload);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: config.successMessage,
      });

      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: ["/api/candidates", candidateId] });
      queryClient.invalidateQueries({ queryKey: ["/api/candidates", candidateId, "tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/candidates"] });

      // Reset state and close
      setSelectedDate(undefined);
      onOpenChange(false);
      onSuccess?.();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update date",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = () => {
    if (selectedDate) {
      updateMutation.mutate(selectedDate);
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setSelectedDate(undefined);
    }
    onOpenChange(newOpen);
  };

  // Date validation based on type
  const isDateDisabled = (date: Date): boolean => {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);

    if (type === "issued") {
      // LOO Issued must be on or after LOI date
      if (loiDate && d < loiDate) {
        return true;
      }
    } else if (type === "accepted") {
      // LOO Accepted must be on or after LOO Issued date
      if (issuedDate && d < issuedDate) {
        return true;
      }
    }

    return false;
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[400px] max-h-min" data-testid={`dialog-loo-${type}`}>
        <DialogHeader>
          <DialogTitle>{config.title}</DialogTitle>
          <DialogDescription>{config.description}</DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <label className="text-sm font-medium mb-2 block">{config.label}</label>
          <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "w-full justify-start text-left font-normal",
                  !selectedDate && "text-muted-foreground"
                )}
                data-testid={`button-select-loo-${type}-date`}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {selectedDate ? format(selectedDate, "PPP") : "Select a date"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={(date) => {
                  setSelectedDate(date);
                  setIsCalendarOpen(false);
                }}
                disabled={isDateDisabled}
                initialFocus
              />
            </PopoverContent>
          </Popover>

          {type === "accepted" && (
            <p className="text-xs text-muted-foreground mt-2">
              Setting this date will trigger template expansion and generate onboarding tasks.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            data-testid={`button-cancel-loo-${type}`}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!selectedDate || updateMutation.isPending}
            data-testid={`button-confirm-loo-${type}`}
          >
            {updateMutation.isPending ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
