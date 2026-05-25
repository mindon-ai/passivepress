import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Microscope, RotateCcw, Save, Search } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

const researcherDefaults = {
  search: {
    enabled: true,
    maxSearchCalls: 3,
    defaultResultsPerSearch: 10,
    maxResultsPerSearch: 15,
    queryScope: "site:arxiv.org OR site:github.com OR site:huggingface.co OR site:paperswithcode.com",
  },
  extraction: {
    includePapers: true,
    includeBenchmarks: true,
    includeCodeSnippets: true,
    minKeyFindings: 3,
    maxKeyFindings: 5,
    maxPapers: 5,
    maxBenchmarks: 8,
    maxCodeSnippets: 3,
  },
  promptControls: {
    includeSourceUrls: true,
    includeTopicAngle: true,
    includeCategory: true,
    customInstruction: "",
  },
  fallbackRules: {
    allowEmptyArrays: true,
    allowPartialResults: true,
    requireReturnTool: true,
  },
};

type ResearcherConfig = typeof researcherDefaults;

function numberValue(value: string, fallback: number) {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

function SettingSwitch({ label, description, checked, onCheckedChange }: { label: string; description: string; checked: boolean; onCheckedChange: (checked: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-md border border-border p-4">
      <div>
        <Label>{label}</Label>
        <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

function NumberField({ label, value, onChange, min = 0 }: { label: string; value: number; onChange: (value: number) => void; min?: number }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input type="number" min={min} value={value} onChange={(event) => onChange(numberValue(event.target.value, value))} />
    </div>
  );
}

export function ResearcherSettings() {
  const saved = useQuery(api.agentSettings.getResearcher, {});
  const saveResearcher = useMutation(api.agentSettings.updateResearcher);
  const resetResearcher = useMutation(api.agentSettings.resetResearcher);
  const [config, setConfig] = useState<ResearcherConfig>(researcherDefaults);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (saved?.config) setConfig(saved.config as ResearcherConfig);
  }, [saved]);

  const updatedLabel = useMemo(() => {
    if (!saved?.updatedAt) return "Using code defaults";
    return `Last saved ${new Date(saved.updatedAt).toLocaleString()}`;
  }, [saved?.updatedAt]);

  const updateConfig = (updater: (current: ResearcherConfig) => ResearcherConfig) => {
    setConfig((current) => updater(current));
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await saveResearcher({ config });
      toast.success("Researcher settings saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save Researcher settings");
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = async () => {
    if (!confirm("Reset Researcher settings to code defaults?")) return;
    setIsSaving(true);
    try {
      const defaults = await resetResearcher();
      setConfig(defaults as ResearcherConfig);
      toast.success("Researcher settings reset");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to reset Researcher settings");
    } finally {
      setIsSaving(false);
    }
  };

  if (saved === undefined) {
    return <div className="rounded-md border border-border p-8 text-center text-sm text-muted-foreground">Loading Researcher settings…</div>;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Microscope className="h-5 w-5 text-muted-foreground" />
                <CardTitle>Researcher</CardTitle>
              </div>
              <CardDescription className="mt-2">
                Gathers technical papers, benchmarks, code snippets, and grounded key findings for the chosen topic.
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={handleReset} disabled={isSaving}><RotateCcw className="mr-2 h-4 w-4" />Reset</Button>
              <Button onClick={handleSave} disabled={isSaving}><Save className="mr-2 h-4 w-4" />Save settings</Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 text-sm md:grid-cols-3">
            <div className="rounded-md bg-muted p-4"><div className="text-muted-foreground">Pipeline stage</div><div className="mt-1 font-medium">3 — Technical research</div></div>
            <div className="rounded-md bg-muted p-4"><div className="text-muted-foreground">Runtime</div><div className="mt-1 font-medium">pi agent + search tools</div></div>
            <div className="rounded-md bg-muted p-4"><div className="text-muted-foreground">Status</div><div className="mt-1 font-medium">{updatedLabel}</div></div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2"><Search className="h-5 w-5 text-muted-foreground" /><CardTitle className="text-xl">Search behavior</CardTitle></div>
          <CardDescription>Controls search_technical calls and result limits.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-4">
            <SettingSwitch label="Enable search" description="Allow Researcher to call search_technical." checked={config.search.enabled} onCheckedChange={(enabled) => updateConfig((c) => ({ ...c, search: { ...c.search, enabled } }))} />
            <NumberField label="Max search calls" min={0} value={config.search.maxSearchCalls} onChange={(maxSearchCalls) => updateConfig((c) => ({ ...c, search: { ...c.search, maxSearchCalls } }))} />
            <NumberField label="Default results/search" min={1} value={config.search.defaultResultsPerSearch} onChange={(defaultResultsPerSearch) => updateConfig((c) => ({ ...c, search: { ...c.search, defaultResultsPerSearch } }))} />
            <NumberField label="Max results/search" min={1} value={config.search.maxResultsPerSearch} onChange={(maxResultsPerSearch) => updateConfig((c) => ({ ...c, search: { ...c.search, maxResultsPerSearch } }))} />
          </div>
          <div className="space-y-2">
            <Label>Query scope</Label>
            <Textarea rows={3} value={config.search.queryScope} onChange={(event) => updateConfig((c) => ({ ...c, search: { ...c.search, queryScope: event.target.value } }))} />
            <p className="text-xs text-muted-foreground">Appended to each search query. Leave empty to search without site filters.</p>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Extraction targets</CardTitle>
            <CardDescription>Choose which structured research fields to extract.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-3">
              <SettingSwitch label="Papers" description="Extract papers/model cards/reports." checked={config.extraction.includePapers} onCheckedChange={(includePapers) => updateConfig((c) => ({ ...c, extraction: { ...c.extraction, includePapers } }))} />
              <SettingSwitch label="Benchmarks" description="Extract concrete numeric evaluations." checked={config.extraction.includeBenchmarks} onCheckedChange={(includeBenchmarks) => updateConfig((c) => ({ ...c, extraction: { ...c.extraction, includeBenchmarks } }))} />
              <SettingSwitch label="Code snippets" description="Extract runnable code examples." checked={config.extraction.includeCodeSnippets} onCheckedChange={(includeCodeSnippets) => updateConfig((c) => ({ ...c, extraction: { ...c.extraction, includeCodeSnippets } }))} />
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <NumberField label="Max papers" min={0} value={config.extraction.maxPapers} onChange={(maxPapers) => updateConfig((c) => ({ ...c, extraction: { ...c.extraction, maxPapers } }))} />
              <NumberField label="Max benchmarks" min={0} value={config.extraction.maxBenchmarks} onChange={(maxBenchmarks) => updateConfig((c) => ({ ...c, extraction: { ...c.extraction, maxBenchmarks } }))} />
              <NumberField label="Max snippets" min={0} value={config.extraction.maxCodeSnippets} onChange={(maxCodeSnippets) => updateConfig((c) => ({ ...c, extraction: { ...c.extraction, maxCodeSnippets } }))} />
              <NumberField label="Min findings" min={0} value={config.extraction.minKeyFindings} onChange={(minKeyFindings) => updateConfig((c) => ({ ...c, extraction: { ...c.extraction, minKeyFindings } }))} />
              <NumberField label="Max findings" min={0} value={config.extraction.maxKeyFindings} onChange={(maxKeyFindings) => updateConfig((c) => ({ ...c, extraction: { ...c.extraction, maxKeyFindings } }))} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Prompt controls</CardTitle>
            <CardDescription>Controls topic context included in the Researcher prompt.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-3">
              <SettingSwitch label="Source URLs" description="Include Topic Picker source URLs." checked={config.promptControls.includeSourceUrls} onCheckedChange={(includeSourceUrls) => updateConfig((c) => ({ ...c, promptControls: { ...c.promptControls, includeSourceUrls } }))} />
              <SettingSwitch label="Topic angle" description="Include editorial angle." checked={config.promptControls.includeTopicAngle} onCheckedChange={(includeTopicAngle) => updateConfig((c) => ({ ...c, promptControls: { ...c.promptControls, includeTopicAngle } }))} />
              <SettingSwitch label="Category" description="Include category slug." checked={config.promptControls.includeCategory} onCheckedChange={(includeCategory) => updateConfig((c) => ({ ...c, promptControls: { ...c.promptControls, includeCategory } }))} />
            </div>
            <div className="space-y-2">
              <Label>Custom research instruction</Label>
              <Textarea rows={6} placeholder="Optional extra instruction for Researcher..." value={config.promptControls.customInstruction} onChange={(event) => updateConfig((c) => ({ ...c, promptControls: { ...c.promptControls, customInstruction: event.target.value } }))} />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Fallback behavior</CardTitle>
          <CardDescription>Controls how strict the agent is about structured return data.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          <SettingSwitch label="Allow empty arrays" description="Permit empty papers/benchmarks/snippets." checked={config.fallbackRules.allowEmptyArrays} onCheckedChange={(allowEmptyArrays) => updateConfig((c) => ({ ...c, fallbackRules: { ...c.fallbackRules, allowEmptyArrays } }))} />
          <SettingSwitch label="Allow partial results" description="Accept sparse but grounded research." checked={config.fallbackRules.allowPartialResults} onCheckedChange={(allowPartialResults) => updateConfig((c) => ({ ...c, fallbackRules: { ...c.fallbackRules, allowPartialResults } }))} />
          <SettingSwitch label="Require return tool" description="Fail if return_research is not called." checked={config.fallbackRules.requireReturnTool} onCheckedChange={(requireReturnTool) => updateConfig((c) => ({ ...c, fallbackRules: { ...c.fallbackRules, requireReturnTool } }))} />
        </CardContent>
      </Card>
    </div>
  );
}
