import { ReactNode } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { TableHead } from "./ui/table";
import { cn } from "@/lib/utils";
import { SortDirection } from "@/shared/hooks/use-sortable-table";

type SortableTableHeaderProps<K extends string> = {
  columnKey: K;
  label: ReactNode;
  onSort?: (key: K) => void;
  direction?: SortDirection;
  sortable?: boolean;
  className?: string;
};

export function SortableTableHeader<K extends string>({
  columnKey,
  label,
  onSort,
  direction,
  sortable = true,
  className,
}: SortableTableHeaderProps<K>) {
  if (!sortable) {
    return <TableHead className={className}>{label}</TableHead>;
  }

  const ariaSort = direction === "asc" ? "ascending" : direction === "desc" ? "descending" : "none";

  const icon = direction === "asc" ? (
    <ArrowUp className="h-4 w-4" />
  ) : direction === "desc" ? (
    <ArrowDown className="h-4 w-4" />
  ) : (
    <ArrowUpDown className="h-4 w-4" />
  );

  return (
    <TableHead className={cn("select-none", className)} aria-sort={ariaSort}>
      <button
        type="button"
        onClick={() => onSort?.(columnKey)}
        className="flex w-full items-center gap-2 text-left font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <span className="flex-1">{label}</span>
        <span className="text-muted-foreground">{icon}</span>
      </button>
    </TableHead>
  );
}
