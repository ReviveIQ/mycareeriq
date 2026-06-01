import { useState, useMemo } from "react";
import { CATEGORY_GROUPS } from "@/lib/categories";

interface CategorySelectorProps {
  selected: string[];
  onChange: (categories: string[]) => void;
  maxSelections?: number;
}

export function CategorySelector({ selected, onChange, maxSelections = 10 }: CategorySelectorProps) {
  const [search, setSearch] = useState("");
  const [expandedGroups, setExpandedGroups] = useState<string[]>([
    "Sales & Business Development", "SaaS & Software Industry", "Technology & Engineering"
  ]);

  const filtered = useMemo(() => {
    if (!search) return CATEGORY_GROUPS;
    const q = search.toLowerCase();
    return CATEGORY_GROUPS
      .map(g => ({ ...g, categories: g.categories.filter(c => c.toLowerCase().includes(q)) }))
      .filter(g => g.categories.length > 0);
  }, [search]);

  const toggle = (cat: string) => {
    if (selected.includes(cat)) {
      onChange(selected.filter(c => c !== cat));
    } else if (selected.length < maxSelections) {
      onChange([...selected, cat]);
    }
  };

  const toggleGroup = (group: string) => {
    setExpandedGroups(prev =>
      prev.includes(group) ? prev.filter(g => g !== group) : [...prev, group]
    );
  };

  return (
    <div>
      {/* Search */}
      <div className="relative mb-3">
        <input
          type="text"
          placeholder="Search all categories (e.g. zookeeper, aviation, law...)"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full h-9 pl-9 pr-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <svg className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        {search && (
          <button onClick={() => setSearch("")} className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Selected pills */}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3 p-2 bg-indigo-50 rounded-lg border border-indigo-100">
          {selected.map(cat => (
            <button key={cat} onClick={() => toggle(cat)}
              className="flex items-center gap-1 text-xs bg-indigo-600 text-white px-2.5 py-1 rounded-full font-medium hover:bg-indigo-700 transition-colors">
              {cat} <span className="opacity-70">×</span>
            </button>
          ))}
          <button onClick={() => onChange([])}
            className="text-xs text-indigo-400 hover:text-indigo-600 px-1 py-1 ml-auto">
            Clear all
          </button>
        </div>
      )}

      {/* Counter */}
      <p className="text-xs text-slate-500 mb-2">
        {selected.length}/{maxSelections} selected
        {selected.length >= maxSelections && <span className="text-amber-600 ml-1">— maximum reached</span>}
      </p>

      {/* Groups */}
      <div className="space-y-1.5 max-h-80 overflow-y-auto pr-1 scrollbar-thin">
        {filtered.map(group => {
          const isExpanded = search.length > 0 || expandedGroups.includes(group.group);
          const groupSelected = group.categories.filter(c => selected.includes(c)).length;
          return (
            <div key={group.group} className="border border-slate-200 rounded-lg overflow-hidden">
              <button onClick={() => toggleGroup(group.group)}
                className="w-full flex items-center justify-between px-3 py-2 bg-slate-50 hover:bg-slate-100 transition-colors text-left">
                <span className="flex items-center gap-2 text-sm font-medium text-slate-700">
                  <span>{group.emoji}</span>
                  <span>{group.group}</span>
                  {groupSelected > 0 && (
                    <span className="bg-indigo-100 text-indigo-700 text-xs px-1.5 py-0.5 rounded-full font-semibold">
                      {groupSelected}
                    </span>
                  )}
                  <span className="text-xs text-slate-400 font-normal">({group.categories.length})</span>
                </span>
                <svg className={`w-4 h-4 text-slate-400 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {isExpanded && (
                <div className="grid grid-cols-2 gap-1 p-2 bg-white">
                  {group.categories.map(cat => {
                    const isSelected = selected.includes(cat);
                    const isDisabled = !isSelected && selected.length >= maxSelections;
                    return (
                      <button key={cat} onClick={() => toggle(cat)} disabled={isDisabled}
                        className={`flex items-center gap-2 text-xs px-2.5 py-1.5 rounded-md text-left transition-colors ${
                          isSelected ? "bg-indigo-50 text-indigo-700 font-medium"
                            : isDisabled ? "text-slate-300 cursor-not-allowed"
                            : "text-slate-600 hover:bg-slate-50"}`}>
                        <span className={`w-3.5 h-3.5 rounded border flex-shrink-0 flex items-center justify-center ${
                          isSelected ? "bg-indigo-600 border-indigo-600" : "border-slate-300"}`}>
                          {isSelected && (
                            <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </span>
                        {cat}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
