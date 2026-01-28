import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, } from "@/shared/components/ui/alert-dialog";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiRequest } from "@/lib/queryClient";

type Status = "draft" | "active" | "archived";

interface TemplateStatusControlProps {
  templateId: string;
  value: Status;
  canEdit: boolean;
}

export function TemplateStatusControl({ templateId, value, canEdit }: TemplateStatusControlProps) {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMsg, setDialogMsg] = useState("");

  const { data: readiness } = useQuery({
    queryKey: ["templateReadiness", templateId],
    queryFn: async () => {
      const response = await apiRequest("GET", `/api/templates/${templateId}/readiness`);
      return response.json();
    },
    enabled: !!templateId,
  });

  const mutate = useMutation({
    mutationFn: async (nextStatus: Status) => {
      const response = await apiRequest("PATCH", `/api/templates/${templateId}/status`, {
        status: nextStatus,
      });
      if (!response.ok) {
        const error = await response.json();
        throw error;
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/templates"] });
      queryClient.invalidateQueries({ queryKey: ["/api/templates", templateId] });
      queryClient.invalidateQueries({ queryKey: ["templateReadiness", templateId] });
      toast.success("Template status updated");
    },
    onError: (error: any) => {
      const message = error?.code === "TEMPLATE_NOT_READY"
        ? "Cannot set to Active. Add at least one stage to this template."
        : (error?.message || "Failed to update status");
      setDialogMsg(message);
      setDialogOpen(true);
    },
  });

  const onChange = async (nextStatus: Status) => {
    if (!canEdit) return;
    
    // Pre-check for Active to avoid a round trip when possible
    if (nextStatus === "active" && (readiness?.active_stage_count ?? 0) < 1) {
      setDialogMsg("Cannot set to Active. Add at least one stage to this template.");
      setDialogOpen(true);
      return;
    }
    
    mutate.mutate(nextStatus);
  };

  return (
    <>
      <Select
        value={value}
        onValueChange={onChange}
        disabled={!canEdit || mutate.isPending}
      >
        <SelectTrigger className="w-full sm:w-36" data-testid="template-status-select">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="draft">Draft</SelectItem>
          <SelectItem value="active">Active</SelectItem>
          <SelectItem value="archived">Archived</SelectItem>
        </SelectContent>
      </Select>

      <AlertDialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cannot change status</AlertDialogTitle>
            <AlertDialogDescription>{dialogMsg}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel type="button">Close</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setDialogOpen(false);
                const element = document.getElementById("template-stages-section");
                if (element) {
                  element.scrollIntoView({ behavior: "smooth", block: "start" });
                }
              }}
            >
              Add Stage
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}