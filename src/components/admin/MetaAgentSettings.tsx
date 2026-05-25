import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { BrainCircuit, RotateCcw, Save } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

const metaAgentDefaults = {
  runtime: {
    enabled: true,
    defaultReportOnly: true,
    allowApplyAll: false,
    defaultLastN: 10,
  },
  auditContext: {
    previousMetaSessionsLimit: 5,
    sourceCharLimit: 6000,
    contentPreviewChars: 1200,
    includeFrontendSources: true,
    includeBackendSources: true,
    includeAgentSources: true,
    includeGaData: true,
  },
  report: {
    maxFindings: 8,
    maxProposals: 5,
    fallbackReportEnabled: true,
    filterAlreadyApplied: true,
    defaultConfidence: 0.5,
  },
  apply: {
    requireReviewForSchemaChanges: true,
    neverAutoApplyReviewRequired: true,
    runVerificationWhenRecommended: true,
    saveRepairArtifacts: true,
  },
  alerts: {
    telegramEnabled: true,
  },
  logging: {
    saveSessionLog: true,
  },
  promptControls: {
    customInstruction: "",
  },
};

type MetaAgentConfig = typeof metaAgentDefaults;

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

function NumberField({ label, value, onChange, min = 0, step = 1 }: { label: string; value: number; onChange: (value: number) => void; min?: number; step?: number | string }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input type="number" min={min} step={step} value={value} onChange={(event) => onChange(numberValue(event.target.value, value))} />
    </div>
  );
}

export function MetaAgentSettings() {
  const saved = useQuery(api.agentSettings.getMetaAgent, {});
  const saveMetaAgent = useMutation(api.agentSettings.updateMetaAgent);
  const resetMetaAgent = useMutation(api.agentSettings.resetMetaAgent);
  const [config, setConfig] = useState<MetaAgentConfig>(metaAgentDefaults);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (saved?.config) setConfig(saved.config as MetaAgentConfig);
  }, [saved]);

  const updatedLabel = useMemo(() => {
    if (!saved?.updatedAt) return "Using code defaults";
    return `Last saved ${new Date(saved.updatedAt).toLocaleString()}`;
  }, [saved?.updatedAt]);

  const updateConfig = (updater: (current: MetaAgentConfig) => MetaAgentConfig) => setConfig((current) => updater(current));

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await saveMetaAgent({ config });
      toast.success("Meta Agent settings saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save Meta Agent settings");
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = async () => {
    if (!confirm("Reset Meta Agent settings to code defaults?")) return;
    setIsSaving(true);
    try {
      const defaults = await resetMetaAgent();
      setConfig(defaults as MetaAgentConfig);
      toast.success("Meta Agent settings reset");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to reset Meta Agent settings");
    } finally {
      setIsSaving(false);
    }
  };

  if (saved === undefined) {
    return <div className="rounded-md border border-border p-8 text-center text-sm text-muted-foreground">Loading Meta Agent settings…</div>;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <BrainCircuit className="h-5 w-5 text-muted-foreground" />
                <CardTitle>Meta Agent</CardTitle>
              </div>
              <CardDescription className="mt-2">Audits pipeline runs, published posts, telemetry, and source files to propose improvements.</CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={handleReset} disabled={isSaving}><RotateCcw className="mr-2 h-4 w-4" />Reset</Button>
              <Button onClick={handleSave} disabled={isSaving}><Save className="mr-2 h-4 w-4" />Save settings</Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 text-sm md:grid-cols-3">
            <div className="rounded-md bg-muted p-4"><div className="text-muted-foreground">Pipeline stage</div><div className="mt-1 font-medium">Post-run audit</div></div>
            <div className="rounded-md bg-muted p-4"><div className="text-muted-foreground">Runtime</div><div className="mt-1 font-medium">pi agent + patch verifier</div></div>
            <div className="rounded-md bg-muted p-4"><div className="text-muted-foreground">Status</div><div className="mt-1 font-medium">{updatedLabel}</div></div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-xl">Runtime</CardTitle><CardDescription>Controls default Meta Agent operating mode.</CardDescription></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-4">
          <SettingSwitch label="Enabled" description="Allow Meta Agent to run." checked={config.runtime.enabled} onCheckedChange={(enabled) => updateConfig((c) => ({ ...c, runtime: { ...c.runtime, enabled } }))} />
          <SettingSwitch label="Report only" description="Default to no code changes." checked={config.runtime.defaultReportOnly} onCheckedChange={(defaultReportOnly) => updateConfig((c) => ({ ...c, runtime: { ...c.runtime, defaultReportOnly } }))} />
          <SettingSwitch label="Allow apply all" description="Permit --apply-all mode." checked={config.runtime.allowApplyAll} onCheckedChange={(allowApplyAll) => updateConfig((c) => ({ ...c, runtime: { ...c.runtime, allowApplyAll } }))} />
          <NumberField label="Default last N runs" min={1} value={config.runtime.defaultLastN} onChange={(defaultLastN) => updateConfig((c) => ({ ...c, runtime: { ...c.runtime, defaultLastN } }))} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-xl">Audit context</CardTitle><CardDescription>Controls how much context is sent to the Meta Agent model.</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <NumberField label="Previous sessions" min={0} value={config.auditContext.previousMetaSessionsLimit} onChange={(previousMetaSessionsLimit) => updateConfig((c) => ({ ...c, auditContext: { ...c.auditContext, previousMetaSessionsLimit } }))} />
            <NumberField label="Source char limit" min={500} value={config.auditContext.sourceCharLimit} onChange={(sourceCharLimit) => updateConfig((c) => ({ ...c, auditContext: { ...c.auditContext, sourceCharLimit } }))} />
            <NumberField label="Content preview chars" min={0} value={config.auditContext.contentPreviewChars} onChange={(contentPreviewChars) => updateConfig((c) => ({ ...c, auditContext: { ...c.auditContext, contentPreviewChars } }))} />
          </div>
          <div className="grid gap-3 md:grid-cols-4">
            <SettingSwitch label="Agent sources" description="Include agent source files." checked={config.auditContext.includeAgentSources} onCheckedChange={(includeAgentSources) => updateConfig((c) => ({ ...c, auditContext: { ...c.auditContext, includeAgentSources } }))} />
            <SettingSwitch label="Frontend sources" description="Include frontend source files." checked={config.auditContext.includeFrontendSources} onCheckedChange={(includeFrontendSources) => updateConfig((c) => ({ ...c, auditContext: { ...c.auditContext, includeFrontendSources } }))} />
            <SettingSwitch label="Backend sources" description="Include Convex/backend source files." checked={config.auditContext.includeBackendSources} onCheckedChange={(includeBackendSources) => updateConfig((c) => ({ ...c, auditContext: { ...c.auditContext, includeBackendSources } }))} />
            <SettingSwitch label="GA data" description="Include Google Analytics data if available." checked={config.auditContext.includeGaData} onCheckedChange={(includeGaData) => updateConfig((c) => ({ ...c, auditContext: { ...c.auditContext, includeGaData } }))} />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-xl">Report limits</CardTitle><CardDescription>Controls report size and fallback behavior.</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              <NumberField label="Max findings" min={0} value={config.report.maxFindings} onChange={(maxFindings) => updateConfig((c) => ({ ...c, report: { ...c.report, maxFindings } }))} />
              <NumberField label="Max proposals" min={0} value={config.report.maxProposals} onChange={(maxProposals) => updateConfig((c) => ({ ...c, report: { ...c.report, maxProposals } }))} />
              <NumberField label="Default confidence" min={0} step="0.01" value={config.report.defaultConfidence} onChange={(defaultConfidence) => updateConfig((c) => ({ ...c, report: { ...c.report, defaultConfidence } }))} />
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <SettingSwitch label="Fallback report" description="Use deterministic report if LLM fails." checked={config.report.fallbackReportEnabled} onCheckedChange={(fallbackReportEnabled) => updateConfig((c) => ({ ...c, report: { ...c.report, fallbackReportEnabled } }))} />
              <SettingSwitch label="Filter already applied" description="Drop proposals already present in files." checked={config.report.filterAlreadyApplied} onCheckedChange={(filterAlreadyApplied) => updateConfig((c) => ({ ...c, report: { ...c.report, filterAlreadyApplied } }))} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-xl">Apply behavior</CardTitle><CardDescription>Controls patch application safety.</CardDescription></CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            <SettingSwitch label="Review schema changes" description="Require review for schema changes." checked={config.apply.requireReviewForSchemaChanges} onCheckedChange={(requireReviewForSchemaChanges) => updateConfig((c) => ({ ...c, apply: { ...c.apply, requireReviewForSchemaChanges } }))} />
            <SettingSwitch label="Never auto-apply review" description="Skip requires_review in apply-all." checked={config.apply.neverAutoApplyReviewRequired} onCheckedChange={(neverAutoApplyReviewRequired) => updateConfig((c) => ({ ...c, apply: { ...c.apply, neverAutoApplyReviewRequired } }))} />
            <SettingSwitch label="Run verification" description="Run dry-run when recommended." checked={config.apply.runVerificationWhenRecommended} onCheckedChange={(runVerificationWhenRecommended) => updateConfig((c) => ({ ...c, apply: { ...c.apply, runVerificationWhenRecommended } }))} />
            <SettingSwitch label="Save repair artifacts" description="Write proposal verification artifacts." checked={config.apply.saveRepairArtifacts} onCheckedChange={(saveRepairArtifacts) => updateConfig((c) => ({ ...c, apply: { ...c.apply, saveRepairArtifacts } }))} />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-xl">Alerts & logging</CardTitle><CardDescription>Controls report notifications and session logs.</CardDescription></CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            <SettingSwitch label="Telegram report" description="Send Telegram MetaAgent report." checked={config.alerts.telegramEnabled} onCheckedChange={(telegramEnabled) => updateConfig((c) => ({ ...c, alerts: { ...c.alerts, telegramEnabled } }))} />
            <SettingSwitch label="Save session log" description="Write agents/logs/meta-*.json." checked={config.logging.saveSessionLog} onCheckedChange={(saveSessionLog) => updateConfig((c) => ({ ...c, logging: { ...c.logging, saveSessionLog } }))} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-xl">Prompt controls</CardTitle><CardDescription>Additional instruction for Meta Agent analysis.</CardDescription></CardHeader>
          <CardContent>
            <div className="space-y-2"><Label>Custom instruction</Label><Textarea rows={7} value={config.promptControls.customInstruction} onChange={(event) => updateConfig((c) => ({ ...c, promptControls: { ...c.promptControls, customInstruction: event.target.value } }))} /></div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
