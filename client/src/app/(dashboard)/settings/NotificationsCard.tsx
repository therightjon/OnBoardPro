"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Bell, Clock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Switch } from "@/shared/components/ui/switch";
import { Label } from "@/shared/components/ui/label";
import { Button } from "@/shared/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import { Input } from "@/shared/components/ui/input";
import { Checkbox } from "@/shared/components/ui/checkbox";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { apiRequest, parseJsonSafe, queryClient } from "@/lib/queryClient";
import {
  DIGEST_FREQUENCIES,
  EVENT_SUBSCRIPTION_LABELS,
  EVENT_SUBSCRIPTION_KEYS,
  USER_PREFERENCES_DEFAULTS,
  mergeUserPreferences,
  type UserPreferencesDTO,
} from "@shared/preferences";
import { useToast } from "@/shared/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/components/ui/tabs";

const PREFERENCE_QUERY_KEY = "/api/me/preferences" as const;

type PreferenceControlKey = keyof UserPreferencesDTO;

type RoleControlMap = Record<string, readonly PreferenceControlKey[]>;

const DISABLED_CONTROLS_BY_ROLE: RoleControlMap = {
  candidate: [],
};

const EVENT_DESCRIPTIONS: Partial<Record<string, string>> = {
  "comment.created": "Get notified when new comments are added to tasks you follow.",
  "task.assigned": "Alerts when a task is assigned to you or your team.",
  "stage.changed": "Updates when task stages shift forward or backward.",
  mention: "Mentions in comments or task updates.",
};

function createDisabledControlSet(role?: string) {
  const entries = role ? DISABLED_CONTROLS_BY_ROLE[role] ?? [] : [];
  return new Set<PreferenceControlKey>(entries as PreferenceControlKey[]);
}

const digestLabels: Record<(typeof DIGEST_FREQUENCIES)[number], string> = {
  immediate: "Immediate",
  hourly: "Hourly",
  daily: "Daily",
  weekly: "Weekly",
};

export function NotificationsCard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [localPreferences, setLocalPreferences] = useState<UserPreferencesDTO>(() => mergeUserPreferences());
  const [activeTab, setActiveTab] = useState<"notifications" | "user">("notifications");

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
        eventSubscriptions: updates.eventSubscriptions
          ? {
              ...base.eventSubscriptions,
              ...updates.eventSubscriptions,
            }
          : base.eventSubscriptions,
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

  const testEmailMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `${PREFERENCE_QUERY_KEY}/test-email`);
      await parseJsonSafe(res);
    },
    onSuccess: () => {
      toast({ title: "Test email queued", description: "Check your inbox shortly." });
    },
    onError: (err) => {
      const message = err instanceof Error ? err.message : "Unable to send test email";
      toast({ title: "Unable to send test email", description: message, variant: "destructive" });
    },
  });

  const disableAllControls = !user || isLoading || updatePreferencesMutation.isPending;

  const handlePreferenceChange = (updates: Partial<UserPreferencesDTO>) => {
    updatePreferencesMutation.mutate(updates);
  };

  const handleTaskToggle = (key: "mytasksShowArchived" | "mytasksShowCanceled" | "mytasksShowCompleted", value: boolean) => {
    handlePreferenceChange({ [key]: value } as Pick<UserPreferencesDTO, typeof key>);
  };

  const handleNotificationToggle = (key: "notifyInApp" | "notifyEmail", value: boolean) => {
    handlePreferenceChange({ [key]: value } as Pick<UserPreferencesDTO, typeof key>);
  };

  const handleDigestChange = (value: string) => {
    if ((DIGEST_FREQUENCIES as readonly string[]).includes(value)) {
      handlePreferenceChange({ digestFrequency: value as (typeof DIGEST_FREQUENCIES)[number] });
    }
  };

  const handleQuietHoursChange = (key: "quietHoursStart" | "quietHoursEnd", value: string) => {
    handlePreferenceChange({ [key]: value || null } as Pick<UserPreferencesDTO, typeof key>);
  };

  const handleEventSubscriptionToggle = (key: (typeof EVENT_SUBSCRIPTION_KEYS)[number], checked: boolean) => {
    handlePreferenceChange({
      eventSubscriptions: {
        [key]: checked,
      },
    });
  };

  const handleRestoreDefaults = () => {
    const defaults = mergeUserPreferences();
    updatePreferencesMutation.mutate(defaults, {
      onSuccess: () => {
        toast({ title: "Preferences restored" });
      },
    });
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Bell className="h-5 w-5" />
            Notifications & Preferences
          </CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            Configure task visibility, notification channels, digests, quiet hours, and per-event subscriptions.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => testEmailMutation.mutate()}
            disabled={!user || testEmailMutation.isPending}
          >
            Send test email
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleRestoreDefaults}
            disabled={disableAllControls}
          >
            Restore defaults
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-8">
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
          <Tabs
            value={activeTab}
            onValueChange={(value) => setActiveTab(value as typeof activeTab)}
            className="space-y-6"
          >
            <TabsList className="grid w-full grid-cols-2 sm:w-auto sm:inline-flex sm:gap-2">
              <TabsTrigger value="notifications">Notifications</TabsTrigger>
              <TabsTrigger value="user">User Preferences</TabsTrigger>
            </TabsList>
            <TabsContent value="notifications" className="space-y-8">
              <section className="space-y-4">
                <div>
                  <h3 className="text-sm font-semibold uppercase text-muted-foreground">Notification channels</h3>
                  <p className="text-sm text-muted-foreground">Decide where you would like to receive updates.</p>
                </div>
                <div className="space-y-3">
                  {(
                    [
                      {
                        key: "notifyInApp" as const,
                        title: "In-app notifications",
                        description: "Show alerts in the notification center.",
                      },
                      {
                        key: "notifyEmail" as const,
                        title: "Email alerts",
                        description: "Send notifications to your inbox.",
                      },
                    ]
                  ).map(({ key, title, description }) => (
                    <div className="flex items-center justify-between gap-4" key={key}>
                      <div>
                        <Label className="font-medium">{title}</Label>
                        <p className="text-sm text-muted-foreground">{description}</p>
                      </div>
                      <Switch
                        checked={!!localPreferences[key]}
                        onCheckedChange={(checked) => handleNotificationToggle(key, !!checked)}
                        disabled={disableAllControls || disabledControls.has(key)}
                      />
                    </div>
                  ))}
                </div>
              </section>

              <section className="grid gap-6 lg:grid-cols-2">
                <div className="space-y-3">
                  <div>
                    <h3 className="text-sm font-semibold uppercase text-muted-foreground">Digest frequency</h3>
                    <p className="text-sm text-muted-foreground">Control how often you receive summary emails.</p>
                  </div>
                  <Select
                    value={localPreferences.digestFrequency as any}
                    onValueChange={handleDigestChange}
                    disabled={disableAllControls || disabledControls.has("digestFrequency")}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select frequency" />
                    </SelectTrigger>
                    <SelectContent>
                      {DIGEST_FREQUENCIES.map((frequency) => (
                        <SelectItem key={frequency} value={frequency}>
                          {digestLabels[frequency]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold uppercase text-muted-foreground">Quiet hours</h3>
                    <Clock className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Optional window during which notifications are muted. Crossing midnight is supported.
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="quiet-start">Start</Label>
                      <Input
                        id="quiet-start"
                        type="time"
                        step={60}
                        value={localPreferences.quietHoursStart ?? ""}
                        onChange={(event) => handleQuietHoursChange("quietHoursStart", event.target.value)}
                        disabled={disableAllControls || disabledControls.has("quietHoursStart")}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="quiet-end">End</Label>
                      <Input
                        id="quiet-end"
                        type="time"
                        step={60}
                        value={localPreferences.quietHoursEnd ?? ""}
                        onChange={(event) => handleQuietHoursChange("quietHoursEnd", event.target.value)}
                        disabled={disableAllControls || disabledControls.has("quietHoursEnd")}
                      />
                    </div>
                  </div>
                </div>
              </section>

              <section className="space-y-4">
                <div>
                  <h3 className="text-sm font-semibold uppercase text-muted-foreground">Per-event subscriptions</h3>
                  <p className="text-sm text-muted-foreground">
                    Control which updates trigger notifications. Uncheck to mute specific events.
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {EVENT_SUBSCRIPTION_KEYS.map((key) => (
                    <label
                      key={key}
                      className="flex cursor-pointer items-start gap-3 rounded-md border border-border/70 p-3 transition hover:border-border"
                    >
                      <Checkbox
                        checked={localPreferences.eventSubscriptions[key] ?? true}
                        onCheckedChange={(checked) => handleEventSubscriptionToggle(key, !!checked)}
                        disabled={disableAllControls || disabledControls.has("eventSubscriptions")}
                      />
                      <span>
                        <span className="block font-medium">{EVENT_SUBSCRIPTION_LABELS[key]}</span>
                        <span className="block text-sm text-muted-foreground">
                          {EVENT_DESCRIPTIONS[key] ?? "Receive alerts related to this activity."}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              </section>
            </TabsContent>

            <TabsContent value="user" className="space-y-8">
              <section className="space-y-4">
                <div>
                  <h3 className="text-sm font-semibold uppercase text-muted-foreground">My Tasks visibility</h3>
                  <p className="text-sm text-muted-foreground">
                    Choose which tasks appear in your My Tasks list by default.
                  </p>
                </div>
                <div className="space-y-3">
                  {["Archived", "Canceled", "Completed"].map((label, index) => {
                    const key = ["mytasksShowArchived", "mytasksShowCanceled", "mytasksShowCompleted"][index] as
                      | "mytasksShowArchived"
                      | "mytasksShowCanceled"
                      | "mytasksShowCompleted";
                    return (
                      <div className="flex items-center justify-between gap-4" key={key}>
                        <div>
                          <Label className="font-medium">Show {label.toLowerCase()} tasks</Label>
                          <p className="text-sm text-muted-foreground">
                            Include {label.toLowerCase()} tasks by default in My Tasks.
                          </p>
                        </div>
                        <Switch
                          checked={!!localPreferences[key]}
                          onCheckedChange={(checked) => handleTaskToggle(key, !!checked)}
                          disabled={disableAllControls || disabledControls.has(key)}
                        />
                      </div>
                    );
                  })}
                </div>
              </section>
            </TabsContent>
          </Tabs>
        )}
      </CardContent>
    </Card>
  );
}

export default NotificationsCard;
