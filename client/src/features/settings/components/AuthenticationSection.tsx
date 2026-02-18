/**
 * AuthenticationSection - Authentication providers and LDAP settings
 * Re-exports existing components with consistent section wrapper
 */
import { Shield, Key, Lock, AlertCircle } from "lucide-react";
import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/shared/hooks/use-toast";

// UI Components
import { SettingsSection } from "@/shared/components/settings/SettingsSection";
import { SettingsGroup } from "@/shared/components/settings/SettingsGroup";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/shared/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/components/ui/table";
import { Badge } from "@/shared/components/ui/badge";
import { Switch } from "@/shared/components/ui/switch";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Button } from "@/shared/components/ui/button";

// ============================================================================
// AUTHENTICATION PROVIDERS SECTION
// ============================================================================

export function AuthenticationProvidersSection() {
  const { user } = useAuth();
  const { toast } = useToast();

  const { data: providers = [], isLoading, error } = useQuery({
    queryKey: ["/api/auth/providers", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/auth/providers");
      return res.json();
    },
  });

  const toggleProviderMutation = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      const res = await apiRequest("PATCH", `/api/auth/providers/${id}`, { enabled });
      return await res.json();
    },
    onSuccess: (data, variables) => {
      toast({
        title: "Provider updated",
        description: `${(data as any).name} has been ${variables.enabled ? "enabled" : "disabled"}`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/providers"] });
    },
    onError: (error: any) => {
      toast({
        title: "Error updating provider",
        description: error.message || "Failed to update authentication provider",
        variant: "destructive",
      });
    },
  });

  const handleToggleProvider = (id: string, currentEffectiveEnabled: boolean) => {
    toggleProviderMutation.mutate({ id, enabled: !currentEffectiveEnabled });
  };

  const getStatusBadge = (provider: any) => {
    if (!provider.configured) {
      return <Badge variant="destructive">Not Configured</Badge>;
    } else if (provider.effectiveEnabled) {
      return <Badge className="bg-green-600 dark:bg-emerald-600">Active</Badge>;
    } else {
      return <Badge variant="secondary">Disabled</Badge>;
    }
  };

  if (error) {
    return (
      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <Shield className="w-5 h-5 shrink-0" />
            Authentication Providers
          </CardTitle>
        </CardHeader>
        <CardContent className="min-w-0">
          <div className="flex items-center gap-2 text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <p className="text-sm">Failed to load authentication providers. Please try again later.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
          <Shield className="w-5 h-5 shrink-0" />
          Authentication Providers
        </CardTitle>
        <CardDescription className="text-sm">
          Manage authentication methods available to users. At least one provider must be enabled and configured.
        </CardDescription>
      </CardHeader>
      <CardContent className="min-w-0">
        {isLoading ? (
          <div className="flex justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : (
          <>
            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto">
              <Table className="min-w-[980px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Provider</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Configuration</TableHead>
                    <TableHead>Enabled</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(providers as any[]).map((provider) => (
                    <TableRow key={provider.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{provider.name}</p>
                          <p className="text-sm text-muted-foreground">{provider.notes}</p>
                        </div>
                      </TableCell>
                      <TableCell>{getStatusBadge(provider)}</TableCell>
                      <TableCell>
                        {provider.configured ? (
                          <div className="text-sm space-y-1">
                            {provider.clientIdMasked && (
                              <p className="text-muted-foreground">
                                Client ID: <code className="bg-muted px-1 rounded">{provider.clientIdMasked}</code>
                              </p>
                            )}
                            {provider.callbackUrl && (
                              <p className="text-muted-foreground text-xs break-all">
                                Callback: {provider.callbackUrl}
                              </p>
                            )}
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground">Missing required environment variables</p>
                        )}
                      </TableCell>
                      <TableCell>
                        <Switch
                          checked={provider.effectiveEnabled}
                          disabled={!provider.canEnable || toggleProviderMutation.isPending}
                          onCheckedChange={() => handleToggleProvider(provider.id, provider.effectiveEnabled)}
                          data-testid={`switch-${provider.id}`}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Mobile Cards */}
            <div className="space-y-3 md:hidden">
              {(providers as any[]).length === 0 ? (
                <div className="text-center py-6 text-muted-foreground">No providers found.</div>
              ) : (
                (providers as any[]).map((provider) => (
                  <div key={provider.id} className="p-4 border rounded-lg">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <div className="font-medium">{provider.name}</div>
                        <div className="text-xs text-muted-foreground">{provider.notes}</div>
                        <div className="mt-2">{getStatusBadge(provider)}</div>
                      </div>
                      <Switch
                        checked={provider.effectiveEnabled}
                        disabled={!provider.canEnable || toggleProviderMutation.isPending}
                        onCheckedChange={() => handleToggleProvider(provider.id, provider.effectiveEnabled)}
                      />
                    </div>
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================================
// LDAP SETTINGS SECTION
// ============================================================================

export function LdapSettingsSection() {
  const { user } = useAuth();
  const { toast } = useToast();
  const fixedUserFilter = "(sAMAccountName={{username}})";

  const { data, isLoading, error } = useQuery({
    queryKey: ["/api/auth/ldap", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/auth/ldap");
      return res.json();
    },
  });

  const [form, setForm] = useState({
    url: "",
    startTls: false,
    baseDn: "",
    bindDn: "",
    bindPassword: "",
    usernameAttr: "uid",
    firstNameAttr: "givenName",
    lastNameAttr: "sn",
    emailAttr: "mail",
    disabledFilter: "",
  });
  const [hasPassword, setHasPassword] = useState(false);

  useEffect(() => {
    if (data?.settings) {
      const s = data.settings;
      setForm((prev) => ({
        ...prev,
        url: s.url || "",
        startTls: !!s.startTls,
        baseDn: s.baseDn || "",
        bindDn: s.bindDnMasked ? "" : prev.bindDn,
        bindPassword: "",
        usernameAttr: s.usernameAttr || "uid",
        firstNameAttr: s.firstNameAttr || "givenName",
        lastNameAttr: s.lastNameAttr || "sn",
        emailAttr: s.emailAttr || "mail",
        disabledFilter: s.disabledFilter || "",
      }));
      setHasPassword(!!s.hasPassword);
    }
  }, [data]);

  const onChange = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload: any = {
        url: form.url || undefined,
        startTls: !!form.startTls,
        baseDn: form.baseDn || undefined,
        bindDn: form.bindDn || undefined,
        usernameAttr: form.usernameAttr || undefined,
        firstNameAttr: form.firstNameAttr || undefined,
        lastNameAttr: form.lastNameAttr || undefined,
        emailAttr: form.emailAttr || undefined,
        disabledFilter: form.disabledFilter || undefined,
        bindPassword: form.bindPassword === "" ? undefined : form.bindPassword,
      };
      const res = await apiRequest("PUT", "/api/auth/ldap", payload);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Saved", description: "LDAP settings updated" });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/ldap"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/providers"] });
      setForm((f) => ({ ...f, bindPassword: "" }));
    },
    onError: (error: any) => {
      toast({ title: "Save failed", description: error?.message || "Unable to save LDAP settings", variant: "destructive" });
    },
  });

  const testMutation = useMutation({
    mutationFn: async () => {
      const payload: any = {
        url: form.url || undefined,
        startTls: !!form.startTls,
        baseDn: form.baseDn || undefined,
        bindDn: form.bindDn || undefined,
        usernameAttr: form.usernameAttr || undefined,
        firstNameAttr: form.firstNameAttr || undefined,
        lastNameAttr: form.lastNameAttr || undefined,
        emailAttr: form.emailAttr || undefined,
        disabledFilter: form.disabledFilter || undefined,
      };
      if (form.bindPassword) payload.bindPassword = form.bindPassword;
      const res = await apiRequest("POST", "/api/auth/ldap/test", payload);
      return res.json();
    },
    onSuccess: (r: any) => {
      if (r.ok) {
        toast({ title: "Connection successful", description: `LDAP responded in ${r.durationMs} ms` });
      } else {
        toast({ title: "Connection failed", description: r.message || "Could not connect to LDAP", variant: "destructive" });
      }
    },
    onError: (error: any) => {
      toast({ title: "Test failed", description: error?.message || "Unable to test LDAP connection", variant: "destructive" });
    },
  });

  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
          <Key className="w-5 h-5 shrink-0" />
          LDAP / Active Directory Settings
        </CardTitle>
        <CardDescription className="text-sm">
          Configure LDAP/Active Directory connection for enterprise authentication. Users can sign in with their username
          or email address. When using email, only the portion before @ is used for AD authentication.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6 min-w-0">
        {isLoading ? (
          <div className="flex justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : error ? (
          <div className="flex items-center gap-2 text-destructive p-4 border border-destructive/30 rounded-lg bg-destructive/5">
            <AlertCircle className="h-4 w-4" />
            <p>Failed to load LDAP settings</p>
          </div>
        ) : (
          <>
            {/* Connection Settings */}
            <SettingsGroup label="Connection" description="LDAP server connection settings">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="ldap-url">LDAP URL</Label>
                  <Input
                    id="ldap-url"
                    placeholder="ldaps://ldap.company.com"
                    value={form.url}
                    onChange={(e) => onChange("url", e.target.value)}
                    data-testid="ldap-url"
                  />
                  <p className="text-xs text-muted-foreground">Use ldaps:// for secure connection or ldap:// with StartTLS</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ldap-basedn">Base DN</Label>
                  <Input
                    id="ldap-basedn"
                    placeholder="dc=company,dc=com"
                    value={form.baseDn}
                    onChange={(e) => onChange("baseDn", e.target.value)}
                    data-testid="ldap-basedn"
                  />
                </div>
              </div>
              <div className="flex items-center justify-between p-3 border rounded-lg">
                <div>
                  <Label>Use StartTLS</Label>
                  <p className="text-xs text-muted-foreground">Required if not using LDAPS protocol</p>
                </div>
                <Switch
                  checked={!!form.startTls}
                  onCheckedChange={(v) => onChange("startTls", v)}
                  data-testid="ldap-starttls"
                />
              </div>
            </SettingsGroup>

            {/* Bind Credentials */}
            <SettingsGroup label="Bind Credentials" description="Service account credentials for LDAP queries">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="ldap-binddn">Bind DN</Label>
                  <Input
                    id="ldap-binddn"
                    placeholder={data?.settings?.bindDnMasked || "cn=service,ou=svc,dc=company,dc=com"}
                    value={form.bindDn}
                    onChange={(e) => onChange("bindDn", e.target.value)}
                    data-testid="ldap-binddn"
                  />
                  {data?.settings?.bindDnMasked && (
                    <p className="text-xs text-muted-foreground">
                      Stored as <code className="bg-muted px-1 rounded">{data.settings.bindDnMasked}</code>. Leave empty to keep.
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ldap-bindpw">Bind Password</Label>
                  <Input
                    id="ldap-bindpw"
                    type="password"
                    placeholder={hasPassword ? "•••••• (configured)" : "Enter password"}
                    value={form.bindPassword}
                    onChange={(e) => onChange("bindPassword", e.target.value)}
                    data-testid="ldap-bindpw"
                  />
                  {hasPassword && <p className="text-xs text-muted-foreground">Leave blank to keep current password</p>}
                </div>
              </div>
            </SettingsGroup>

            {/* User Search */}
            <SettingsGroup label="User Search" description="Configure how users are located in the directory">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="ldap-userfilter">User Filter</Label>
                  <Input
                    id="ldap-userfilter"
                    value={fixedUserFilter}
                    readOnly
                    data-testid="ldap-userfilter"
                  />
                  <p className="text-xs text-muted-foreground">
                    Fixed for security. Username interpolation is handled server-side.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ldap-disabledfilter">Disabled User Filter (Optional)</Label>
                  <Input
                    id="ldap-disabledfilter"
                    placeholder="(userAccountControl:1.2.840.113556.1.4.803:=2)"
                    value={form.disabledFilter}
                    onChange={(e) => onChange("disabledFilter", e.target.value)}
                    data-testid="ldap-disabled-filter"
                  />
                </div>
              </div>
            </SettingsGroup>

            {/* Attribute Mapping */}
            <SettingsGroup label="Attribute Mapping" description="Map LDAP attributes to user profile fields">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="ldap-attr-username">Username</Label>
                  <Input
                    id="ldap-attr-username"
                    placeholder="uid"
                    value={form.usernameAttr}
                    onChange={(e) => onChange("usernameAttr", e.target.value)}
                    data-testid="ldap-attr-username"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ldap-attr-firstname">First Name</Label>
                  <Input
                    id="ldap-attr-firstname"
                    placeholder="givenName"
                    value={form.firstNameAttr}
                    onChange={(e) => onChange("firstNameAttr", e.target.value)}
                    data-testid="ldap-attr-firstname"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ldap-attr-lastname">Last Name</Label>
                  <Input
                    id="ldap-attr-lastname"
                    placeholder="sn"
                    value={form.lastNameAttr}
                    onChange={(e) => onChange("lastNameAttr", e.target.value)}
                    data-testid="ldap-attr-lastname"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ldap-attr-email">Email</Label>
                  <Input
                    id="ldap-attr-email"
                    placeholder="mail"
                    value={form.emailAttr}
                    onChange={(e) => onChange("emailAttr", e.target.value)}
                    data-testid="ldap-attr-email"
                  />
                </div>
              </div>
            </SettingsGroup>

            {/* Actions */}
            <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t">
              <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} data-testid="ldap-save">
                {saveMutation.isPending ? "Saving…" : "Save Settings"}
              </Button>
              <Button variant="outline" onClick={() => testMutation.mutate()} disabled={testMutation.isPending} data-testid="ldap-test">
                {testMutation.isPending ? "Testing…" : "Test Connection"}
              </Button>
              {data?.configured === false && (
                <div className="text-xs text-muted-foreground self-center">Not configured</div>
              )}
            </div>
            {data?.warnings?.length > 0 && (
              <div className="flex items-center gap-2 p-4 border rounded-lg bg-muted/50">
                <AlertCircle className="h-4 w-4 text-amber-500" />
                <p className="text-sm">{data.warnings[0]}</p>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

// Combined export for the Authentication tab
export function AuthenticationSettingsSection() {
  return (
    <div className="space-y-6">
      <AuthenticationProvidersSection />
      <LdapSettingsSection />
    </div>
  );
}

export default AuthenticationSettingsSection;
