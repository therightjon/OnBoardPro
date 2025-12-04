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

  const config = CONFIG[type];

  // Parse reference dates for validation (using local date parsing to avoid timezone issues)
  const loiDate = parseAsLocalDate(letterOfIntentDate);
  const issuedDate = parseAsLocalDate(offerLetterIssuedAt);

  const updateMutation = useMutation({
    mutationFn: async (date: Date) => {
      const payload = {
        [config.field]: formatDateForApi(date),
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
          <DatePicker
            value={selectedDate}
            onChange={setSelectedDate}
            placeholder="Select a date"
            disabled={isDateDisabled}
            testId={`button-select-loo-${type}-date`}
          />

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
