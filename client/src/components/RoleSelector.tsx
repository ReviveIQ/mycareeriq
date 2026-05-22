import { useState } from "react";
import { Check, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";

// Curated list of real, searchable job titles organized by category
const ROLE_CATEGORIES = [
  {
    category: "Account Executive",
    roles: [
      "Enterprise Account Executive",
      "Strategic Account Executive",
      "Senior Account Executive",
      "Mid-Market Account Executive",
      "Regional Account Executive",
      "Account Executive",
      "SaaS Account Executive",
      "Named Account Executive",
    ],
  },
  {
    category: "Sales Leadership",
    roles: [
      "VP of Sales",
      "Senior Vice President of Sales",
      "Director of Sales",
      "Regional Sales Director",
      "Sales Manager",
      "Regional Sales Manager",
      "Head of Sales",
      "Chief Revenue Officer",
    ],
  },
  {
    category: "Business Development",
    roles: [
      "Director of Business Development",
      "VP of Business Development",
      "Business Development Manager",
      "Strategic Partnerships Manager",
      "VP of Partnerships",
      "Alliance Manager",
    ],
  },
  {
    category: "Revenue & Growth",
    roles: [
      "VP of Revenue",
      "Revenue Operations Manager",
      "Director of Revenue Operations",
      "Growth Manager",
      "VP of Growth",
      "Commercial Director",
    ],
  },
  {
    category: "Customer Success (Senior)",
    roles: [
      "VP of Customer Success",
      "Director of Customer Success",
      "Strategic Customer Success Manager",
      "Enterprise Customer Success Manager",
      "Head of Customer Success",
    ],
  },
  {
    category: "Consulting & Advisory",
    roles: [
      "Sales Consulting Account Executive",
      "Revenue Consultant",
      "Sales Enablement Manager",
      "Director of Sales Enablement",
      "Sales Strategy Consultant",
    ],
  },
];

interface RoleSelectorProps {
  selectedRoles: string[];
  onChange: (roles: string[]) => void;
}

export function RoleSelector({ selectedRoles, onChange }: RoleSelectorProps) {
  const [expandedCategories, setExpandedCategories] = useState<string[]>(["Account Executive"]);

  const toggleCategory = (category: string) => {
    setExpandedCategories(prev =>
      prev.includes(category)
        ? prev.filter(c => c !== category)
        : [...prev, category]
    );
  };

  const toggleRole = (role: string) => {
    if (selectedRoles.includes(role)) {
      onChange(selectedRoles.filter(r => r !== role));
    } else {
      onChange([...selectedRoles, role]);
    }
  };

  const selectAll = (roles: string[]) => {
    const newRoles = [...new Set([...selectedRoles, ...roles])];
    onChange(newRoles);
  };

  const clearAll = (roles: string[]) => {
    onChange(selectedRoles.filter(r => !roles.includes(r)));
  };

  return (
    <div className="space-y-2">
      {/* Selected roles summary */}
      {selectedRoles.length > 0 && (
        <div className="flex flex-wrap gap-2 p-3 bg-blue-50 rounded-lg border border-blue-100 mb-4">
          {selectedRoles.map(role => (
            <span
              key={role}
              className="flex items-center gap-1 bg-blue-600 text-white px-3 py-1 rounded-full text-sm"
            >
              {role}
              <button
                onClick={() => toggleRole(role)}
                className="ml-1 hover:text-blue-200"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Category accordions */}
      {ROLE_CATEGORIES.map(({ category, roles }) => {
        const isExpanded = expandedCategories.includes(category);
        const selectedCount = roles.filter(r => selectedRoles.includes(r)).length;

        return (
          <div key={category} className="border border-slate-200 rounded-lg overflow-hidden">
            <button
              onClick={() => toggleCategory(category)}
              className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors text-left"
            >
              <div className="flex items-center gap-2">
                <span className="font-medium text-slate-800 text-sm">{category}</span>
                {selectedCount > 0 && (
                  <span className="bg-blue-600 text-white text-xs px-2 py-0.5 rounded-full">
                    {selectedCount} selected
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {isExpanded && (
                  <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                    <button
                      onClick={() => selectAll(roles)}
                      className="text-xs text-blue-600 hover:underline px-1"
                    >
                      All
                    </button>
                    <span className="text-slate-300">|</span>
                    <button
                      onClick={() => clearAll(roles)}
                      className="text-xs text-slate-500 hover:underline px-1"
                    >
                      None
                    </button>
                  </div>
                )}
                {isExpanded ? (
                  <ChevronUp className="w-4 h-4 text-slate-400" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-slate-400" />
                )}
              </div>
            </button>

            {isExpanded && (
              <div className="grid grid-cols-1 divide-y divide-slate-100">
                {roles.map(role => {
                  const isSelected = selectedRoles.includes(role);
                  return (
                    <button
                      key={role}
                      onClick={() => toggleRole(role)}
                      className={`flex items-center justify-between px-4 py-2.5 text-sm text-left transition-colors ${
                        isSelected
                          ? "bg-blue-50 text-blue-800"
                          : "bg-white text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      <span>{role}</span>
                      {isSelected && <Check className="w-4 h-4 text-blue-600 flex-shrink-0" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {selectedRoles.length === 0 && (
        <p className="text-xs text-slate-400 text-center py-2">
          Select at least one role to configure your pipeline research
        </p>
      )}
    </div>
  );
}
