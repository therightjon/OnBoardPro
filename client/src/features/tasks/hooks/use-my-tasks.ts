import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/features/auth/hooks/use-auth";
import type { CandidateTask } from "@shared/schemas";

type UseMyTasksOptions = {
  showArchived?: boolean;
  showCanceled?: boolean;
  showCompleted?: boolean;
  enabled?: boolean;
};

export function useMyTasks(options?: UseMyTasksOptions) {
  const { user } = useAuth();
  const {
    showArchived = false,
    showCanceled = false,
    showCompleted = false,
    enabled = true
  } = options ?? {};

  return useQuery<CandidateTask[]>({
    // Include user id and filters to scope cache per user/session
    queryKey: ["/api/tasks/mine", user?.id, { showArchived, showCanceled, showCompleted }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (showArchived) params.append("showArchived", "1");
      if (showCanceled) params.append("showCanceled", "1");
      if (showCompleted) params.append("showCompleted", "1");
      const url = `/api/tasks/mine${params.toString() ? `?${params.toString()}` : ""}`;
      const res = await apiRequest("GET", url);
      return res.json();
    },
    enabled: enabled && !!user
  });
}
