/**
 * VariableInsertDialog — A modal dialog for selecting and inserting
 * template variables into the email editor.
 *
 * Groups variables by category and shows name, description, and
 * the placeholder syntax that will be inserted.
 */
import { useState, useMemo } from "react";
import { Variable, Search } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/shared/components/ui/dialog";
import { Input } from "@/shared/components/ui/input";
import { Badge } from "@/shared/components/ui/badge";
import { ScrollArea } from "@/shared/components/ui/scroll-area";
import type { TemplateVariable } from "@shared/schemas/email-template.schema";

// ============================================================================
// TYPES
// ============================================================================

interface VariableInsertDialogProps {
  /** Whether the dialog is open */
  open: boolean;
  /** Callback to close the dialog */
  onOpenChange: (open: boolean) => void;
  /** Available variables for the current template type */
  variables: TemplateVariable[];
  /** Callback when a variable is selected */
  onSelect: (variableName: string) => void;
}

// ============================================================================
// COMPONENT
// ============================================================================

export function VariableInsertDialog({
  open,
  onOpenChange,
  variables,
  onSelect,
}: VariableInsertDialogProps) {
  const [search, setSearch] = useState("");

  // Filter variables by search term
  const filteredVariables = useMemo(() => {
    if (!search.trim()) return variables;
    const lower = search.toLowerCase();
    return variables.filter(
      (v) =>
        v.name.toLowerCase().includes(lower) ||
        v.label.toLowerCase().includes(lower) ||
        v.description.toLowerCase().includes(lower) ||
        v.category.toLowerCase().includes(lower)
    );
  }, [variables, search]);

  // Group filtered variables by category
  const grouped = useMemo(() => {
    const groups = new Map<string, TemplateVariable[]>();
    for (const v of filteredVariables) {
      const list = groups.get(v.category) ?? [];
      list.push(v);
      groups.set(v.category, list);
    }
    return groups;
  }, [filteredVariables]);

  const handleSelect = (variableName: string) => {
    onSelect(variableName);
    onOpenChange(false);
    setSearch("");
  };

  return (
    <Dialog open={open} onOpenChange={(val) => {
      onOpenChange(val);
      if (!val) setSearch("");
    }}>
      <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Variable className="h-5 w-5" />
            Insert Variable
          </DialogTitle>
          <DialogDescription>
            Click a variable to insert it into the template. Variables will be replaced with actual values when the email is sent.
          </DialogDescription>
        </DialogHeader>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search variables..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Variable list */}
        <ScrollArea className="flex-1 min-h-0 max-h-[50vh] -mx-2 px-2">
          {grouped.size === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No variables match your search.
            </div>
          ) : (
            <div className="space-y-4 pb-2">
              {Array.from(grouped.entries()).map(([category, vars]) => (
                <div key={category}>
                  <div className="flex items-center gap-2 mb-2">
                    <Badge variant="secondary" className="text-xs font-medium">
                      {category}
                    </Badge>
                  </div>
                  <div className="space-y-1">
                    {vars.map((v) => (
                      <button
                        key={v.name}
                        type="button"
                        onClick={() => handleSelect(v.name)}
                        className="w-full text-left rounded-md px-3 py-2 hover:bg-accent transition-colors group"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">{v.label}</span>
                          <code className="text-xs text-muted-foreground font-mono bg-muted px-1.5 py-0.5 rounded group-hover:bg-background">
                            {"{{"}
                            {v.name}
                            {"}}"}
                          </code>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {v.description}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
