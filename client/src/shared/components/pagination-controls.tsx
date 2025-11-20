import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/shared/components/ui/pagination";
import { cn } from "@/lib/utils";

type PaginationControlsProps = {
  page: number;
  pageSize: number;
  totalCount: number;
  onPageChange: (page: number) => void;
  totalPages?: number;
  className?: string;
};

export function PaginationControls({
  page,
  pageSize,
  totalCount,
  onPageChange,
  totalPages,
  className,
}: PaginationControlsProps) {
  if (totalCount <= pageSize) return null;

  const computedPages = totalPages ?? (totalCount > 0 ? Math.ceil(totalCount / pageSize) : 1);
  const canGoPrevious = page > 1;
  const canGoNext = page < computedPages;

  const visiblePages: Array<number | "ellipsis-left" | "ellipsis-right"> = [];

  if (computedPages <= 7) {
    for (let i = 1; i <= computedPages; i += 1) {
      visiblePages.push(i);
    }
  } else {
    visiblePages.push(1);
    if (page > 4) {
      visiblePages.push("ellipsis-left");
    }

    const start = Math.max(2, page - 1);
    const end = Math.min(computedPages - 1, page + 1);

    for (let i = start; i <= end; i += 1) {
      visiblePages.push(i);
    }

    if (page < computedPages - 3) {
      visiblePages.push("ellipsis-right");
    }

    visiblePages.push(computedPages);
  }

  const changePage = (nextPage: number) => {
    onPageChange(Math.max(1, Math.min(nextPage, computedPages)));
  };

  return (
    <Pagination className={cn("w-full justify-end", className)}>
      <PaginationContent>
        <PaginationItem>
          <PaginationPrevious
            href="#"
            aria-disabled={!canGoPrevious}
            tabIndex={canGoPrevious ? 0 : -1}
            className={cn(!canGoPrevious && "pointer-events-none opacity-50")}
            onClick={(event) => {
              event.preventDefault();
              if (canGoPrevious) {
                changePage(page - 1);
              }
            }}
          />
        </PaginationItem>
        {visiblePages.map((item, index) => (
          <PaginationItem key={`${item}-${index}`}>
            {typeof item === "string" ? (
              <PaginationEllipsis />
            ) : (
              <PaginationLink
                href="#"
                isActive={page === item}
                aria-label={`Go to page ${item}`}
                onClick={(event) => {
                  event.preventDefault();
                  changePage(item);
                }}
              >
                {item}
              </PaginationLink>
            )}
          </PaginationItem>
        ))}
        <PaginationItem>
          <PaginationNext
            href="#"
            aria-disabled={!canGoNext}
            tabIndex={canGoNext ? 0 : -1}
            className={cn(!canGoNext && "pointer-events-none opacity-50")}
            onClick={(event) => {
              event.preventDefault();
              if (canGoNext) {
                changePage(page + 1);
              }
            }}
          />
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  );
}
