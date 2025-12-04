import * as React from 'react';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from '@/shared/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/components/ui/popover';
import { Check, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';

type Item = { id: string; name: string; score?: number };

type Props = {
  label: string;
  value: string | null;
  onChange: (id: string | null, item?: Item) => void;
  fetchItems: (q: string) => Promise<Item[]>;
  placeholder?: string;
  emptyText?: string; // custom empty state when no items
  autoCommitThreshold?: number; // default 0.45
  minAutoCommitLen?: number; // default 2
  disabled?: boolean;
  required?: boolean;
  onOpenChange?: (open: boolean) => void;
  onError?: (error: Error) => void;
  labelClassName?: string;
  size?: 'default' | 'sm';
  'data-testid'?: string;
};

export function AutoSelectCombobox({
  label,
  value,
  onChange,
  fetchItems,
  placeholder,
  emptyText,
  autoCommitThreshold = 0.45,
  minAutoCommitLen = 2,
  disabled,
  required,
  onOpenChange,
  onError,
  labelClassName,
  size = 'default',
  'data-testid': testId
}: Props) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [items, setItems] = React.useState<Item[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [selected, setSelected] = React.useState<Item | null>(null);
  const preloadedValueRef = React.useRef<string | null>(null);

  const load = React.useCallback(async (q: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchItems(q);
      setItems(data ?? []);
      
      // Auto-select logic
      const trimmed = q.trim();
      if (trimmed.length === 0) return; // do not auto-commit on empty query
      
      const exact = data.find(d => d.name.toLowerCase() === trimmed.toLowerCase());
      if (exact) { 
        setSelected(exact); 
        onChange(exact.id, exact); 
        return; 
      }
      
      const top = data[0];
      if (top && (data.length === 1 || (top.score ?? 0) >= autoCommitThreshold) && trimmed.length >= minAutoCommitLen) {
        setSelected(top); 
        onChange(top.id, top);
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to load items';
      setError(errorMsg);
      setItems([]);
      onError?.(err instanceof Error ? err : new Error(errorMsg));
    } finally {
      setLoading(false);
    }
  }, [fetchItems, onChange, autoCommitThreshold, minAutoCommitLen, onError]);

  // Load on open (seed with top items)
  React.useEffect(() => {
    if (open) { 
      load(query); 
    }
  }, [open, query, load]);

  // Keep displayed label in sync
  React.useEffect(() => {
    if (preloadedValueRef.current !== value) {
      preloadedValueRef.current = null;
    }

    if (!value) {
      setSelected(null);
      return;
    }

    const found = items.find(i => i.id === value);
    if (found) {
      setSelected(found);
      return;
    }

    if (loading || preloadedValueRef.current === value) {
      return;
    }

    preloadedValueRef.current = value;
    load('');
  }, [value, items, load, loading]);

  return (
    <div className="grid gap-1.5">
      <label className={cn("text-sm font-medium text-foreground", labelClassName)}>
        {label}{required ? ' *' : ''}
      </label>
      <Popover open={open} onOpenChange={(v: boolean) => { setOpen(v); onOpenChange?.(v); }}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              'inline-flex w-full items-center justify-between rounded-md border bg-background text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
              size === 'sm' ? 'px-2 py-1 min-h-[28px]' : 'px-3 py-2 min-h-[44px]',
              !selected && 'text-muted-foreground'
            )}
            disabled={disabled}
            data-testid={testId}
          >
            <span className="truncate">
              {selected?.name ?? (placeholder ?? 'Select...')}
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 opacity-50" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] max-w-[95vw] p-0">
          <Command shouldFilter={false}>
            <CommandInput
              placeholder={placeholder ?? 'Search...'}
              value={query}
              onValueChange={setQuery}
              onKeyDown={(e: React.KeyboardEvent) => {
                if (e.key === 'Enter') {
                  const top = items[0];
                  if (top) { 
                    setSelected(top); 
                    onChange(top.id, top); 
                    setOpen(false); 
                  }
                  e.preventDefault();
                }
              }}
            />
            {error ? (
              <div className="px-3 py-2 text-sm text-destructive">{error}</div>
            ) : query.trim().length === 0 && !loading && items.length === 0 ? (
              <div className="px-3 py-2 text-sm text-muted-foreground">Start typing to search…</div>
            ) : (
              <CommandEmpty>{loading ? 'Loading…' : (emptyText ?? 'No items available.')}</CommandEmpty>
            )}
            <CommandGroup>
              {items.map((item) => (
                <CommandItem
                  key={item.id}
                  value={item.name}
                  onSelect={() => {
                    setSelected(item);
                    onChange(item.id, item);
                    setOpen(false);
                  }}
                >
                  <Check 
                    className={cn(
                      'mr-2 h-4 w-4', 
                      value === item.id ? 'opacity-100' : 'opacity-0'
                    )} 
                  />
                  <span className="truncate">{item.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
