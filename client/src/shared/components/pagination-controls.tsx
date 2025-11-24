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

  const visiblePages: Array<number | "ellipsis"> = (() => {
    if (computedPages <= 5) {
      return Array.from({ length: computedPages }, (_, idx) => idx + 1);
    }

    const pagesToShow = new Set<number>([1, computedPages]);

    if (page <= 2) {
      pagesToShow.add(2);
      pagesToShow.add(3);
    } else if (page >= computedPages - 1) {
      pagesToShow.add(computedPages - 1);
      pagesToShow.add(computedPages - 2);
    } else {
      pagesToShow.add(page - 1);
      pagesToShow.add(page);
      pagesToShow.add(page + 1);
    }

    const sortedPages = Array.from(pagesToShow)
      .filter((num) => num >= 1 && num <= computedPages)
      .sort((a, b) => a - b);

    const withEllipsis: Array<number | "ellipsis"> = [];

    for (let i = 0; i < sortedPages.length; i += 1) {
      const current = sortedPages[i];
      const prev = sortedPages[i - 1];
      if (prev && current - prev > 1) {
        withEllipsis.push("ellipsis");
      }
      withEllipsis.push(current);
    }

    return withEllipsis;
  })();

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
