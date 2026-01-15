import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";
import type { FallbackProps } from "react-error-boundary";

/**
 * Error fallback component displayed when an unhandled React error occurs.
 * Used with react-error-boundary's ErrorBoundary component.
 * 
 * Provides users with:
 * - A clear error message
 * - Error details (in development only)
 * - Actions to recover (retry or go home)
 */
export function ErrorFallback({ error, resetErrorBoundary }: FallbackProps) {
  const isDevelopment = import.meta.env.DEV;

  const handleGoHome = () => {
    // Navigate to home and reset the error boundary
    window.location.href = "/";
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-lg">
        <CardHeader className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
              <AlertTriangle className="h-6 w-6 text-destructive" aria-hidden="true" />
            </div>
            <div>
              <CardTitle className="text-xl">Something went wrong</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                An unexpected error occurred in the application.
              </p>
            </div>
          </div>
        </CardHeader>
        
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            We apologize for the inconvenience. You can try refreshing the page or returning to the home screen.
          </p>
          
          {isDevelopment && error && (
            <div className="rounded-md bg-muted p-4 overflow-auto max-h-48">
              <p className="text-sm font-medium text-destructive mb-2">
                {error.name}: {error.message}
              </p>
              {error.stack && (
                <pre className="text-xs text-muted-foreground whitespace-pre-wrap break-words font-mono">
                  {error.stack}
                </pre>
              )}
            </div>
          )}
        </CardContent>
        
        <CardFooter className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            variant="outline"
            onClick={handleGoHome}
            className="w-full sm:w-auto"
            aria-label="Return to home page"
          >
            <Home className="mr-2 h-4 w-4" aria-hidden="true" />
            Go to Home
          </Button>
          <Button
            onClick={resetErrorBoundary}
            className="w-full sm:w-auto"
            aria-label="Try again"
          >
            <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
            Try Again
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
