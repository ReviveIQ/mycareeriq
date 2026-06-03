import React, { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { CategorySelector } from "@/components/CategorySelector";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Settings, Save, RotateCcw, AlertCircle, CheckCircle, Play } from "lucide-react";
import { toast } from "sonner";
import { DocumentIntake } from "@/components/DocumentIntake";
import { RoleSelector } from "@/components/RoleSelector";

interface ResearchSettingsProps {
  onRunNow?: () => void;
}

export default function ResearchSettings({ onRunNow }: ResearchSettingsProps = {}) {
  const [targetRoles, setTargetRoles] = useState("");
  const [selectedCountries, setSelectedCountries] = useState<string[]>(["US"]);
  const [usStates, setUsStates] = useState("");
  const [workArrangement, setWorkArrangement] = useState<string[]>([]); // empty = all
  const [targetCategories, setTargetCategories] = useState<string[]>([]);
  const [rolesPerDay, setRolesPerDay] = useState(10);
  const [enabled, setEnabled] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isRunning, setIsRunning] = useState(false);

  const COUNTRY_OPTIONS = [
    { code: "US", label: "🇺🇸 United States" },
    { code: "UK", label: "🇬🇧 United Kingdom" },
    { code: "CA", label: "🇨🇦 Canada" },
    { code: "AU", label: "🇦🇺 Australia" },
    { code: "DE", label: "🇩🇪 Germany" },
    { code: "FR", label: "🇫🇷 France" },
    { code: "NL", label: "🇳🇱 Netherlands" },
    { code: "REMOTE", label: "🌐 Remote / Anywhere" },
  ];

  const toggleCountry = (code: string) => {
    setSelectedCountries(prev =>
      prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]
    );
  };

  // Build the pipe-separated targetCountries string from UI state
  // Format: "US:FL,CA,TX|UK|REMOTE"
  const buildTargetCountries = (): string => {
    return selectedCountries.map(code => {
      if (code === "US" && usStates.trim()) {
        const states = usStates.split(/[,\s]+/).map(s => s.trim().toUpperCase()).filter(s => s.length === 2);
        return states.length > 0 ? `US:${states.join(",")}` : "US";
      }
      return code;
    }).join("|");
  };

  // Parse stored targetCountries string back into UI state
  const parseTargetCountries = (raw: string) => {
    if (!raw?.trim()) return { countries: ["US"], states: "" };
    const countries: string[] = [];
    let states = "";
    const blocks = raw.split("|").map(b => b.trim()).filter(Boolean);
    for (const block of blocks) {
      const [country, statesRaw] = block.split(":");
      countries.push(country.trim().toUpperCase());
      if (country.trim().toUpperCase() === "US" && statesRaw) {
        states = statesRaw.split(",").map(s => s.trim()).join(", ");
      }
    }
    return { countries, states };
  };

  // Fetch current configuration
  const { data: config, isLoading } = trpc.researchConfig.get.useQuery();
  const updateConfig = trpc.researchConfig.update.useMutation();
  const runResearch = trpc.monitoring.runNow.useMutation();

  // Load config into form when it arrives
  useEffect(() => {
    if (config) {
      setTargetRoles(config.targetRoles);
      const { countries, states } = parseTargetCountries((config as any).targetCountries || "US");
      setSelectedCountries(countries);
      setUsStates(states);
      const arrangement = (config as any).workArrangement
        ? (config as any).workArrangement.split(",").map((a: string) => a.trim()).filter(Boolean)
        : [];
      setWorkArrangement(arrangement);
      setTargetCategories(
        config.targetCategories
          ? config.targetCategories.split(",").map((c: string) => c.trim()).filter(Boolean)
          : []
      );
      setRolesPerDay(config.rolesPerDay);
      setEnabled(config.enabled === 1);
    }
  }, [config]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await updateConfig.mutateAsync({
        targetRoles,
        targetCountries: buildTargetCountries(),
        workArrangement: workArrangement.join(","),
        targetCategories: targetCategories.join(", "),
        rolesPerDay,
        enabled: enabled ? 1 : 0,
      });
      toast.success("Research settings updated successfully");
    } catch (error) {
      console.error("Failed to save settings:", error);
      toast.error("Failed to save research settings");
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    if (config) {
      setTargetRoles(config.targetRoles);
      const { countries, states } = parseTargetCountries((config as any).targetCountries || "US");
      setSelectedCountries(countries);
      setUsStates(states);
      setTargetCategories(
        config.targetCategories
          ? config.targetCategories.split(",").map((c: string) => c.trim()).filter(Boolean)
          : []
      );
      setRolesPerDay(config.rolesPerDay);
      setEnabled(config.enabled === 1);
    }
  };

  const handleRunNow = async () => {
    setIsRunning(true);
    try {
      const result = await runResearch.mutateAsync();
      if (result.rateLimited) {
        toast.error(result.message);
        return;
      }
      toast.success("Job research started — your pipeline will update in 20-30 seconds");
      // Switch to pipeline tab without full reload
      if (onRunNow) {
        onRunNow();
      } else {
        setTimeout(() => { window.location.href = "/"; }, 1500);
      }
    } catch (error) {
      console.error("Failed to run research:", error);
      toast.error("Failed to start job research");
    } finally {
      setIsRunning(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
          <div className="animate-pulse space-y-4">
            <div className="h-4 bg-slate-200 rounded w-1/4"></div>
            <div className="h-10 bg-slate-200 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
        <div className="flex items-center gap-3 mb-2">
          <Settings className="w-6 h-6 text-indigo-600" />
          <h2 className="text-2xl font-bold text-slate-900">Research Settings</h2>
        </div>
        <p className="text-slate-600">Customize the roles and categories researched daily</p>
      </div>

      {/* Document Intake — upload resume to configure pipeline */}
      {!targetRoles && (
        <div className="flex items-center gap-3 px-4 py-3 bg-amber-50 border border-amber-200 rounded-lg mb-2">
          <span className="text-amber-500 text-lg">📄</span>
          <p className="text-sm text-amber-800 font-medium">
            Upload your resume below to auto-fill your target roles and categories.
          </p>
        </div>
      )}
      <DocumentIntake
        documentType="resume"
        title="Auto-configure from Resume"
        description="Drag & drop a PDF or DOCX. We'll extract target roles and industries and apply them to your pipeline settings."
      />

      {/* Divider */}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-px bg-slate-200" />
        <span className="text-xs uppercase tracking-wider text-slate-500 font-medium">
          Or configure manually
        </span>
        <div className="flex-1 h-px bg-slate-200" />
      </div>

      {/* Settings Form */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-6">
        {/* Target Roles */}
        <div>
          <label className="block text-sm font-semibold text-slate-900 mb-2">
            Target Roles
          </label>
          <p className="text-xs text-slate-500 mb-3">
            Select the roles you want to search for. These will be used to find matching job postings.
          </p>
          <RoleSelector
            selectedRoles={targetRoles ? targetRoles.split(",").map(r => r.trim()).filter(Boolean) : []}
            onChange={(roles) => setTargetRoles(roles.join(", "))}
          />
        </div>

        {/* Target Categories */}
        <div>
          <label className="block text-sm font-semibold text-slate-900 mb-2">
            Target Industries & Categories
          </label>
          <p className="text-xs text-slate-500 mb-3">
            Select the industries you want to target. Research will focus on companies in these categories. Search for anything — from SaaS to zookeeping.
          </p>
          <CategorySelector
            selected={targetCategories}
            onChange={setTargetCategories}
            maxSelections={10}
          />
        </div>

        {/* Roles Per Day */}
        <div>
          <label className="block text-sm font-semibold text-slate-900 mb-2">
            Roles to Research Per Day
          </label>
          <div className="flex items-center gap-3">
            <Input
              type="number"
              min="1"
              max="100"
              value={rolesPerDay}
              onChange={(e) => setRolesPerDay(parseInt(e.target.value) || 30)}
              className="w-24"
            />
            <span className="text-sm text-slate-600">roles per day (1-100)</span>
          </div>
        </div>

        {/* Country / Location Filter */}
        <div>
          <label className="block text-sm font-semibold text-slate-900 mb-1">
            Job Locations
          </label>
          <p className="text-xs text-slate-500 mb-3">
            Select countries to search. Leave all unselected for worldwide.
          </p>
          <div className="flex flex-wrap gap-2 mb-4">
            {COUNTRY_OPTIONS.map(({ code, label }) => {
              const selected = selectedCountries.includes(code);
              return (
                <button
                  key={code}
                  type="button"
                  onClick={() => toggleCountry(code)}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                    selected
                      ? "bg-indigo-600 border-indigo-600 text-white"
                      : "bg-white border-slate-200 text-slate-600 hover:border-indigo-400"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>

          {/* State filter — only shown when US is selected */}
          {selectedCountries.includes("US") && (
            <div className="pl-1">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                US States <span className="font-normal text-slate-400">(optional)</span>
              </label>
              <input
                type="text"
                value={usStates}
                onChange={e => setUsStates(e.target.value)}
                placeholder="FL, CA, NY, TX — leave blank for all states"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300"
              />
              <p className="text-xs text-slate-400 mt-1">
                Enter 2-letter state codes separated by commas. Matches "Miami, FL", "Austin, TX", etc.
              </p>
              {usStates.trim() && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {usStates.split(/[,\s]+/).map(s => s.trim().toUpperCase()).filter(s => s.length === 2).map(state => (
                    <span key={state} className="px-2 py-0.5 bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs rounded-full font-medium">
                      {state}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {selectedCountries.length === 0 && (
            <p className="text-xs text-amber-600 mt-1">
              No countries selected — pipeline will include roles from all locations.
            </p>
          )}
        </div>

        {/* Work Arrangement Filter */}
        <div>
          <label className="block text-sm font-semibold text-slate-900 mb-1">
            Work Arrangement
          </label>
          <p className="text-xs text-slate-500 mb-3">
            Filter by how the job is structured. Leave all unselected to include everything.
          </p>
          <div className="flex gap-2">
            {[
              { code: "remote", label: "🌐 Remote" },
              { code: "hybrid", label: "🏠 Hybrid" },
              { code: "onsite", label: "🏢 On-site" },
            ].map(({ code, label }) => {
              const selected = workArrangement.includes(code);
              return (
                <button
                  key={code}
                  type="button"
                  onClick={() =>
                    setWorkArrangement(prev =>
                      prev.includes(code) ? prev.filter(a => a !== code) : [...prev, code]
                    )
                  }
                  className={`px-4 py-2 rounded-full text-sm font-medium border transition-colors ${
                    selected
                      ? "bg-indigo-600 border-indigo-600 text-white"
                      : "bg-white border-slate-200 text-slate-600 hover:border-indigo-400"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
          {workArrangement.length === 0 && (
            <p className="text-xs text-slate-400 mt-2">All arrangements included</p>
          )}
        </div>

        {/* Enable/Disable Toggle */}
        <div>
          <label className="block text-sm font-semibold text-slate-900 mb-3">
            Daily Research Status
          </label>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setEnabled(!enabled)}
              className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors ${
                enabled ? "bg-indigo-600" : "bg-slate-300"
              }`}
            >
              <span
                className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform ${
                  enabled ? "translate-x-7" : "translate-x-1"
                }`}
              />
            </button>
            <span className={`text-sm font-medium ${enabled ? "text-emerald-600" : "text-slate-600"}`}>
              {enabled ? "Enabled" : "Disabled"}
            </span>
          </div>
        </div>

        {/* Info Box */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex gap-3">
          <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-blue-900">
            <p className="font-medium mb-1">Daily Research Schedule</p>
            <p>New roles matching your criteria will be researched and added to your pipeline every 24 hours at 8am EST.</p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3 pt-4 border-t border-slate-200">
          <Button
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white"
          >
            <Save className="w-4 h-4" />
            {isSaving ? "Saving..." : "Save Settings"}
          </Button>
          <Button
            onClick={handleReset}
            variant="outline"
            className="flex items-center gap-2"
          >
            <RotateCcw className="w-4 h-4" />
            Reset
          </Button>
          <Button
            onClick={handleRunNow}
            disabled={isRunning}
            className="flex items-center gap-2 ml-auto bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {isRunning ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Running...
              </>
            ) : (
              <>
                <Play className="w-4 h-4" />
                Run Now
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Current Settings Summary */}
      <Card className="bg-slate-50 border-slate-200 p-6">
        <h3 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
          <CheckCircle className="w-5 h-5 text-emerald-600" />
          Current Configuration
        </h3>
        <div className="space-y-3 text-sm">
          <div>
            <p className="text-slate-600 font-medium">Target Roles:</p>
            <p className="text-slate-900 font-mono text-xs mt-1 bg-white p-2 rounded border border-slate-200">
              {targetRoles || "Not set"}
            </p>
          </div>
          <div>
            <p className="text-slate-600 font-medium">Target Categories:</p>
            <p className="text-slate-900 font-mono text-xs mt-1 bg-white p-2 rounded border border-slate-200">
              {targetCategories.length > 0 ? targetCategories.join(", ") : "Not set"}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4 pt-2">
            <div>
              <p className="text-slate-600 font-medium">Roles Per Day:</p>
              <p className="text-slate-900 font-semibold">{rolesPerDay}</p>
            </div>
            <div>
              <p className="text-slate-600 font-medium">Status:</p>
              <p className={`font-semibold ${enabled ? "text-emerald-600" : "text-slate-600"}`}>
                {enabled ? "Active" : "Paused"}
              </p>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
