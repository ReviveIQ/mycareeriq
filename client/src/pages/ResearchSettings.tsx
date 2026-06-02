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
  const [remoteOnly, setRemoteOnly] = useState(false);
  const [usHiringOnly, setUsHiringOnly] = useState(true);
  const [targetCategories, setTargetCategories] = useState<string[]>([]);
  const [rolesPerDay, setRolesPerDay] = useState(30);
  const [enabled, setEnabled] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isRunning, setIsRunning] = useState(false);

  // Fetch current configuration
  const { data: config, isLoading } = trpc.researchConfig.get.useQuery();
  const updateConfig = trpc.researchConfig.update.useMutation();
  const runResearch = trpc.monitoring.runNow.useMutation();

  // Load config into form when it arrives
  useEffect(() => {
    if (config) {
      setTargetRoles(config.targetRoles);
      setRemoteOnly(config.remoteOnly || false);
      setUsHiringOnly(config.usHiringOnly !== false);
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
        remoteOnly,
        usHiringOnly,
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

      {/* Document Intake — auto-configure pipeline from a resume or other document */}
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

        {/* Remote Only Toggle */}
        <div>
          <label className="block text-sm font-semibold text-slate-900 mb-3">
            Remote Roles
          </label>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setRemoteOnly(!remoteOnly)}
              className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors ${
                remoteOnly ? "bg-indigo-600" : "bg-slate-300"
              }`}
            >
              <span
                className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform ${
                  remoteOnly ? "translate-x-7" : "translate-x-1"
                }`}
              />
            </button>
            <span className={`text-sm font-medium ${remoteOnly ? "text-emerald-600" : "text-slate-600"}`}>
              {remoteOnly ? "Remote roles only" : "All roles (remote + in-office)"}
            </span>
          </div>
        </div>

        {/* US Only Toggle */}
        <div>
          <label className="block text-sm font-semibold text-slate-900 mb-3">
            US Hiring Only
          </label>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setUsHiringOnly(!usHiringOnly)}
              className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors ${
                usHiringOnly ? "bg-indigo-600" : "bg-slate-300"
              }`}
            >
              <span
                className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform ${
                  usHiringOnly ? "translate-x-7" : "translate-x-1"
                }`}
              />
            </button>
            <span className={`text-sm font-medium ${usHiringOnly ? "text-emerald-600" : "text-slate-600"}`}>
              {usHiringOnly ? "US positions only" : "All locations"}
            </span>
          </div>
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
              {targetCategories || "Not set"}
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
