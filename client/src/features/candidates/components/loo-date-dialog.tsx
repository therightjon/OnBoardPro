import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { Button } from "@/shared/components/ui/button";
import { useToast } from "@/shared/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { DatePicker, parseAsLocalDate, formatDateForApi } from "@/shared/components/inputs/DatePicker";
import { AlertCircle } from "lucide-react";

type LooDateType = "issued" | "accepted";

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
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);

  const config = CONFIG[type];

  // Parse reference dates for validation (using local date parsing to avoid timezone issues)
  const loiDate = parseAsLocalDate(letterOfIntentDate);
  const issuedDate = parseAsLocalDate(offerLetterIssuedAt);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const updateMutation = useMutation({
    mutationFn: async (date: Date) => {
      const payload: Record<string, string | null> = {
        [config.field]: formatDateForApi(date),
      };
      // Include start date if provided (only for accepted type)
      if (type === "accepted" && startDate) {
        payload.anticipatedStartDate = formatDateForApi(startDate);
      }
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
      setStartDate(undefined);
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
    if (type === "accepted" && selectedDate) {
      const normalizedSelectedDate = new Date(selectedDate);
      normalizedSelectedDate.setHours(0, 0, 0, 0);
      if (normalizedSelectedDate > today) {
        toast({
          title: "Invalid date",
          description: "LOO accepted date cannot be in the future.",
          variant: "destructive",
        });
        return;
      }
    }

    if (selectedDate) {
      updateMutation.mutate(selectedDate);
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setSelectedDate(undefined);
      setStartDate(undefined);
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
      // LOO Accepted cannot be in the future
      if (d > today) {
        return true;
      }

      // LOO Accepted must be on or after LOO Issued date
      if (issuedDate && d < issuedDate) {
        return true;
      }
    }

    return false;
  };

  // Start date must be on or after the accepted date
  const isStartDateDisabled = (date: Date): boolean => {
    if (!selectedDate) return false;
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    const acceptedNormalized = new Date(selectedDate);
    acceptedNormalized.setHours(0, 0, 0, 0);
    return d < acceptedNormalized;
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[400px] max-h-min" data-testid={`dialog-loo-${type}`}>
        <DialogHeader>
          <DialogTitle>{config.title}</DialogTitle>
          <DialogDescription>{config.description}</DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-4">
          <div>
            <label className="text-sm font-medium mb-2 block">{config.label}</label>
            <DatePicker
              value={selectedDate}
              onChange={setSelectedDate}
              placeholder="Select a date"
              disabled={isDateDisabled}
              testId={`button-select-loo-${type}-date`}
            />
          </div>

          {type === "accepted" && (
            <>
              <div className="border-t pt-4">
                <div className="flex items-start gap-2 mb-2">
                  <label className="text-sm font-medium">Anticipated Start Date</label>
                  <span className="text-xs text-muted-foreground">(optional)</span>
                </div>
                {!startDate && (
                  <div className="flex items-start gap-2 p-2 mb-2 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-md">
                    <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                    <p className="text-xs text-amber-700 dark:text-amber-300">
                      Strongly recommended. The start date is used to calculate due dates for onboarding tasks.
                    </p>
                  </div>
                )}
                <DatePicker
                  value={startDate}
                  onChange={setStartDate}
                  placeholder="Select start date"
                  disabled={isStartDateDisabled}
                  testId="button-select-start-date"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Setting the LOO Accepted date will trigger template expansion and generate onboarding tasks.
              </p>
            </>
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
