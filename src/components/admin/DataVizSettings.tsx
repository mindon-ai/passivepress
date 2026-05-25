import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { BarChart3, RotateCcw, Save } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

const chartTypes = ["bar", "line", "area"] as const;

const dataVizDefaults = {
  generation: {
    enabled: true,
    requireResearch: true,
    allowEmptyResult: true,
    requireReturnTool: false,
  },
  chartRules: {
    minNumericBenchmarks: 2,
    maxCharts: 2,
    maxDataPointsPerChart: 6,
    maxSeriesPerChart: 3,
    allowedChartTypes: ["bar", "line", "area"],
    defaultChartType: "bar" as const,
  },
  promptControls: {
    includeAngle: true,
    includeCategory: true,
    includeKeywords: true,
    includeKeyFindings: true,
    includeBenchmarks: true,
    customInstruction: "",
  },
  contentRules: {
    includeMarkdownContent: true,
    sentencesPerChart: 2,
    requireChartFences: true,
  },
};

type DataVizConfig = typeof dataVizDefaults;
type ChartType = (typeof chartTypes)[number];

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

export function DataVizSettings() {
  const saved = useQuery(api.agentSettings.getDataViz, {});
  const saveDataViz = useMutation(api.agentSettings.updateDataViz);
  const resetDataViz = useMutation(api.agentSettings.resetDataViz);
  const [config, setConfig] = useState<DataVizConfig>(dataVizDefaults);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (saved?.config) setConfig(saved.config as DataVizConfig);
  }, [saved]);

  const updatedLabel = useMemo(() => {
    if (!saved?.updatedAt) return "Using code defaults";
    return `Last saved ${new Date(saved.updatedAt).toLocaleString()}`;
  }, [saved?.updatedAt]);

  const updateConfig = (updater: (current: DataVizConfig) => DataVizConfig) => setConfig((current) => updater(current));

  const toggleChartType = (type: ChartType, checked: boolean) => {
    updateConfig((current) => {
      const enabled = new Set(current.chartRules.allowedChartTypes);
      if (checked) enabled.add(type);
      else enabled.delete(type);
      return { ...current, chartRules: { ...current.chartRules, allowedChartTypes: [...enabled] as ChartType[] } };
    });
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await saveDataViz({ config });
      toast.success("Data Viz settings saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save Data Viz settings");
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = async () => {
    if (!confirm("Reset Data Viz settings to code defaults?")) return;
    setIsSaving(true);
    try {
      const defaults = await resetDataViz();
      setConfig(defaults as DataVizConfig);
      toast.success("Data Viz settings reset");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to reset Data Viz settings");
    } finally {
      setIsSaving(false);
    }
  };

  if (saved === undefined) {
    return <div className="rounded-md border border-border p-8 text-center text-sm text-muted-foreground">Loading Data Viz settings…</div>;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-muted-foreground" />
                <CardTitle>Data Viz</CardTitle>
              </div>
              <CardDescription className="mt-2">Creates Recharts-compatible chart blocks from concrete research benchmarks.</CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={handleReset} disabled={isSaving}><RotateCcw className="mr-2 h-4 w-4" />Reset</Button>
              <Button onClick={handleSave} disabled={isSaving}><Save className="mr-2 h-4 w-4" />Save settings</Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 text-sm md:grid-cols-3">
            <div className="rounded-md bg-muted p-4"><div className="text-muted-foreground">Pipeline stage</div><div className="mt-1 font-medium">5 — Chart design</div></div>
            <div className="rounded-md bg-muted p-4"><div className="text-muted-foreground">Runtime</div><div className="mt-1 font-medium">pi agent + Recharts schema</div></div>
            <div className="rounded-md bg-muted p-4"><div className="text-muted-foreground">Status</div><div className="mt-1 font-medium">{updatedLabel}</div></div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Generation behavior</CardTitle>
          <CardDescription>Controls whether Data Viz runs and how strict it is.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-4">
          <SettingSwitch label="Enable Data Viz" description="Allow chart generation." checked={config.generation.enabled} onCheckedChange={(enabled) => updateConfig((c) => ({ ...c, generation: { ...c.generation, enabled } }))} />
          <SettingSwitch label="Require research" description="Skip when Researcher data is missing." checked={config.generation.requireResearch} onCheckedChange={(requireResearch) => updateConfig((c) => ({ ...c, generation: { ...c.generation, requireResearch } }))} />
          <SettingSwitch label="Allow empty result" description="Permit zero charts for qualitative data." checked={config.generation.allowEmptyResult} onCheckedChange={(allowEmptyResult) => updateConfig((c) => ({ ...c, generation: { ...c.generation, allowEmptyResult } }))} />
          <SettingSwitch label="Require return tool" description="Fail if return_dataviz is not called." checked={config.generation.requireReturnTool} onCheckedChange={(requireReturnTool) => updateConfig((c) => ({ ...c, generation: { ...c.generation, requireReturnTool } }))} />
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Chart rules</CardTitle>
            <CardDescription>Limits for generated charts and series.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <NumberField label="Min numeric benchmarks" min={0} value={config.chartRules.minNumericBenchmarks} onChange={(minNumericBenchmarks) => updateConfig((c) => ({ ...c, chartRules: { ...c.chartRules, minNumericBenchmarks } }))} />
              <NumberField label="Max charts" min={0} value={config.chartRules.maxCharts} onChange={(maxCharts) => updateConfig((c) => ({ ...c, chartRules: { ...c.chartRules, maxCharts } }))} />
              <NumberField label="Max data points/chart" min={1} value={config.chartRules.maxDataPointsPerChart} onChange={(maxDataPointsPerChart) => updateConfig((c) => ({ ...c, chartRules: { ...c.chartRules, maxDataPointsPerChart } }))} />
              <NumberField label="Max series/chart" min={1} value={config.chartRules.maxSeriesPerChart} onChange={(maxSeriesPerChart) => updateConfig((c) => ({ ...c, chartRules: { ...c.chartRules, maxSeriesPerChart } }))} />
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              {chartTypes.map((type) => (
                <SettingSwitch key={type} label={type} description={`Allow ${type} charts.`} checked={config.chartRules.allowedChartTypes.includes(type)} onCheckedChange={(checked) => toggleChartType(type, checked)} />
              ))}
            </div>
            <div className="space-y-2">
              <Label>Default chart type</Label>
              <Select value={config.chartRules.defaultChartType} onValueChange={(defaultChartType: ChartType) => updateConfig((c) => ({ ...c, chartRules: { ...c.chartRules, defaultChartType } }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{chartTypes.map((type) => <SelectItem key={type} value={type}>{type}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Prompt controls</CardTitle>
            <CardDescription>Controls context sent to the Data Viz agent.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <SettingSwitch label="Include angle" description="Use editorial angle." checked={config.promptControls.includeAngle} onCheckedChange={(includeAngle) => updateConfig((c) => ({ ...c, promptControls: { ...c.promptControls, includeAngle } }))} />
              <SettingSwitch label="Include category" description="Use category slug." checked={config.promptControls.includeCategory} onCheckedChange={(includeCategory) => updateConfig((c) => ({ ...c, promptControls: { ...c.promptControls, includeCategory } }))} />
              <SettingSwitch label="Include keywords" description="Use SEO keywords." checked={config.promptControls.includeKeywords} onCheckedChange={(includeKeywords) => updateConfig((c) => ({ ...c, promptControls: { ...c.promptControls, includeKeywords } }))} />
              <SettingSwitch label="Include findings" description="Use research key findings." checked={config.promptControls.includeKeyFindings} onCheckedChange={(includeKeyFindings) => updateConfig((c) => ({ ...c, promptControls: { ...c.promptControls, includeKeyFindings } }))} />
              <SettingSwitch label="Include benchmarks" description="Use research benchmark data." checked={config.promptControls.includeBenchmarks} onCheckedChange={(includeBenchmarks) => updateConfig((c) => ({ ...c, promptControls: { ...c.promptControls, includeBenchmarks } }))} />
            </div>
            <div className="space-y-2">
              <Label>Custom chart instruction</Label>
              <Textarea rows={5} placeholder="Optional extra Data Viz instruction..." value={config.promptControls.customInstruction} onChange={(event) => updateConfig((c) => ({ ...c, promptControls: { ...c.promptControls, customInstruction: event.target.value } }))} />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Markdown content</CardTitle>
          <CardDescription>Controls prose and chart-block requirements.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          <SettingSwitch label="Include markdown" description="Generate prose with chart blocks." checked={config.contentRules.includeMarkdownContent} onCheckedChange={(includeMarkdownContent) => updateConfig((c) => ({ ...c, contentRules: { ...c.contentRules, includeMarkdownContent } }))} />
          <NumberField label="Sentences/chart" min={0} value={config.contentRules.sentencesPerChart} onChange={(sentencesPerChart) => updateConfig((c) => ({ ...c, contentRules: { ...c.contentRules, sentencesPerChart } }))} />
          <SettingSwitch label="Require chart fences" description="Require ```chart blocks using chartId." checked={config.contentRules.requireChartFences} onCheckedChange={(requireChartFences) => updateConfig((c) => ({ ...c, contentRules: { ...c.contentRules, requireChartFences } }))} />
        </CardContent>
      </Card>
    </div>
  );
}
