import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Redirect } from "wouter";
import { Users, CheckCircle, Shield, Clock, Building2, Mail, Cloud, Landmark } from "lucide-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/shared/hooks/use-toast";

const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

const registerSchema = z.object({
  email: z.string().email("Invalid email address"),
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  passwordHash: z.string().min(6, "Password must be at least 6 characters"),
  role: z.enum(["system_admin", "hr_staff", "department_admin", "division_leader", "manager", "candidate"]),
});

type LoginForm = z.infer<typeof loginSchema>;
type RegisterForm = z.infer<typeof registerSchema>;

// Active Directory / LDAP login schema mirrors local login UX
const adLoginSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});
type AdLoginForm = z.infer<typeof adLoginSchema>;

export default function AuthPage() {
  const { user, loginMutation, registerMutation } = useAuth();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("login");
  const [activeProvider, setActiveProvider] = useState<string>("local");

  // Load enabled providers (public endpoint). Fallback to ["local"] if not available
  const { data: providerResp } = useQuery({
    queryKey: ["/api/auth/available-providers"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/auth/available-providers");
      return res.json() as Promise<{ providers: string[] }>; 
    }
  });
  const providersRaw = providerResp?.providers?.length ? providerResp.providers : ["local"];

  const providerMetadata = useMemo(() => ({
    ldap: {
      label: "Active Directory",
      description: "Use your AD/LDAP username and password",
      Icon: Building2,
    },
    azuread: {
      label: "Azure AD",
      description: "Use your Microsoft work account",
      Icon: Landmark,
    },
    google: {
      label: "Google",
      description: "Use your Google Workspace account",
      Icon: Cloud,
    },
    local: {
      label: "Local",
      description: "Sign in with your email and password",
      Icon: Mail,
    },
  }), []);

  const providers = useMemo(() => {
    const withoutLocal = providersRaw.filter((p) => p !== "local");
    const locals = providersRaw.filter((p) => p === "local");
    return [...withoutLocal, ...locals];
  }, [providersRaw]);

  // Default provider: LDAP if enabled, else Local. Preserve selection if still available.
  useEffect(() => {
    if (!providers || providers.length === 0) return;
    setActiveProvider((prev) => {
      if (prev && providers.includes(prev)) return prev;
      return providers.includes("ldap") ? "ldap" : "local";
    });
  }, [providers.join(",")]);

  const loginForm = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const registerForm = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      email: "",
      firstName: "",
      lastName: "",
      passwordHash: "",
      role: "candidate",
    },
  });

  // AD/LDAP login form and mutation
  const adLoginForm = useForm<AdLoginForm>({
    resolver: zodResolver(adLoginSchema),
    defaultValues: {
      username: "",
      password: "",
    },
  });

  const adLoginMutation = useMutation({
    mutationFn: async (credentials: AdLoginForm) => {
      const res = await apiRequest("POST", "/api/auth/login", {
        provider: "ldap",
        credentials,
      });
      return await res.json();
    },
    onSuccess: (result: any) => {
      // Server returns { user, isNewUser }
      if (result?.user) {
        queryClient.setQueryData(["/api/user"], result.user);
      } else {
        // Fallback in case shape changes
        queryClient.invalidateQueries({ queryKey: ["/api/user"] });
      }
    },
    onError: (error: any) => {
      toast({
        title: "AD sign-in failed",
        description: error?.message || "Authentication failed",
        variant: "destructive",
      });
    },
  });

  const showProviderTabs = providers.length > 1;

  const renderProviderCard = (provider: string) => {
    const meta = providerMetadata[provider as keyof typeof providerMetadata] ?? {
      label: provider,
      description: "Sign in with this provider",
      Icon: Mail,
    };
    const { Icon } = meta;

    if (provider === "ldap") {
      return (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Icon className="h-4 w-4" />
              {meta.label}
            </CardTitle>
            <CardDescription>{meta.description}</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={adLoginForm.handleSubmit((data) => adLoginMutation.mutate(data))} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="ad-username">Username</Label>
                <Input id="ad-username" type="text" placeholder="Enter your AD username" data-testid="input-ad-username" {...adLoginForm.register("username")} />
                {adLoginForm.formState.errors.username && (
                  <p className="text-sm text-destructive">{adLoginForm.formState.errors.username.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="ad-password">Password</Label>
                <Input id="ad-password" type="password" placeholder="Enter your password" data-testid="input-ad-password" {...adLoginForm.register("password")} />
                {adLoginForm.formState.errors.password && (
                  <p className="text-sm text-destructive">{adLoginForm.formState.errors.password.message}</p>
                )}
              </div>
              <Button type="submit" className="w-full" disabled={adLoginMutation.isPending} data-testid="button-ad-login">
                {adLoginMutation.isPending ? "Signing in…" : "Sign In with AD"}
              </Button>
            </form>
          </CardContent>
        </Card>
      );
    }

    if (provider === "local") {
      return (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Icon className="h-4 w-4" />
              {meta.label}
            </CardTitle>
            <CardDescription>{meta.description}</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={loginForm.handleSubmit(onLogin)} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="login-email">Email</Label>
                <Input id="login-email" type="email" placeholder="Enter your email" data-testid="input-email" {...loginForm.register("email")} />
                {loginForm.formState.errors.email && (
                  <p className="text-sm text-destructive">{loginForm.formState.errors.email.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="login-password">Password</Label>
                <Input id="login-password" type="password" placeholder="Enter your password" data-testid="input-password" {...loginForm.register("password")} />
                {loginForm.formState.errors.password && (
                  <p className="text-sm text-destructive">{loginForm.formState.errors.password.message}</p>
                )}
              </div>
              <Button type="submit" className="w-full" disabled={loginMutation.isPending} data-testid="button-login">
                {loginMutation.isPending ? "Signing in..." : "Sign In"}
              </Button>
            </form>
          </CardContent>
        </Card>
      );
    }

    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Icon className="h-4 w-4" />
            {meta.label}
          </CardTitle>
          <CardDescription>{meta.description}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">This provider is not available yet.</p>
        </CardContent>
      </Card>
    );
  };

  // Redirect if already logged in
  if (user) {
    return <Redirect to="/" />;
  }

  const onLogin = (data: LoginForm) => {
    loginMutation.mutate(data);
  };

  const onRegister = (data: RegisterForm) => {
    registerMutation.mutate(data);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col lg:flex-row">
      {/* Forms Section */}
      <div className="flex-1 flex items-center justify-center px-3 py-6 xs:px-4 xs:py-8 sm:px-6 lg:p-8">
        <div className="w-full max-w-md">
          <div className="text-center mb-6 sm:mb-8">
            <div className="w-12 h-12 sm:w-16 sm:h-16 bg-primary rounded-lg flex items-center justify-center mx-auto mb-3 sm:mb-4">
              <Users className="w-6 h-6 sm:w-8 sm:h-8 text-primary-foreground" />
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-foreground">OnboardPro</h1>
            <p className="text-sm sm:text-base text-muted-foreground">Hiring & Onboarding Management</p>
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="login" data-testid="tab-login">Sign In</TabsTrigger>
              <TabsTrigger value="register" data-testid="tab-register">Sign Up</TabsTrigger>
            </TabsList>

            <TabsContent value="login">
              {showProviderTabs ? (
                <Tabs value={activeProvider} onValueChange={setActiveProvider} className="w-full">
                  <TabsList className="grid w-full" style={{ gridTemplateColumns: `repeat(${providers.length}, minmax(0, 1fr))` }}>
                    {providers.map((p) => {
                      const meta = providerMetadata[p as keyof typeof providerMetadata] ?? {
                        label: p,
                        Icon: Mail,
                      };
                      const Icon = meta.Icon;
                      return (
                        <TabsTrigger key={p} value={p} data-testid={`tab-provider-${p}`} className="flex items-center gap-2">
                          <Icon className="h-4 w-4" />
                          <span>{meta.label}</span>
                        </TabsTrigger>
                      );
                    })}
                  </TabsList>

                  {providers.map((p) => (
                    <TabsContent key={p} value={p}>
                      {renderProviderCard(p)}
                    </TabsContent>
                  ))}
                </Tabs>
              ) : (
                <div>{renderProviderCard(activeProvider)}</div>
              )}
            </TabsContent>

            <TabsContent value="register">
              <Card>
                <CardHeader>
                  <CardTitle>Create account</CardTitle>
                  <CardDescription>
                    Sign up for a new account to get started
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={registerForm.handleSubmit(onRegister)} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="register-email">Email</Label>
                      <Input
                        id="register-email"
                        type="email"
                        placeholder="Enter your email"
                        data-testid="input-register-email"
                        {...registerForm.register("email")}
                      />
                      {registerForm.formState.errors.email && (
                        <p className="text-sm text-destructive">
                          {registerForm.formState.errors.email.message}
                        </p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="register-firstName">First Name</Label>
                      <Input
                        id="register-firstName"
                        type="text"
                        placeholder="Enter your first name"
                        data-testid="input-register-firstName"
                        {...registerForm.register("firstName")}
                      />
                      {registerForm.formState.errors.firstName && (
                        <p className="text-sm text-destructive">
                          {registerForm.formState.errors.firstName.message}
                        </p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="register-lastName">Last Name</Label>
                      <Input
                        id="register-lastName"
                        type="text"
                        placeholder="Enter your last name"
                        data-testid="input-register-lastName"
                        {...registerForm.register("lastName")}
                      />
                      {registerForm.formState.errors.lastName && (
                        <p className="text-sm text-destructive">
                          {registerForm.formState.errors.lastName.message}
                        </p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="register-password">Password</Label>
                      <Input
                        id="register-password"
                        type="password"
                        placeholder="Create a password"
                        data-testid="input-register-password"
                        {...registerForm.register("passwordHash")}
                      />
                      {registerForm.formState.errors.passwordHash && (
                        <p className="text-sm text-destructive">
                          {registerForm.formState.errors.passwordHash.message}
                        </p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="register-role">Role</Label>
                      <Select
                        value={registerForm.watch("role")}
                        onValueChange={(value) => registerForm.setValue("role", value as any)}
                      >
                        <SelectTrigger data-testid="select-role">
                          <SelectValue placeholder="Select your role" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="candidate">Candidate</SelectItem>
                          <SelectItem value="manager">Manager</SelectItem>
                          <SelectItem value="division_leader">Division Leader</SelectItem>
                          <SelectItem value="department_admin">Department Admin</SelectItem>
                          <SelectItem value="hr_staff">HR Staff</SelectItem>
                          <SelectItem value="system_admin">System Admin</SelectItem>
                        </SelectContent>
                      </Select>
                      {registerForm.formState.errors.role && (
                        <p className="text-sm text-destructive">
                          {registerForm.formState.errors.role.message}
                        </p>
                      )}
                    </div>

                    <Button
                      type="submit"
                      className="w-full"
                      disabled={registerMutation.isPending}
                      data-testid="button-register"
                    >
                      {registerMutation.isPending ? "Creating account..." : "Create Account"}
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* Hero Section - Hidden on mobile, shown on desktop */}
      <div className="hidden lg:flex lg:flex-1 bg-primary text-primary-foreground p-8 items-center justify-center">
        <div className="max-w-md text-center space-y-6">
          <h2 className="text-2xl xl:text-3xl font-bold">Streamline Your Hiring Process</h2>
          <p className="text-base xl:text-lg text-primary-foreground/90">
            Manage candidates, track tasks, and automate onboarding workflows with our comprehensive platform.
          </p>
          
          <div className="space-y-4 text-left">
            <div className="flex items-center space-x-3">
              <CheckCircle className="w-5 h-5 text-accent flex-shrink-0" />
              <span className="text-sm xl:text-base">Role-based access control</span>
            </div>
            <div className="flex items-center space-x-3">
              <CheckCircle className="w-5 h-5 text-accent flex-shrink-0" />
              <span className="text-sm xl:text-base">Template-driven workflows</span>
            </div>
            <div className="flex items-center space-x-3">
              <CheckCircle className="w-5 h-5 text-accent flex-shrink-0" />
              <span className="text-sm xl:text-base">Real-time task tracking</span>
            </div>
            <div className="flex items-center space-x-3">
              <CheckCircle className="w-5 h-5 text-accent flex-shrink-0" />
              <span className="text-sm xl:text-base">Comprehensive analytics</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 pt-6">
            <div className="text-center">
              <Shield className="w-6 h-6 xl:w-8 xl:h-8 mx-auto mb-2 text-accent" />
              <h3 className="text-sm xl:text-base font-semibold">Secure</h3>
              <p className="text-xs xl:text-sm text-primary-foreground/80">Enterprise-grade security</p>
            </div>
            <div className="text-center">
              <Clock className="w-6 h-6 xl:w-8 xl:h-8 mx-auto mb-2 text-accent" />
              <h3 className="text-sm xl:text-base font-semibold">Efficient</h3>
              <p className="text-xs xl:text-sm text-primary-foreground/80">Streamlined processes</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
