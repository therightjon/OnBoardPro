import { useMemo, useState } from "react";

export type SortDirection = "asc" | "desc" | null;

export type SortState<K extends string> = {
  key: K | null;
  direction: SortDirection;
};

type SortableValue = string | number | boolean | Date | null | undefined;

type SortComparator<T> = (a: T, b: T, direction: Exclude<SortDirection, null>) => number;

type SortColumn<T> = {
  getValue?: (row: T) => SortableValue;
  compare?: SortComparator<T>;
};

type UseSortableTableArgs<T, K extends string> = {
  rows: T[];
  columns: Record<K, SortColumn<T>>;
  initialState?: SortState<K>;
};

const normalizeValue = (value: SortableValue) => {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "string") return value.toLowerCase();
  if (typeof value === "boolean") return Number(value);
  return value ?? null;
};

const defaultComparator = <T,>(getValue?: (row: T) => SortableValue): SortComparator<T> => {
  return (a, b, direction) => {
    if (!getValue) return 0;

    const aValue = normalizeValue(getValue(a));
    const bValue = normalizeValue(getValue(b));

    const aMissing = aValue === null;
    const bMissing = bValue === null;

    if (aMissing && bMissing) return 0;
    if (aMissing) return 1; // Always push missing values to the bottom
    if (bMissing) return -1;

    if (aValue < bValue) return direction === "asc" ? -1 : 1;
    if (aValue > bValue) return direction === "asc" ? 1 : -1;
    return 0;
  };
};

export function useSortableTable<T, K extends string>({
  rows,
  columns,
  initialState,
}: UseSortableTableArgs<T, K>) {
  const [sortState, setSortState] = useState<SortState<K>>(
    initialState ?? { key: null, direction: null }
  );

  const sortedRows = useMemo(() => {
    if (!sortState.key || !sortState.direction) return rows;

    const column = columns[sortState.key];
    if (!column) return rows;

    const comparator = column.compare ?? defaultComparator(column.getValue);
    const direction = sortState.direction === "asc" ? "asc" : "desc";

    return [...rows].sort((a, b) => comparator(a, b, direction));
  }, [rows, columns, sortState]);

  const toggleSort = (key: K) => {
    setSortState((prev) => {
      if (prev.key !== key) return { key, direction: "asc" };
      if (prev.direction === "asc") return { key, direction: "desc" };
      return { key: null, direction: null };
    });
  };

  const getDirectionFor = (key: K): SortDirection => {
    return sortState.key === key ? sortState.direction : null;
  };

  return {
    sortedRows,
    sortState,
    toggleSort,
    getDirectionFor,
    setSortState,
  };
}
