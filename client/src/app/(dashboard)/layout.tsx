import { ProtectedRoute } from "../../lib/protected-route";
import { Sidebar } from "@/shared/components/layout/sidebar";
import { useState } from "react";
import { Button } from "@/shared/components/ui/button";
import { Sheet, SheetContent } from "@/shared/components/ui/sheet";
import { Menu } from "lucide-react";
import { HeaderBell } from "../_layout/HeaderBell";

function Header({ onMenuClick }: { onMenuClick: () => void }) {
  return (
    <header className="sticky top-0 z-40 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b md:hidden">
      <div className="flex h-14 items-center justify-between px-4">
        <h1 className="text-base xs:text-lg sm:text-xl font-semibold text-foreground">OnboardPro</h1>
        <div className="flex items-center gap-2">
          <HeaderBell />
          <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open navigation" onClick={onMenuClick} data-testid="button-mobile-menu">
            <Menu className="w-5 h-5" />
          </Button>
        </div>
      </div>
    </header>
  );
}

function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  return (
    <>
      {/* Skip link for accessibility */}
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      
      <div className="min-h-screen grid md:grid-cols-[260px_1fr] max-w-[100vw] overflow-x-hidden">
        {/* Sidebar for desktop */}
        <aside className="hidden md:flex border-r md:sticky md:top-0 md:h-screen">
          <Sidebar />
        </aside>

        <div className="flex min-h-screen flex-col max-w-full overflow-x-hidden">
          <Header onMenuClick={() => setIsMobileMenuOpen(true)} />
          <div className="hidden md:flex justify-end border-b border-border px-6 py-4">
            <HeaderBell />
          </div>

          <main id="main" className="flex-1 max-w-full overflow-x-hidden">
            {children}
          </main>
        </div>

        {/* Mobile navigation sheet */}
        <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
          <SheetContent side="left" className="p-0 w-[85vw] max-w-sm">
            <Sidebar onNavigate={() => setIsMobileMenuOpen(false)} />
          </SheetContent>
        </Sheet>
      </div>
    </>
  );
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <DashboardLayout>
      {children}
    </DashboardLayout>
  );
}
