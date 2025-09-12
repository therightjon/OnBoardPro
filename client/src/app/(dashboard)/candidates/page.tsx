import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import { Badge } from "@/shared/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/components/ui/table";
import { Plus, Search, Filter, ArrowUpDown, ArrowUp, ArrowDown, Archive, RotateCcw } from "lucide-react";
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
import { NewCandidateDialog } from "@/features/candidates/components/new-candidate-dialog";
import { ArchiveCandidateDialog } from "@/features/candidates/components/archive-candidate-dialog";
import { useAuth } from "@/features/auth/hooks/use-auth";
import type { Candidate, CandidateType, HiringStage } from "@shared/schemas";

type CandidateWithStage = Candidate & {
  currentStage?: {
    id: string;
    name: string;
    orderIndex: number;
  };
};

export default function CandidatesPage() {
  const [, setLocation] = useLocation();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [stageFilter, setStageFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("createdAt");
  const [sortOrder, setSortOrder] = useState<string>("desc");
  const [showArchived, setShowArchived] = useState(false);
  const [isNewCandidateDialogOpen, setIsNewCandidateDialogOpen] = useState(false);
  const [archiveDialogCandidate, setArchiveDialogCandidate] = useState<any>(null);
  const { user } = useAuth();
  const [showNoPermission, setShowNoPermission] = useState(false);

  const { data: candidates = [], isLoading } = useQuery<CandidateWithStage[]>({
    queryKey: ["/api/candidates", showArchived],
    queryFn: async ({ queryKey }) => {
      const url = new URL(`${queryKey[0]}`, window.location.origin);
      url.searchParams.set('includeArchived', String(queryKey[1]));
      const response = await fetch(url.toString(), { credentials: 'include' });
      if (!response.ok) throw new Error(`${response.status}: ${response.statusText}`);
      return response.json();
    },
  });

  const { data: candidateTypes = [] } = useQuery<CandidateType[]>({
    queryKey: ["/api/candidate-types"],
  });

  const { data: hiringStages = [] } = useQuery<HiringStage[]>({
    queryKey: ["/api/hiring-stages"],
  });

  const filteredAndSortedCandidates = candidates
    .filter((candidate: any) => {
      const matchesSearch = candidate.firstName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           candidate.lastName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           candidate.email.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = statusFilter === "all" || candidate.status === statusFilter;
      const matchesType = typeFilter === "all" || candidate.candidateTypeId === typeFilter;
      const matchesStage = stageFilter === "all" || 
                          (stageFilter === "not_started" && !candidate.currentStage?.id) ||
                          candidate.currentStage?.id === stageFilter;
      
      return matchesSearch && matchesStatus && matchesType && matchesStage;
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
        case "startDate":
          aValue = a.startDate ? new Date(a.startDate) : new Date(0);
          bValue = b.startDate ? new Date(b.startDate) : new Date(0);
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

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active": return "bg-accent/10 text-accent";
      case "draft": return "bg-chart-3/10 text-chart-3";
      case "completed": return "bg-chart-5/10 text-chart-5";
      case "on_hold": return "bg-chart-4/10 text-chart-4";
      case "canceled": return "bg-destructive/10 text-destructive";
      default: return "bg-muted text-muted-foreground";
    }
  };

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
      <div className="flex flex-col xs:flex-row xs:items-center xs:justify-between gap-3 xs:gap-4">
        <div className="min-w-0">
          <h1 className="text-lg xs:text-xl sm:text-2xl font-bold text-foreground" data-testid="text-candidates-title">Candidates</h1>
          <p className="text-sm sm:text-base text-muted-foreground">Manage and track all hiring candidates</p>
        </div>
        {user && ["system_admin", "hr_staff", "department_admin", "division_leader", "manager"].includes(user.role) && (
          <Button 
            onClick={() => setIsNewCandidateDialogOpen(true)} 
            className="min-h-[44px] w-full xs:w-auto"
            data-testid="button-new-candidate"
          >
            <Plus className="w-4 h-4 xs:mr-2" />
            <span className="hidden xs:inline">New </span>Candidate
          </Button>
        )}
      </div>

      {/* Filters */}
      <Card>
        <CardHeader className="p-3 xs:p-4 sm:p-6">
          <CardTitle className="flex items-center text-base xs:text-lg">
            <Filter className="w-4 h-4 mr-2" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3 xs:p-4 sm:p-6 pt-0">
          <div className="space-y-3 sm:space-y-0 sm:flex sm:flex-wrap sm:gap-4">
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
            <div className="grid grid-cols-1 xs:grid-cols-2 sm:flex sm:flex-wrap gap-2 sm:gap-3">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full xs:w-auto sm:w-[160px] min-h-[44px]" data-testid="select-status-filter">
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
                <SelectTrigger className="w-full xs:w-auto sm:w-[160px] min-h-[44px]" data-testid="select-type-filter">
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
                <SelectTrigger className="w-full xs:w-auto sm:w-[160px] min-h-[44px]" data-testid="select-stage-filter">
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

              {/* Archive Toggle */}
              <div className="flex items-center space-x-2 min-h-[44px] xs:col-span-2 sm:col-span-1">
                <input
                  type="checkbox"
                  id="show-archived"
                  checked={showArchived}
                  onChange={(e) => setShowArchived(e.target.checked)}
                  className="rounded border-gray-300 w-4 h-4"
                  data-testid="checkbox-show-archived"
                />
                <label htmlFor="show-archived" className="text-xs xs:text-sm font-medium">
                  Show archived
                </label>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Desktop Table */}
      <Card className="hidden md:block">
        <CardContent className="p-0">
          <Table>
            <caption className="sr-only">Candidates table with sorting and filtering capabilities</caption>
            <TableHeader>
              <TableRow>
                <TableHead>
                  <Button
                    variant="ghost"
                    className="h-auto p-0 font-semibold hover:bg-transparent focus-visible"
                    onClick={() => handleSort("name")}
                    data-testid="header-sort-name"
                  >
                    Name {getSortIcon("name")}
                  </Button>
                </TableHead>
                <TableHead>
                  <Button
                    variant="ghost"
                    className="h-auto p-0 font-semibold hover:bg-transparent focus-visible"
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
                    className="h-auto p-0 font-semibold hover:bg-transparent focus-visible"
                    onClick={() => handleSort("status")}
                    data-testid="header-sort-status"
                  >
                    Status {getSortIcon("status")}
                  </Button>
                </TableHead>
                <TableHead>
                  <Button
                    variant="ghost"
                    className="h-auto p-0 font-semibold hover:bg-transparent focus-visible"
                    onClick={() => handleSort("stage")}
                    data-testid="header-sort-stage"
                  >
                    Stage {getSortIcon("stage")}
                  </Button>
                </TableHead>
                <TableHead className="hidden lg:table-cell">
                  <Button
                    variant="ghost"
                    className="h-auto p-0 font-semibold hover:bg-transparent focus-visible"
                    onClick={() => handleSort("startDate")}
                    data-testid="header-sort-start-date"
                  >
                    Start Date {getSortIcon("startDate")}
                  </Button>
                </TableHead>
                <TableHead className="hidden xl:table-cell">
                  <Button
                    variant="ghost"
                    className="h-auto p-0 font-semibold hover:bg-transparent focus-visible"
                    onClick={() => handleSort("createdAt")}
                    data-testid="header-sort-created"
                  >
                    Created {getSortIcon("createdAt")}
                  </Button>
                </TableHead>
                <TableHead className="w-[150px] text-center">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredAndSortedCandidates.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    No candidates found matching your criteria
                  </TableCell>
                </TableRow>
              ) : (
                filteredAndSortedCandidates.map((candidate: any) => (
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
                      </div>
                    </TableCell>
                    <TableCell>
                      <Link href={`/candidates/${candidate.id}`} className="text-primary hover:underline break-words">
                        {candidate.email}
                      </Link>
                    </TableCell>
                    <TableCell>
                      {candidateTypes.find((type) => type.id === candidate.candidateTypeId)?.name || "Unknown"}
                    </TableCell>
                    <TableCell>
                      <Badge className={getStatusColor(candidate.status)}>
                        {candidate.status.replace('_', ' ').toUpperCase()}
                      </Badge>
                    </TableCell>
                    <TableCell data-testid={`cell-stage-${candidate.id}`}>
                      <Badge variant="outline" className="bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800 whitespace-nowrap">
                        {candidate.currentStage?.name || "Not Started"}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      {candidate.startDate ? new Date(candidate.startDate).toLocaleDateString() : "-"}
                    </TableCell>
                    <TableCell className="hidden xl:table-cell">
                      {new Date(candidate.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center space-x-2">
                        <Link href={`/candidates/${candidate.id}`}>
                          <Button variant="ghost" size="sm" className="focus-visible" data-testid={`button-view-candidate-${candidate.id}`}>
                            View
                          </Button>
                        </Link>
                        {user && ["system_admin", "hr_staff"].includes(user.role) && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setArchiveDialogCandidate(candidate)}
                            className={`focus-visible ${candidate.archived ? "text-green-600 hover:text-green-700" : "text-destructive hover:text-destructive"}`}
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
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Mobile Cards */}
      <div className="md:hidden">
        {filteredAndSortedCandidates.length === 0 ? (
          <Card>
            <CardContent className="p-4 xs:p-6 text-center">
              <p className="text-muted-foreground">No candidates found matching your criteria</p>
            </CardContent>
          </Card>
        ) : (
          <ul className="grid gap-3" role="list">
            {filteredAndSortedCandidates.map((candidate: any) => (
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
                            <Badge className={`${getStatusColor(candidate.status)} text-xs`}>
                              {candidate.status.replace('_', ' ').toUpperCase()}
                            </Badge>
                          </dd>
                        </div>
                        <div className="col-span-2">
                          <dt className="text-muted-foreground">Stage</dt>
                          <dd>
                            <Badge variant="outline" className="bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800 text-xs whitespace-nowrap">
                              {candidate.currentStage?.name || "Not Started"}
                            </Badge>
                          </dd>
                        </div>
                        <div>
                          <dt className="text-muted-foreground">Start Date</dt>
                          <dd className="font-medium text-foreground">
                            {candidate.startDate ? new Date(candidate.startDate).toLocaleDateString() : "-"}
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
                    {user && ["system_admin", "hr_staff"].includes(user.role) && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setArchiveDialogCandidate(candidate)}
                        className={`min-h-[44px] focus-visible ${candidate.archived ? "text-green-600 hover:text-green-700" : "text-destructive hover:text-destructive"}`}
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
            ))}
          </ul>
        )}
      </div>
      
      <NewCandidateDialog
        open={isNewCandidateDialogOpen}
        onOpenChange={setIsNewCandidateDialogOpen}
      />
      
      <ArchiveCandidateDialog
        candidate={archiveDialogCandidate}
        open={!!archiveDialogCandidate}
        onOpenChange={(open) => {
          if (!open) setArchiveDialogCandidate(null);
        }}
      />

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
