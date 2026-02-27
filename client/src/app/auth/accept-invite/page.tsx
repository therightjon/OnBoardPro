/**
 * Accept Invite Page
 * 
 * Handles invitation acceptance via token in URL query params.
 * This page is public (no auth required) and properly uses POST with CSRF protection.
 */
import { useEffect, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import { Loader2, CheckCircle, XCircle, Users, ArrowRight } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { isInvitationsEnabled } from "@/lib/feature-flags";

type AcceptStatus = "loading" | "success" | "error";

interface InvitationDetails {
  email: string;
  expiresAt: string;
}

export default function AcceptInvitePage() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const invitationsEnabled = isInvitationsEnabled();
  const [status, setStatus] = useState<AcceptStatus>("loading");
  const [invitation, setInvitation] = useState<InvitationDetails | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>("");

  useEffect(() => {
    async function acceptInvitation() {
      if (!invitationsEnabled) {
        setStatus("error");
        setErrorMessage("Invitation feature is currently unavailable.");
        return;
      }

      // Extract token from URL query params
      const params = new URLSearchParams(search);
      const token = params.get("token");

      if (!token) {
        setStatus("error");
        setErrorMessage("No invitation token provided. Please check your invitation link.");
        return;
      }

      try {
        // POST request with token in body - CSRF protected via apiRequest
        const response = await apiRequest("POST", "/api/invitations/accept", { token });
        const data = await response.json();
        
        setInvitation({
          email: data.email,
          expiresAt: data.expiresAt
        });
        setStatus("success");
      } catch (error: any) {
        setStatus("error");
        // Handle specific error messages from the backend
        if (error.status === 410) {
          setErrorMessage("This invitation has expired or is no longer valid. Please request a new invitation.");
        } else if (error.status === 404) {
          setErrorMessage("Invitation feature is currently unavailable.");
        } else if (error.status === 400) {
          setErrorMessage(error.message || "Invalid invitation token. Please check your invitation link.");
        } else {
          setErrorMessage(error.message || "Unable to accept invitation. Please try again later.");
        }
      }
    }

    acceptInvitation();
  }, [invitationsEnabled, search]);

  const handleContinueToLogin = () => {
    setLocation("/auth");
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">
        {/* Logo/Brand Header */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-primary rounded-lg flex items-center justify-center mx-auto mb-4">
            <Users className="w-8 h-8 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">OnboardPro</h1>
          <p className="text-muted-foreground">Hiring & Onboarding Management</p>
        </div>

        <Card>
          <CardHeader className="text-center">
            <CardTitle className="flex items-center justify-center gap-2">
              {status === "loading" && (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Accepting Invitation
                </>
              )}
              {status === "success" && (
                <>
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  Invitation Accepted
                </>
              )}
              {status === "error" && (
                <>
                  <XCircle className="h-5 w-5 text-destructive" />
                  Unable to Accept Invitation
                </>
              )}
            </CardTitle>
            <CardDescription>
              {status === "loading" && "Please wait while we verify your invitation..."}
              {status === "success" && `Welcome! Your invitation for ${invitation?.email} has been accepted.`}
              {status === "error" && "There was a problem with your invitation."}
            </CardDescription>
          </CardHeader>
          
          <CardContent className="space-y-4">
            {status === "loading" && (
              <div className="flex justify-center py-4">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            )}

            {status === "success" && (
              <>
                <p className="text-sm text-muted-foreground text-center">
                  Please proceed to sign in to complete your account setup.
                </p>
                <Button 
                  className="w-full" 
                  onClick={handleContinueToLogin}
                  data-testid="button-continue-login"
                >
                  Continue to Sign In
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </>
            )}

            {status === "error" && (
              <>
                <p className="text-sm text-destructive text-center">
                  {errorMessage}
                </p>
                <Button 
                  variant="outline" 
                  className="w-full" 
                  onClick={handleContinueToLogin}
                  data-testid="button-go-to-login"
                >
                  Go to Sign In
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
