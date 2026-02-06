import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import { Badge } from "@/shared/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/components/ui/table";
import { Plus, Search, Filter, ArrowUpDown, ArrowUp, ArrowDown, Archive, RotateCcw } from "lucide-react";
import { Switch } from "@/shared/components/ui/switch";
import { Label } from "@/shared/components/ui/label";
import { Link, useLocation } from "wouter";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/components/ui/alert-dialog";
// Lazy load heavy dialogs to reduce initial bundle size
const NewCandidateDialog = lazy(() => import("@/features/candidates/components/new-candidate-dialog").then(m => ({ default: m.NewCandidateDialog })));
const ArchiveCandidateDialog = lazy(() => import("@/features/candidates/components/archive-candidate-dialog").then(m => ({ default: m.ArchiveCandidateDialog })));
import { useAuth } from "@/features/auth/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";
import { candidateStatusBadgeClass, resolveCandidateStatus, canArchiveCandidate } from "@/features/candidates/utils/status";
import { getHiringPhase } from "@/features/candidates/utils/hiring-phase";
import { useLocalStorage } from "@/shared/hooks/use-local-storage";
import type { Candidate, CandidateType, HiringStage } from "@shared/schemas";
import { PaginationControls } from "@/shared/components/pagination-controls";

type CandidateWithStage = Candidate & {
  currentStage?: {
    id: string;
    name: string;
    orderIndex: number;
    phase?: string | null;
  };
  pendingAnchorCount?: number;
  openPrehireTasks?: number;
  openOnboardingTasks?: number;
};

const PAGE_SIZE = 5;

export default function CandidatesPage() {
  const [, setLocation] = useLocation();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [stageFilter, setStageFilter] = useState<string>("all");
  const [phaseFilter, setPhaseFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("createdAt");
  const [sortOrder, setSortOrder] = useState<string>("desc");
  const [showArchived, setShowArchived] = useLocalStorage("candidates-show-archived", false);
  const [showCanceled, setShowCanceled] = useLocalStorage("candidates-show-canceled", false);
  const [showCompleted, setShowCompleted] = useLocalStorage("candidates-show-completed", false);
  const [currentPage, setCurrentPage] = useState(1);
  const [isNewCandidateDialogOpen, setIsNewCandidateDialogOpen] = useState(false);
  const [archiveDialogCandidate, setArchiveDialogCandidate] = useState<any>(null);
  const { user } = useAuth();
  const [showNoPermission, setShowNoPermission] = useState(false);

  const { data: candidates = [], isLoading } = useQuery<CandidateWithStage[]>({
    // Include user id to avoid cross-user cache reuse when list visibility differs by role
    queryKey: ["/api/candidates", user?.id, showArchived],
    queryFn: async ({ queryKey }) => {
      const url = new URL(`${queryKey[0]}`, window.location.origin);
      // queryKey: [path, userId, showArchived]
      url.searchParams.set('includeArchived', String(queryKey[2]));
      const response = await fetch(url.toString(), { credentials: 'include' });
      if (!response.ok) throw new Error(`${response.status}: ${response.statusText}`);
      return response.json();
    },
    enabled: !!user,
  });

  const { data: candidateTypes = [] } = useQuery<CandidateType[]>({
    queryKey: ["/api/candidate-types", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/candidate-types");
      return res.json();
    },
  });

const { data: hiringStages = [] } = useQuery<HiringStage[]>({
  queryKey: ["/api/hiring-stages", user?.id],
  enabled: !!user,
  queryFn: async () => {
    const res = await apiRequest("GET", "/api/hiring-stages");
    return res.json();
  },
});

const phaseLabel = (phase?: string | null) => {
  if (phase === "loi_issued") return "LOI Issued";
  return phase === "onboarding" ? "Onboarding" : "Pre-hire";
};

const daysSince = (isoDate?: string | null) => {
  if (!isoDate) return null;
  const anchor = new Date(isoDate);
  if (Number.isNaN(anchor.getTime())) return null;
  // Normalize both dates to UTC midnight so we don't lose a day due to time zones
  const anchorMidnight = Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), anchor.getUTCDate());
  const now = new Date();
  const todayMidnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.floor((todayMidnight - anchorMidnight) / (1000 * 60 * 60 * 24));
};

const formatLooAge = (isoDate?: string | null) => {
  const diff = daysSince(isoDate);
  if (diff === null) return "–";
  if (diff === 0) return "Today";
  if (diff < 0) return `In ${Math.abs(diff)}d`;
  return `${diff}d`;
};

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter, typeFilter, stageFilter, phaseFilter, showArchived, showCanceled, showCompleted]);

  const filteredAndSortedCandidates = useMemo(() => {
    return candidates
    .filter((candidate: any) => {
      const matchesSearch = candidate.firstName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           candidate.lastName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           candidate.email.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = statusFilter === "all" || candidate.status === statusFilter;
      const matchesType = typeFilter === "all" || candidate.candidateTypeId === typeFilter;
      const matchesStage = stageFilter === "all" || 
                          (stageFilter === "not_started" && !candidate.currentStage?.id) ||
                          candidate.currentStage?.id === stageFilter;
      const resolvedPhase = getHiringPhase(candidate).phase;
      const matchesPhase =
        phaseFilter === "all" ||
        (phaseFilter === "pre_hire" && resolvedPhase === "pre_hire") ||
        (phaseFilter === "onboarding" && resolvedPhase === "onboarding");
      
      const isCanceledLike = candidate.status === "canceled" || candidate.status === "offer_declined";

      // Filter out canceled-like and completed unless explicitly shown via toggles
      // BUT if status filter explicitly selects canceled, show them regardless
      const matchesCanceled = 
        statusFilter === "canceled" || // Explicitly selected in dropdown
        statusFilter === "offer_declined" || // Programmatic/status-link compatibility
        showCanceled || // Toggle is on
        !isCanceledLike; // Not canceled/offer declined
      const matchesCompleted = 
        statusFilter === "completed" || // Explicitly selected in dropdown
        showCompleted || // Toggle is on
        candidate.status !== "completed"; // Not completed
      
      return matchesSearch && matchesStatus && matchesType && matchesStage && matchesPhase && matchesCanceled && matchesCompleted;
    })
    .sort((a, b) => {
      let aValue: any, bValue: any;
      
      switch (sortBy) {
        case "name":
          aValue = `${a.firstName} ${a.lastName}`.toLowerCase();
          bValue = `${b.firstName} ${b.lastName}`.toLowerCase();
          break;
        case "email":
          aValue = a.email.toLowerCase();
          bValue = b.email.toLowerCase();
          break;
        case "status":
          aValue = a.status;
          bValue = b.status;
          break;
        case "stage":
          aValue = a.currentStage?.name || "Not Started";
          bValue = b.currentStage?.name || "Not Started";
          break;
        case "looAge":
          const aLoo = a.offerLetterAcceptedAt || a.offerLetterIssuedAt;
          const bLoo = b.offerLetterAcceptedAt || b.offerLetterIssuedAt;
          aValue = aLoo ? new Date(aLoo) : new Date(0);
          bValue = bLoo ? new Date(bLoo) : new Date(0);
          break;
        case "anticipatedStartDate":
          aValue = a.anticipatedStartDate ? new Date(a.anticipatedStartDate) : new Date(0);
          bValue = b.anticipatedStartDate ? new Date(b.anticipatedStartDate) : new Date(0);
          break;
        case "createdAt":
        default:
          aValue = new Date(a.createdAt);
          bValue = new Date(b.createdAt);
          break;
      }
      
      if (aValue < bValue) return sortOrder === "asc" ? -1 : 1;
      if (aValue > bValue) return sortOrder === "asc" ? 1 : -1;
      return 0;
    });
  }, [candidates, searchTerm, statusFilter, typeFilter, stageFilter, phaseFilter, sortBy, sortOrder, showCanceled, showCompleted]);

  const pageSize = PAGE_SIZE;
  const totalCandidates = filteredAndSortedCandidates.length;
  const totalPages = totalCandidates > 0 ? Math.ceil(totalCandidates / pageSize) : 1;
  const paginatedCandidates = filteredAndSortedCandidates.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  useEffect(() => {
    setCurrentPage((prev) => Math.min(prev, totalPages));
  }, [totalPages]);

  const handleSort = (column: string) => {
    if (sortBy === column) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(column);
      setSortOrder("asc");
    }
  };

  const getSortIcon = (column: string) => {
    if (sortBy !== column) {
      return <ArrowUpDown className="w-4 h-4" />;
    }
    return sortOrder === "asc" ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />;
  };

  // Open dialog from query param (?new=1 or ?new=true)
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const wantNew = params.get("new");
      if (wantNew && ["1", "true", "yes"].includes(wantNew.toLowerCase())) {
        const canCreate = user && [
          "system_admin",
          "hr_staff",
          "department_admin",
          "division_leader",
          "manager",
        ].includes(user.role);
        if (canCreate) {
          setIsNewCandidateDialogOpen(true);
        } else {
          setShowNoPermission(true);
        }
      }
    } catch {
      // ignore
    }
  }, [user]);

  // Clean the query once opened to keep URL tidy
  useEffect(() => {
    if (isNewCandidateDialogOpen || showNoPermission) {
      const url = new URL(window.location.href);
      if (url.searchParams.has("new")) {
        url.searchParams.delete("new");
        setLocation(url.pathname + (url.search || ""), { replace: true });
      }
    }
  }, [isNewCandidateDialogOpen, showNoPermission, setLocation]);

  if (isLoading) {
    return (
      <div className="p-4 sm:p-6 space-y-4 xs:space-y-5 sm:space-y-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 xs:h-8 bg-muted rounded w-1/4"></div>
          <div className="h-24 xs:h-32 bg-muted rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-4 xs:space-y-5 sm:space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
        <div className="min-w-0">
          <h1 className="text-lg xs:text-xl sm:text-2xl font-bold text-foreground" data-testid="text-candidates-title">Candidates</h1>
          <p className="text-sm sm:text-base text-muted-foreground">Manage and track all hiring candidates</p>
        </div>
        {user && ["system_admin", "hr_staff", "department_admin", "division_leader", "manager"].includes(user.role) && (
          <Button 
            onClick={() => setIsNewCandidateDialogOpen(true)} 
            className="min-h-[44px] w-full sm:w-auto"
            data-testid="button-new-candidate"
          >
            <Plus className="w-4 h-4 sm:mr-2" />
            <span className="hidden sm:inline">New </span>Candidate
          </Button>
        )}
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-3 xs:p-4 sm:p-4">
          <div className="flex items-center gap-2 mb-3 text-sm font-medium text-muted-foreground">
            <Filter className="w-4 h-4" />
            <span>Filters</span>
          </div>
          <div className="space-y-3 sm:space-y-0 sm:flex sm:flex-wrap sm:gap-3">
            {/* Search - Full width on mobile */}
            <div className="w-full sm:flex-1 sm:min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                <Input
                  placeholder="Search candidates..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 min-h-[44px] w-full"
                  data-testid="input-search-candidates"
                />
              </div>
            </div>
            
            {/* Filters row */}
            <div className="grid grid-cols-1 sm:flex sm:flex-wrap gap-2 sm:gap-3">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full sm:w-[160px] min-h-[44px]" data-testid="select-status-filter">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="on_hold">On Hold</SelectItem>
                  <SelectItem value="canceled">Canceled</SelectItem>
                </SelectContent>
              </Select>
              
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-full sm:w-[160px] min-h-[44px]" data-testid="select-type-filter">
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  {candidateTypes.map((type) => (
                    <SelectItem key={type.id} value={type.id}>
                      {type.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              
              <Select value={stageFilter} onValueChange={setStageFilter}>
                <SelectTrigger className="w-full sm:w-[160px] min-h-[44px]" data-testid="select-stage-filter">
                  <SelectValue placeholder="Stage" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Stages</SelectItem>
                  <SelectItem value="not_started">Not Started</SelectItem>
                  {hiringStages.map((stage) => (
                    <SelectItem key={stage.id} value={stage.id}>
                      {stage.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={phaseFilter} onValueChange={setPhaseFilter}>
                <SelectTrigger className="w-full sm:w-[160px] min-h-[44px]" data-testid="select-phase-filter">
                  <SelectValue placeholder="Phase" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Phases</SelectItem>
                  <SelectItem value="pre_hire">Pre-hire</SelectItem>
                  <SelectItem value="onboarding">Onboarding</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            {/* Toggle Switches */}
            <div className="flex flex-col sm:flex-row flex-wrap gap-3 sm:gap-4">
              <div className="flex items-center space-x-2">
                <Switch 
                  id="show-archived"
                  checked={showArchived}
                  onCheckedChange={setShowArchived}
                  data-testid="switch-show-archived"
                />
                <Label htmlFor="show-archived" className="text-sm font-medium">
                  Show Archived
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <Switch 
                  id="show-canceled"
                  checked={showCanceled}
                  onCheckedChange={setShowCanceled}
                  data-testid="switch-show-canceled"
                />
                <Label htmlFor="show-canceled" className="text-sm font-medium">
                  Show Canceled/Declined
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <Switch 
                  id="show-completed"
                  checked={showCompleted}
                  onCheckedChange={setShowCompleted}
                  data-testid="switch-show-completed"
                />
                <Label htmlFor="show-completed" className="text-sm font-medium">
                  Show Completed
                </Label>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Desktop Table */}
      <Card className="hidden md:block overflow-hidden">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <caption className="sr-only">Candidates table with sorting and filtering capabilities</caption>
            <TableHeader>
              <TableRow>
                <TableHead>
                  <Button
                    variant="ghost"
                    className="h-auto p-0 font-semibold bg-transparent hover:bg-transparent hover:text-amber-700 focus-visible"
                    onClick={() => handleSort("name")}
                    data-testid="header-sort-name"
                  >
                    Name {getSortIcon("name")}
                  </Button>
                </TableHead>
                <TableHead>
                  <Button
                    variant="ghost"
                    className="h-auto p-0 font-semibold bg-transparent hover:bg-transparent hover:text-amber-700 focus-visible"
                    onClick={() => handleSort("email")}
                    data-testid="header-sort-email"
                  >
                    Email {getSortIcon("email")}
                  </Button>
                </TableHead>
                <TableHead>Type</TableHead>
                <TableHead>
                  <Button
                    variant="ghost"
                    className="h-auto p-0 font-semibold bg-transparent hover:bg-transparent hover:text-amber-700 focus-visible"
                    onClick={() => handleSort("status")}
                    data-testid="header-sort-status"
                  >
                    Status {getSortIcon("status")}
                  </Button>
                </TableHead>
                <TableHead>
                  <Button
                    variant="ghost"
                    className="h-auto p-0 font-semibold bg-transparent hover:bg-transparent hover:text-amber-700 focus-visible"
                    onClick={() => handleSort("stage")}
                    data-testid="header-sort-stage"
                  >
                    Stage {getSortIcon("stage")}
                  </Button>
                </TableHead>
                <TableHead className="hidden xl:table-cell">
                  <Button
                    variant="ghost"
                    className="h-auto p-0 font-semibold bg-transparent hover:bg-transparent hover:text-amber-700 focus-visible"
                    onClick={() => handleSort("looAge")}
                    data-testid="header-sort-loo-age"
                  >
                    Days Since LOO {getSortIcon("looAge")}
                  </Button>
                </TableHead>
                <TableHead className="hidden lg:table-cell">
                  <Button
                    variant="ghost"
                    className="h-auto p-0 font-semibold bg-transparent hover:bg-transparent hover:text-amber-700 focus-visible"
                    onClick={() => handleSort("anticipatedStartDate")}
                    data-testid="header-sort-anticipated-start-date"
                  >
                    Anticipated Start {getSortIcon("anticipatedStartDate")}
                  </Button>
                </TableHead>
                <TableHead className="hidden xl:table-cell">
                  <Button
                    variant="ghost"
                    className="h-auto p-0 font-semibold bg-transparent hover:bg-transparent hover:text-amber-700 focus-visible"
                    onClick={() => handleSort("createdAt")}
                    data-testid="header-sort-created"
                  >
                    Created {getSortIcon("createdAt")}
                  </Button>
                </TableHead>
                <TableHead className="h-auto p-0 w-[150px] font-semibold text-center">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredAndSortedCandidates.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                    No candidates found matching your criteria
                  </TableCell>
                </TableRow>
              ) : (
                paginatedCandidates.map((candidate: any) => {
                  const phase = getHiringPhase(candidate).phase;
                  const phaseText = phaseLabel(phase);
                  const resolvedStatus = resolveCandidateStatus(candidate);
                  const statusClass = candidateStatusBadgeClass(resolvedStatus.status);
                  const pendingAnchorCount = Number(candidate.pendingAnchorCount ?? 0);
                  const openPrehire = Number(candidate.openPrehireTasks ?? 0);
                  const openOnboarding = Number(candidate.openOnboardingTasks ?? 0);
                  const looAnchor = candidate.offerLetterAcceptedAt || candidate.offerLetterIssuedAt || null;
                  const looAgeLabel = formatLooAge(looAnchor);
                  return (
                    <TableRow key={candidate.id} className={`hover:bg-muted/50 ${candidate.archived ? 'opacity-60' : ''}`} data-testid={`row-candidate-${candidate.id}`}>
                      <TableCell className="font-medium">
                        <div className="flex items-center space-x-2">
                          <Link href={`/candidates/${candidate.id}`} className="text-primary hover:underline">
                            {candidate.firstName} {candidate.lastName}
                          </Link>
                          {candidate.archived && (
                            <Badge variant="destructive" className="text-xs" data-testid={`badge-archived-${candidate.id}`}>
                              ARCHIVED
                            </Badge>
                          )}
                          {pendingAnchorCount > 0 && (
                              <Badge variant="outline" className="text-xs text-amber-600 dark:text-amber-400 border-amber-400 dark:border-amber-600" title="Tasks waiting for required dates">
                                {pendingAnchorCount} pending
                              </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Link href={`/candidates/${candidate.id}`} className="text-muted-foreground hover:text-foreground hover:underline break-words">
                          {candidate.email}
                        </Link>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {candidateTypes.find((type) => type.id === candidate.candidateTypeId)?.name || "Unknown"}
                      </TableCell>
                      <TableCell>
                        <Badge className={`${statusClass} justify-center text-center`}>
                          {resolvedStatus.label.toUpperCase()}
                        </Badge>
                      </TableCell>
                      <TableCell data-testid={`cell-stage-${candidate.id}`}>
                        <div className="flex flex-col">
                          <Badge variant="outline" className="whitespace-nowrap bg-secondary justify-center text-center">
                            {candidate.currentStage?.name || "Not Started"}
                          </Badge>
                          <span className="text-xs text-muted-foreground capitalize mt-1">{phaseText}</span>
                          <span className="text-xs text-muted-foreground mt-1">
                            {openPrehire} pre-hire • {openOnboarding} onboarding
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="hidden xl:table-cell text-muted-foreground">
                        {looAgeLabel}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-muted-foreground">
                        {candidate.anticipatedStartDate ? new Date(candidate.anticipatedStartDate).toLocaleDateString() : "-"}
                      </TableCell>
                      <TableCell className="hidden xl:table-cell text-muted-foreground">
                        {new Date(candidate.createdAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center space-x-2">
                          <Link href={`/candidates/${candidate.id}`}>
                            <Button variant="ghost" size="sm" className="focus-visible" data-testid={`button-view-candidate-${candidate.id}`}>
                              View
                            </Button>
                          </Link>
                          {user && ["system_admin", "hr_staff"].includes(user.role) && (candidate.archived || canArchiveCandidate(candidate)) && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setArchiveDialogCandidate(candidate)}
                              className={`focus-visible ${candidate.archived ? "text-green-600 hover:text-green-700 dark:text-emerald-400 dark:hover:text-emerald-300" : "text-destructive hover:text-destructive"}`}
                              data-testid={`button-${candidate.archived ? 'restore' : 'archive'}-candidate-${candidate.id}`}
                            >
                              {candidate.archived ? (
                                <RotateCcw className="w-4 h-4" />
                              ) : (
                                <Archive className="w-4 h-4" />
                              )}
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
          </div>
          {totalCandidates > pageSize && (
            <div className="border-t border-border/60 px-4 py-3">
              <PaginationControls
                page={currentPage}
                pageSize={pageSize}
                totalCount={totalCandidates}
                totalPages={totalPages}
                onPageChange={setCurrentPage}
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Mobile Cards */}
      <div className="space-y-3 md:hidden">
        {filteredAndSortedCandidates.length === 0 ? (
          <Card>
            <CardContent className="p-4 xs:p-6 text-center">
              <p className="text-muted-foreground">No candidates found matching your criteria</p>
            </CardContent>
          </Card>
        ) : (
          <>
          <ul className="grid gap-3" role="list">
            {paginatedCandidates.map((candidate: any) => {
              const pendingCount = Number(candidate.pendingAnchorCount ?? 0);
              const openPrehire = Number(candidate.openPrehireTasks ?? 0);
              const openOnboarding = Number(candidate.openOnboardingTasks ?? 0);
              const phase = getHiringPhase(candidate).phase;
              const resolvedStatus = resolveCandidateStatus(candidate);
              const statusClass = candidateStatusBadgeClass(resolvedStatus.status);
              return (
              <li key={candidate.id}>
                <Card className={`p-4 hover:shadow-md transition-shadow ${candidate.archived ? 'opacity-60' : ''}`} data-testid={`card-candidate-${candidate.id}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-sm font-medium text-foreground truncate">
                          <Link href={`/candidates/${candidate.id}`} className="text-primary hover:underline">
                            {candidate.firstName} {candidate.lastName}
                          </Link>
                        </h3>
                        {candidate.archived && (
                          <Badge variant="destructive" className="text-xs" data-testid={`badge-archived-${candidate.id}`}>
                            ARCHIVED
                          </Badge>
                        )}
                        {pendingCount > 0 && (
                          <Badge variant="outline" className="text-xs text-amber-600 dark:text-amber-400 border-amber-400 dark:border-amber-600">
                            {pendingCount} pending
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs truncate mb-2">
                        <Link href={`/candidates/${candidate.id}`} className="text-primary hover:underline break-words">
                          {candidate.email}
                        </Link>
                      </p>
                      <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                        <div>
                          <dt className="text-muted-foreground">Type</dt>
                          <dd className="font-medium text-foreground">
                            {candidateTypes.find((type) => type.id === candidate.candidateTypeId)?.name || "Unknown"}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-muted-foreground">Status</dt>
                          <dd>
                            <Badge className={`${statusClass} text-xs justify-center text-center`}>
                              {resolvedStatus.label.toUpperCase()}
                            </Badge>
                          </dd>
                        </div>
                        <div className="col-span-2">
                          <dt className="text-muted-foreground">Stage</dt>
                          <dd>
                            <Badge variant="outline" className="text-xs whitespace-nowrap bg-secondary justify-center text-center">
                              {candidate.currentStage?.name || "Not Started"}
                            </Badge>
                            <span className="block text-[10px] text-muted-foreground mt-1 capitalize">
                              {phaseLabel(phase)}
                            </span>
                            <span className="block text-[10px] text-muted-foreground mt-1">
                              {openPrehire} pre-hire • {openOnboarding} onboarding
                            </span>
                          </dd>
                        </div>
                        <div>
                          <dt className="text-muted-foreground">Days since LOO</dt>
                          <dd className="font-medium text-foreground">
                            {(() => {
                              const looAnchor = candidate.offerLetterAcceptedAt || candidate.offerLetterIssuedAt || null;
                              return formatLooAge(looAnchor);
                            })()}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-muted-foreground">Anticipated Start</dt>
                          <dd className="font-medium text-foreground">
                            {candidate.anticipatedStartDate ? new Date(candidate.anticipatedStartDate).toLocaleDateString() : "-"}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-muted-foreground">Created</dt>
                          <dd className="font-medium text-foreground">
                            {new Date(candidate.createdAt).toLocaleDateString()}
                          </dd>
                        </div>
                      </dl>
                    </div>
                  </div>
                  
                  {/* Actions */}
                  <div className="flex items-center justify-start gap-2 mt-3 pt-3 border-t">
                    <Link href={`/candidates/${candidate.id}`}>
                      <Button variant="ghost" size="sm" className="min-h-[44px] flex-1 focus-visible" data-testid={`button-view-candidate-${candidate.id}`}>
                        View Details
                      </Button>
                    </Link>
                    {user && ["system_admin", "hr_staff"].includes(user.role) && (candidate.archived || canArchiveCandidate(candidate)) && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setArchiveDialogCandidate(candidate)}
                        className={`min-h-[44px] focus-visible ${candidate.archived ? "text-green-600 hover:text-green-700 dark:text-emerald-400 dark:hover:text-emerald-300" : "text-destructive hover:text-destructive"}`}
                        data-testid={`button-${candidate.archived ? 'restore' : 'archive'}-candidate-${candidate.id}`}
                        aria-label={candidate.archived ? "Restore candidate" : "Archive candidate"}
                      >
                        {candidate.archived ? (
                          <RotateCcw className="w-4 h-4" />
                        ) : (
                          <Archive className="w-4 h-4" />
                        )}
                      </Button>
                    )}
                  </div>
                </Card>
              </li>
            )})}
          </ul>
          {totalCandidates > pageSize && (
            <div className="mt-4">
              <PaginationControls
                page={currentPage}
                pageSize={pageSize}
                totalCount={totalCandidates}
                totalPages={totalPages}
                onPageChange={setCurrentPage}
                className="justify-center"
              />
            </div>
          )}
          </>
        )}
      </div>
      
      {/* Only render dialogs when open to avoid loading their dependencies */}
      {isNewCandidateDialogOpen && (
        <Suspense fallback={null}>
          <NewCandidateDialog
            open={isNewCandidateDialogOpen}
            onOpenChange={setIsNewCandidateDialogOpen}
          />
        </Suspense>
      )}
      
      {archiveDialogCandidate && (
        <Suspense fallback={null}>
          <ArchiveCandidateDialog
            candidate={archiveDialogCandidate}
            open={!!archiveDialogCandidate}
            onOpenChange={(open) => {
              if (!open) setArchiveDialogCandidate(null);
            }}
          />
        </Suspense>
      )}

      {/* No-permission notice if new candidate requested via URL */}
      <AlertDialog open={showNoPermission} onOpenChange={setShowNoPermission}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Insufficient Permissions</AlertDialogTitle>
            <AlertDialogDescription>
              You don’t have permission to create candidates. Please contact an administrator if you believe this is a mistake.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setShowNoPermission(false)}>OK</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
