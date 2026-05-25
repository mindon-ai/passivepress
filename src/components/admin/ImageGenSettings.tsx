import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { ImageIcon, Palette, RotateCcw, Save } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

const imageGenDefaults = {
  specPrompt: {
    includeAngle: true,
    includeCategory: true,
    includeKeywords: true,
    keywordLimit: 6,
    includeResearchFindings: true,
    researchFindingLimit: 3,
    includeResearchPapers: true,
    researchPaperLimit: 2,
    customInstruction: "",
  },
  imagePrompt: {
    maxPromptChars: 300,
    maxAltTextChars: 125,
    stylePreset: "editorial abstract AI illustration, dark sci-fi, cyberpunk concept art",
    qualityBoosters: "masterpiece, best quality, ultra-detailed, 8k, sharp focus, cinematic composition",
    negativeConstraints: "no text, no logos, no human faces, no humanoid robots, no light bulbs, no stock photo",
    fallbackPromptTemplate: "{category} AI technology abstract, dark background neon accents, cinematic wide 16:9, no text, no logos, no humanoid robot",
    fallbackAltTemplate: "Abstract illustration representing {title}",
  },
  generation: {
    enabled: true,
    retryWithSimplePrompt: true,
    allowUnsplashFallback: true,
    allowSolidColorFallback: true,
  },
  output: {
    width: 1600,
    height: 900,
    quality: 85,
    format: "webp" as const,
  },
};

type ImageGenConfig = typeof imageGenDefaults;

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

function NumberField({ label, value, onChange, min = 0, max }: { label: string; value: number; onChange: (value: number) => void; min?: number; max?: number }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input type="number" min={min} max={max} value={value} onChange={(event) => onChange(numberValue(event.target.value, value))} />
    </div>
  );
}

export function ImageGenSettings() {
  const saved = useQuery(api.agentSettings.getImageGen, {});
  const saveImageGen = useMutation(api.agentSettings.updateImageGen);
  const resetImageGen = useMutation(api.agentSettings.resetImageGen);
  const [config, setConfig] = useState<ImageGenConfig>(imageGenDefaults);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (saved?.config) setConfig(saved.config as ImageGenConfig);
  }, [saved]);

  const updatedLabel = useMemo(() => {
    if (!saved?.updatedAt) return "Using code defaults";
    return `Last saved ${new Date(saved.updatedAt).toLocaleString()}`;
  }, [saved?.updatedAt]);

  const updateConfig = (updater: (current: ImageGenConfig) => ImageGenConfig) => setConfig((current) => updater(current));

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await saveImageGen({ config });
      toast.success("Image Gen settings saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save Image Gen settings");
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = async () => {
    if (!confirm("Reset Image Gen settings to code defaults?")) return;
    setIsSaving(true);
    try {
      const defaults = await resetImageGen();
      setConfig(defaults as ImageGenConfig);
      toast.success("Image Gen settings reset");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to reset Image Gen settings");
    } finally {
      setIsSaving(false);
    }
  };

  if (saved === undefined) {
    return <div className="rounded-md border border-border p-8 text-center text-sm text-muted-foreground">Loading Image Gen settings…</div>;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <ImageIcon className="h-5 w-5 text-muted-foreground" />
                <CardTitle>Image Gen</CardTitle>
              </div>
              <CardDescription className="mt-2">Creates the featured image prompt, alt text, and final WebP image.</CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={handleReset} disabled={isSaving}><RotateCcw className="mr-2 h-4 w-4" />Reset</Button>
              <Button onClick={handleSave} disabled={isSaving}><Save className="mr-2 h-4 w-4" />Save settings</Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 text-sm md:grid-cols-3">
            <div className="rounded-md bg-muted p-4"><div className="text-muted-foreground">Pipeline stage</div><div className="mt-1 font-medium">4 — Featured image</div></div>
            <div className="rounded-md bg-muted p-4"><div className="text-muted-foreground">Runtime</div><div className="mt-1 font-medium">pi spec + image worker</div></div>
            <div className="rounded-md bg-muted p-4"><div className="text-muted-foreground">Status</div><div className="mt-1 font-medium">{updatedLabel}</div></div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Visual brief inputs</CardTitle>
          <CardDescription>Controls what article context is sent to the prompt-writing agent.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <SettingSwitch label="Include angle" description="Use Topic Picker editorial angle." checked={config.specPrompt.includeAngle} onCheckedChange={(includeAngle) => updateConfig((c) => ({ ...c, specPrompt: { ...c.specPrompt, includeAngle } }))} />
            <SettingSwitch label="Include category" description="Use article category slug." checked={config.specPrompt.includeCategory} onCheckedChange={(includeCategory) => updateConfig((c) => ({ ...c, specPrompt: { ...c.specPrompt, includeCategory } }))} />
            <SettingSwitch label="Include keywords" description="Use SEO keywords in visual brief." checked={config.specPrompt.includeKeywords} onCheckedChange={(includeKeywords) => updateConfig((c) => ({ ...c, specPrompt: { ...c.specPrompt, includeKeywords } }))} />
            <SettingSwitch label="Research findings" description="Use Researcher key findings." checked={config.specPrompt.includeResearchFindings} onCheckedChange={(includeResearchFindings) => updateConfig((c) => ({ ...c, specPrompt: { ...c.specPrompt, includeResearchFindings } }))} />
            <SettingSwitch label="Research papers" description="Use Researcher papers/products." checked={config.specPrompt.includeResearchPapers} onCheckedChange={(includeResearchPapers) => updateConfig((c) => ({ ...c, specPrompt: { ...c.specPrompt, includeResearchPapers } }))} />
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <NumberField label="Keyword limit" min={0} value={config.specPrompt.keywordLimit} onChange={(keywordLimit) => updateConfig((c) => ({ ...c, specPrompt: { ...c.specPrompt, keywordLimit } }))} />
            <NumberField label="Finding limit" min={0} value={config.specPrompt.researchFindingLimit} onChange={(researchFindingLimit) => updateConfig((c) => ({ ...c, specPrompt: { ...c.specPrompt, researchFindingLimit } }))} />
            <NumberField label="Paper limit" min={0} value={config.specPrompt.researchPaperLimit} onChange={(researchPaperLimit) => updateConfig((c) => ({ ...c, specPrompt: { ...c.specPrompt, researchPaperLimit } }))} />
          </div>
          <div className="space-y-2">
            <Label>Custom visual instruction</Label>
            <Textarea rows={4} placeholder="Optional extra image direction..." value={config.specPrompt.customInstruction} onChange={(event) => updateConfig((c) => ({ ...c, specPrompt: { ...c.specPrompt, customInstruction: event.target.value } }))} />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2"><Palette className="h-5 w-5 text-muted-foreground" /><CardTitle className="text-xl">Prompt style</CardTitle></div>
            <CardDescription>Art direction and prompt constraints.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <NumberField label="Max prompt chars" min={50} value={config.imagePrompt.maxPromptChars} onChange={(maxPromptChars) => updateConfig((c) => ({ ...c, imagePrompt: { ...c.imagePrompt, maxPromptChars } }))} />
              <NumberField label="Max alt chars" min={20} value={config.imagePrompt.maxAltTextChars} onChange={(maxAltTextChars) => updateConfig((c) => ({ ...c, imagePrompt: { ...c.imagePrompt, maxAltTextChars } }))} />
            </div>
            <div className="space-y-2"><Label>Style preset</Label><Textarea rows={3} value={config.imagePrompt.stylePreset} onChange={(event) => updateConfig((c) => ({ ...c, imagePrompt: { ...c.imagePrompt, stylePreset: event.target.value } }))} /></div>
            <div className="space-y-2"><Label>Quality boosters</Label><Textarea rows={3} value={config.imagePrompt.qualityBoosters} onChange={(event) => updateConfig((c) => ({ ...c, imagePrompt: { ...c.imagePrompt, qualityBoosters: event.target.value } }))} /></div>
            <div className="space-y-2"><Label>Negative constraints</Label><Textarea rows={3} value={config.imagePrompt.negativeConstraints} onChange={(event) => updateConfig((c) => ({ ...c, imagePrompt: { ...c.imagePrompt, negativeConstraints: event.target.value } }))} /></div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Fallback templates</CardTitle>
            <CardDescription>Used when the spec agent does not return an image spec. Supports {`{title}`}, {`{category}`}, and {`{angle}`}.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2"><Label>Fallback prompt template</Label><Textarea rows={5} value={config.imagePrompt.fallbackPromptTemplate} onChange={(event) => updateConfig((c) => ({ ...c, imagePrompt: { ...c.imagePrompt, fallbackPromptTemplate: event.target.value } }))} /></div>
            <div className="space-y-2"><Label>Fallback alt template</Label><Input value={config.imagePrompt.fallbackAltTemplate} onChange={(event) => updateConfig((c) => ({ ...c, imagePrompt: { ...c.imagePrompt, fallbackAltTemplate: event.target.value } }))} /></div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Generation behavior</CardTitle>
            <CardDescription>Controls AI image generation and fallbacks.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            <SettingSwitch label="Enable generation" description="Call the image worker." checked={config.generation.enabled} onCheckedChange={(enabled) => updateConfig((c) => ({ ...c, generation: { ...c.generation, enabled } }))} />
            <SettingSwitch label="Retry simple prompt" description="Retry worker with simplified prompt." checked={config.generation.retryWithSimplePrompt} onCheckedChange={(retryWithSimplePrompt) => updateConfig((c) => ({ ...c, generation: { ...c.generation, retryWithSimplePrompt } }))} />
            <SettingSwitch label="Unsplash fallback" description="Try source.unsplash.com if worker fails." checked={config.generation.allowUnsplashFallback} onCheckedChange={(allowUnsplashFallback) => updateConfig((c) => ({ ...c, generation: { ...c.generation, allowUnsplashFallback } }))} />
            <SettingSwitch label="Solid fallback" description="Create a plain dark image if all else fails." checked={config.generation.allowSolidColorFallback} onCheckedChange={(allowSolidColorFallback) => updateConfig((c) => ({ ...c, generation: { ...c.generation, allowSolidColorFallback } }))} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Output</CardTitle>
            <CardDescription>Final WebP conversion settings.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-3">
            <NumberField label="Width" min={256} value={config.output.width} onChange={(width) => updateConfig((c) => ({ ...c, output: { ...c.output, width } }))} />
            <NumberField label="Height" min={256} value={config.output.height} onChange={(height) => updateConfig((c) => ({ ...c, output: { ...c.output, height } }))} />
            <NumberField label="Quality" min={1} max={100} value={config.output.quality} onChange={(quality) => updateConfig((c) => ({ ...c, output: { ...c.output, quality } }))} />
            <div className="rounded-md bg-muted p-4 text-sm md:col-span-3"><span className="text-muted-foreground">Format:</span> WebP</div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
