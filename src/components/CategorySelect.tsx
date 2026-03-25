import { useState, useRef, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ChevronDown, Plus } from "lucide-react";

const DEFAULT_CATEGORIES = ["Development", "Design", "Research", "Meeting", "Admin", "Other"];

interface CategorySelectProps {
  value: string;
  onChange: (value: string) => void;
  categories?: string[];
  className?: string;
  triggerClassName?: string;
}

const CategorySelect = ({ value, onChange, categories: extraCategories = [], className, triggerClassName }: CategorySelectProps) => {
  const [open, setOpen] = useState(false);
  const [customValue, setCustomValue] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  // Merge defaults + extra (from DB) + deduplicate
  const allCategories = Array.from(new Set([...DEFAULT_CATEGORIES, ...extraCategories])).sort();

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} className={`relative ${className || ""}`}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`flex items-center justify-between w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 ${triggerClassName || ""}`}
      >
        <span className={value ? "text-foreground" : "text-muted-foreground"}>{value || "Category"}</span>
        <ChevronDown className="h-4 w-4 opacity-50" />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-md border border-border bg-popover shadow-md">
          <div className="max-h-[200px] overflow-y-auto p-1">
            {allCategories.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => { onChange(c); setOpen(false); }}
                className={`w-full text-left px-3 py-1.5 text-sm rounded-sm hover:bg-accent hover:text-accent-foreground transition-colors ${value === c ? "bg-primary/10 text-primary font-medium" : "text-popover-foreground"}`}
              >
                {value === c && "✓ "}{c}
              </button>
            ))}
          </div>
          <div className="border-t border-border p-2 flex gap-1">
            <Input
              placeholder="New category..."
              value={customValue}
              onChange={(e) => setCustomValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && customValue.trim()) {
                  onChange(customValue.trim());
                  setCustomValue("");
                  setOpen(false);
                }
              }}
              className="h-7 text-xs bg-card border-border"
            />
            <Button
              type="button"
              size="sm"
              className="h-7 px-2 text-xs"
              disabled={!customValue.trim()}
              onClick={() => {
                onChange(customValue.trim());
                setCustomValue("");
                setOpen(false);
              }}
            >
              <Plus className="h-3 w-3" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default CategorySelect;
