"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ListTodo } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Switch } from "@/shared/components/ui/switch";
import { Label } from "@/shared/components/ui/label";
import { Button } from "@/shared/components/ui/button";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { apiRequest, parseJsonSafe, queryClient } from "@/lib/queryClient";
import {
  mergeUserPreferences,
  type UserPreferencesDTO,
} from "@shared/preferences";
import { useToast } from "@/shared/hooks/use-toast";

const PREFERENCE_QUERY_KEY = "/api/me/preferences" as const;

type PreferenceControlKey = keyof UserPreferencesDTO;

type RoleControlMap = Record<string, readonly PreferenceControlKey[]>;

const DISABLED_CONTROLS_BY_ROLE: RoleControlMap = {
  candidate: [],
};

function createDisabledControlSet(role?: string) {
  const entries = role ? DISABLED_CONTROLS_BY_ROLE[role] ?? [] : [];
  return new Set<PreferenceControlKey>(entries as PreferenceControlKey[]);
}

const TASK_VISIBILITY_OPTIONS = [
  {
    key: "mytasksShowArchived" as const,
    title: "Show archived tasks",
    description: "Include archived tasks by default in My Tasks.",
  },
  {
    key: "mytasksShowCanceled" as const,
    title: "Show canceled tasks",
    description: "Include canceled tasks by default in My Tasks.",
  },
  {
    key: "mytasksShowCompleted" as const,
    title: "Show completed tasks",
    description: "Include completed tasks by default in My Tasks.",
  },
];

export function UserPreferencesCard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [localPreferences, setLocalPreferences] = useState<UserPreferencesDTO>(() => mergeUserPreferences());

  const queryKey = useMemo(() => [PREFERENCE_QUERY_KEY, user?.id], [user?.id]);
  const disabledControls = useMemo(() => createDisabledControlSet(user?.role), [user?.role]);

  const { data: preferences, isLoading, isError, error } = useQuery<UserPreferencesDTO>({
    queryKey,
    enabled: !!user,
    queryFn: async () => {
      const res = await apiRequest("GET", PREFERENCE_QUERY_KEY);
      return await res.json();
    },
  });

  useEffect(() => {
    if (preferences) {
      setLocalPreferences(mergeUserPreferences(preferences));
    }
  }, [preferences]);

  const updatePreferencesMutation = useMutation({
    mutationFn: async (updates: Partial<UserPreferencesDTO>) => {
      const res = await apiRequest("PATCH", PREFERENCE_QUERY_KEY, updates);
      return await parseJsonSafe<UserPreferencesDTO>(res);
    },
    onMutate: async (updates) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<UserPreferencesDTO>(queryKey);
      const base = mergeUserPreferences(previous ?? localPreferences);
      const optimistic = mergeUserPreferences({
        ...base,
        ...updates,
      });
      queryClient.setQueryData(queryKey, optimistic);
      setLocalPreferences(optimistic);
      return { previous };
    },
    onError: (err, _updates, context) => {
      const message = err instanceof Error ? err.message : "Failed to update preferences";
      if (context?.previous) {
        const rollback = mergeUserPreferences(context.previous);
        queryClient.setQueryData(queryKey, rollback);
        setLocalPreferences(rollback);
      }
      toast({ title: "Unable to update preferences", description: message, variant: "destructive" });
    },
    onSuccess: (data) => {
      const normalized = mergeUserPreferences(data);
      queryClient.setQueryData(queryKey, normalized);
      setLocalPreferences(normalized);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  const disableAllControls = !user || isLoading || updatePreferencesMutation.isPending;

  const handleTaskToggle = (key: "mytasksShowArchived" | "mytasksShowCanceled" | "mytasksShowCompleted", value: boolean) => {
    updatePreferencesMutation.mutate({ [key]: value } as Pick<UserPreferencesDTO, typeof key>);
  };

  const handleRestoreDefaults = () => {
    const defaults = {
      mytasksShowArchived: false,
      mytasksShowCanceled: false,
      mytasksShowCompleted: false,
    };
    updatePreferencesMutation.mutate(defaults, {
      onSuccess: () => {
        toast({ title: "Task visibility preferences restored" });
      },
    });
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="flex items-center gap-2 text-lg">
            <ListTodo className="h-5 w-5" />
            My Tasks Preferences
          </CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            Choose which tasks appear in your My Tasks list by default.
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleRestoreDefaults}
          disabled={disableAllControls}
        >
          Restore defaults
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {isError && (
          <div className="rounded-md border border-destructive/50 bg-destructive/5 p-4 text-sm text-destructive">
            Failed to load preferences: {error instanceof Error ? error.message : "Unknown error"}
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
            Loading preferences…
          </div>
        ) : (
          <div className="space-y-3">
            {TASK_VISIBILITY_OPTIONS.map(({ key, title, description }) => (
              <div className="flex items-center justify-between gap-4" key={key}>
                <div>
                  <Label className="font-medium">{title}</Label>
                  <p className="text-sm text-muted-foreground">{description}</p>
                </div>
                <Switch
                  checked={!!localPreferences[key]}
                  onCheckedChange={(checked) => handleTaskToggle(key, !!checked)}
                  disabled={disableAllControls || disabledControls.has(key)}
                />
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default UserPreferencesCard;
