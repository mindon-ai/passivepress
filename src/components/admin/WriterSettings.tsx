import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { FileText, RotateCcw, Save } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

const writerDefaults = {
  metadata: {
    titleMaxChars: 200,
    slugMaxChars: 60,
    excerptMaxChars: 300,
    metaTitleMaxChars: 60,
    metaDescriptionMaxChars: 160,
    includeKeywords: true,
    customInstruction: "",
  },
  content: {
    minWords: 1100,
    targetMinWords: 1100,
    targetMaxWords: 1400,
    bodySectionsMin: 4,
    bodySectionsMax: 5,
    requireKeyTakeaways: true,
    requireFaq: true,
    requireConclusion: true,
    customInstruction: "",
  },
  context: {
    includeResearch: true,
    includeDataViz: true,
    includeSourceLinks: true,
    includeInternalLinks: true,
    existingPostsLimit: 25,
    includeFurtherReading: true,
    includeTableOfContents: true,
  },
  continuation: {
    enabled: true,
    maxTokens: 2500,
  },
  cleanup: {
    stripReferences: true,
    deduplicateBold: true,
    fixBoldHeadings: true,
    validateInternalLinks: true,
  },
};

type WriterConfig = typeof writerDefaults;

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

export function WriterSettings() {
  const saved = useQuery(api.agentSettings.getWriter, {});
  const saveWriter = useMutation(api.agentSettings.updateWriter);
  const resetWriter = useMutation(api.agentSettings.resetWriter);
  const [config, setConfig] = useState<WriterConfig>(writerDefaults);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (saved?.config) setConfig(saved.config as WriterConfig);
  }, [saved]);

  const updatedLabel = useMemo(() => {
    if (!saved?.updatedAt) return "Using code defaults";
    return `Last saved ${new Date(saved.updatedAt).toLocaleString()}`;
  }, [saved?.updatedAt]);

  const updateConfig = (updater: (current: WriterConfig) => WriterConfig) => setConfig((current) => updater(current));

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await saveWriter({ config });
      toast.success("Writer settings saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save Writer settings");
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = async () => {
    if (!confirm("Reset Writer settings to code defaults?")) return;
    setIsSaving(true);
    try {
      const defaults = await resetWriter();
      setConfig(defaults as WriterConfig);
      toast.success("Writer settings reset");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to reset Writer settings");
    } finally {
      setIsSaving(false);
    }
  };

  if (saved === undefined) {
    return <div className="rounded-md border border-border p-8 text-center text-sm text-muted-foreground">Loading Writer settings…</div>;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-muted-foreground" />
                <CardTitle>Writer</CardTitle>
              </div>
              <CardDescription className="mt-2">Writes publication-ready Markdown articles, metadata, SEO fields, and final cleanup.</CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={handleReset} disabled={isSaving}><RotateCcw className="mr-2 h-4 w-4" />Reset</Button>
              <Button onClick={handleSave} disabled={isSaving}><Save className="mr-2 h-4 w-4" />Save settings</Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 text-sm md:grid-cols-3">
            <div className="rounded-md bg-muted p-4"><div className="text-muted-foreground">Pipeline stage</div><div className="mt-1 font-medium">6 — Article drafting</div></div>
            <div className="rounded-md bg-muted p-4"><div className="text-muted-foreground">Runtime</div><div className="mt-1 font-medium">pi agents + continuation LLM</div></div>
            <div className="rounded-md bg-muted p-4"><div className="text-muted-foreground">Status</div><div className="mt-1 font-medium">{updatedLabel}</div></div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-xl">Metadata</CardTitle><CardDescription>Controls metadata prompt and field length caps.</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-5">
            <NumberField label="Title max" min={40} value={config.metadata.titleMaxChars} onChange={(titleMaxChars) => updateConfig((c) => ({ ...c, metadata: { ...c.metadata, titleMaxChars } }))} />
            <NumberField label="Slug max" min={20} value={config.metadata.slugMaxChars} onChange={(slugMaxChars) => updateConfig((c) => ({ ...c, metadata: { ...c.metadata, slugMaxChars } }))} />
            <NumberField label="Excerpt max" min={80} value={config.metadata.excerptMaxChars} onChange={(excerptMaxChars) => updateConfig((c) => ({ ...c, metadata: { ...c.metadata, excerptMaxChars } }))} />
            <NumberField label="Meta title max" min={40} value={config.metadata.metaTitleMaxChars} onChange={(metaTitleMaxChars) => updateConfig((c) => ({ ...c, metadata: { ...c.metadata, metaTitleMaxChars } }))} />
            <NumberField label="Meta desc max" min={100} value={config.metadata.metaDescriptionMaxChars} onChange={(metaDescriptionMaxChars) => updateConfig((c) => ({ ...c, metadata: { ...c.metadata, metaDescriptionMaxChars } }))} />
          </div>
          <SettingSwitch label="Include keywords" description="Include topic keywords in metadata prompt." checked={config.metadata.includeKeywords} onCheckedChange={(includeKeywords) => updateConfig((c) => ({ ...c, metadata: { ...c.metadata, includeKeywords } }))} />
          <div className="space-y-2"><Label>Custom metadata instruction</Label><Textarea rows={3} value={config.metadata.customInstruction} onChange={(event) => updateConfig((c) => ({ ...c, metadata: { ...c.metadata, customInstruction: event.target.value } }))} /></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-xl">Article content</CardTitle><CardDescription>Controls article structure and minimum quality gates.</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-5">
            <NumberField label="Minimum words" min={500} value={config.content.minWords} onChange={(minWords) => updateConfig((c) => ({ ...c, content: { ...c.content, minWords } }))} />
            <NumberField label="Target min" min={500} value={config.content.targetMinWords} onChange={(targetMinWords) => updateConfig((c) => ({ ...c, content: { ...c.content, targetMinWords } }))} />
            <NumberField label="Target max" min={500} value={config.content.targetMaxWords} onChange={(targetMaxWords) => updateConfig((c) => ({ ...c, content: { ...c.content, targetMaxWords } }))} />
            <NumberField label="Min sections" min={1} value={config.content.bodySectionsMin} onChange={(bodySectionsMin) => updateConfig((c) => ({ ...c, content: { ...c.content, bodySectionsMin } }))} />
            <NumberField label="Max sections" min={1} value={config.content.bodySectionsMax} onChange={(bodySectionsMax) => updateConfig((c) => ({ ...c, content: { ...c.content, bodySectionsMax } }))} />
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <SettingSwitch label="Key Takeaways" description="Require ## Key Takeaways." checked={config.content.requireKeyTakeaways} onCheckedChange={(requireKeyTakeaways) => updateConfig((c) => ({ ...c, content: { ...c.content, requireKeyTakeaways } }))} />
            <SettingSwitch label="FAQ" description="Require ## FAQ." checked={config.content.requireFaq} onCheckedChange={(requireFaq) => updateConfig((c) => ({ ...c, content: { ...c.content, requireFaq } }))} />
            <SettingSwitch label="Conclusion" description="Require ## Conclusion." checked={config.content.requireConclusion} onCheckedChange={(requireConclusion) => updateConfig((c) => ({ ...c, content: { ...c.content, requireConclusion } }))} />
          </div>
          <div className="space-y-2"><Label>Custom writing instruction</Label><Textarea rows={5} value={config.content.customInstruction} onChange={(event) => updateConfig((c) => ({ ...c, content: { ...c.content, customInstruction: event.target.value } }))} /></div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-xl">Context</CardTitle><CardDescription>Controls what supporting context Writer receives and appends.</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <SettingSwitch label="Research" description="Include Researcher data." checked={config.context.includeResearch} onCheckedChange={(includeResearch) => updateConfig((c) => ({ ...c, context: { ...c.context, includeResearch } }))} />
              <SettingSwitch label="Data Viz" description="Include chart blocks." checked={config.context.includeDataViz} onCheckedChange={(includeDataViz) => updateConfig((c) => ({ ...c, context: { ...c.context, includeDataViz } }))} />
              <SettingSwitch label="Source links" description="Include source URL list." checked={config.context.includeSourceLinks} onCheckedChange={(includeSourceLinks) => updateConfig((c) => ({ ...c, context: { ...c.context, includeSourceLinks } }))} />
              <SettingSwitch label="Internal links" description="Use existing posts for links." checked={config.context.includeInternalLinks} onCheckedChange={(includeInternalLinks) => updateConfig((c) => ({ ...c, context: { ...c.context, includeInternalLinks } }))} />
              <SettingSwitch label="Further Reading" description="Append Further Reading section." checked={config.context.includeFurtherReading} onCheckedChange={(includeFurtherReading) => updateConfig((c) => ({ ...c, context: { ...c.context, includeFurtherReading } }))} />
              <SettingSwitch label="Table of Contents" description="Auto-insert Contents section." checked={config.context.includeTableOfContents} onCheckedChange={(includeTableOfContents) => updateConfig((c) => ({ ...c, context: { ...c.context, includeTableOfContents } }))} />
            </div>
            <NumberField label="Existing posts limit" min={0} value={config.context.existingPostsLimit} onChange={(existingPostsLimit) => updateConfig((c) => ({ ...c, context: { ...c.context, existingPostsLimit } }))} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-xl">Continuation & cleanup</CardTitle><CardDescription>Controls short-article continuation and post-processing.</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <SettingSwitch label="Continuation" description="Continue if article is short/missing sections." checked={config.continuation.enabled} onCheckedChange={(enabled) => updateConfig((c) => ({ ...c, continuation: { ...c.continuation, enabled } }))} />
              <NumberField label="Continuation max tokens" min={500} value={config.continuation.maxTokens} onChange={(maxTokens) => updateConfig((c) => ({ ...c, continuation: { ...c.continuation, maxTokens } }))} />
              <SettingSwitch label="Strip references" description="Remove References/Bibliography sections." checked={config.cleanup.stripReferences} onCheckedChange={(stripReferences) => updateConfig((c) => ({ ...c, cleanup: { ...c.cleanup, stripReferences } }))} />
              <SettingSwitch label="Deduplicate bold" description="Keep first bold occurrence only." checked={config.cleanup.deduplicateBold} onCheckedChange={(deduplicateBold) => updateConfig((c) => ({ ...c, cleanup: { ...c.cleanup, deduplicateBold } }))} />
              <SettingSwitch label="Fix bold headings" description="Convert **## Heading** to ## Heading." checked={config.cleanup.fixBoldHeadings} onCheckedChange={(fixBoldHeadings) => updateConfig((c) => ({ ...c, cleanup: { ...c.cleanup, fixBoldHeadings } }))} />
              <SettingSwitch label="Validate internal links" description="Remove hallucinated /slug links." checked={config.cleanup.validateInternalLinks} onCheckedChange={(validateInternalLinks) => updateConfig((c) => ({ ...c, cleanup: { ...c.cleanup, validateInternalLinks } }))} />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
