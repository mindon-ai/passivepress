import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Rocket, RotateCcw, Save } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

const publisherDefaults = {
  validation: {
    requireValidSlug: true,
    minTitleChars: 10,
    minWords: 1100,
    maxExcerptChars: 300,
    minMetaTitleChars: 50,
    maxMetaTitleChars: 60,
    minMetaDescriptionChars: 120,
    maxMetaDescriptionChars: 160,
    requireImageFile: true,
  },
  slug: {
    verifyUniqueness: true,
    failOnDuplicate: true,
  },
  image: {
    uploadToConvexStorage: true,
    requireStorageUrl: true,
    allowExistingStorageId: true,
  },
  publish: {
    enabled: true,
    dryRun: false,
    fallbackToChosenKeywords: true,
    requireCategoryId: false,
  },
};

type PublisherConfig = typeof publisherDefaults;

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

export function PublisherSettings() {
  const saved = useQuery(api.agentSettings.getPublisher, {});
  const savePublisher = useMutation(api.agentSettings.updatePublisher);
  const resetPublisher = useMutation(api.agentSettings.resetPublisher);
  const [config, setConfig] = useState<PublisherConfig>(publisherDefaults);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (saved?.config) setConfig(saved.config as PublisherConfig);
  }, [saved]);

  const updatedLabel = useMemo(() => {
    if (!saved?.updatedAt) return "Using code defaults";
    return `Last saved ${new Date(saved.updatedAt).toLocaleString()}`;
  }, [saved?.updatedAt]);

  const updateConfig = (updater: (current: PublisherConfig) => PublisherConfig) => setConfig((current) => updater(current));

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await savePublisher({ config });
      toast.success("Publisher settings saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save Publisher settings");
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = async () => {
    if (!confirm("Reset Publisher settings to code defaults?")) return;
    setIsSaving(true);
    try {
      const defaults = await resetPublisher();
      setConfig(defaults as PublisherConfig);
      toast.success("Publisher settings reset");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to reset Publisher settings");
    } finally {
      setIsSaving(false);
    }
  };

  if (saved === undefined) {
    return <div className="rounded-md border border-border p-8 text-center text-sm text-muted-foreground">Loading Publisher settings…</div>;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Rocket className="h-5 w-5 text-muted-foreground" />
                <CardTitle>Publisher</CardTitle>
              </div>
              <CardDescription className="mt-2">Validates the final pipeline context, uploads the featured image, and writes the post to Convex.</CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={handleReset} disabled={isSaving}><RotateCcw className="mr-2 h-4 w-4" />Reset</Button>
              <Button onClick={handleSave} disabled={isSaving}><Save className="mr-2 h-4 w-4" />Save settings</Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 text-sm md:grid-cols-3">
            <div className="rounded-md bg-muted p-4"><div className="text-muted-foreground">Pipeline stage</div><div className="mt-1 font-medium">7 — Publish to Convex</div></div>
            <div className="rounded-md bg-muted p-4"><div className="text-muted-foreground">Runtime</div><div className="mt-1 font-medium">validation + Convex write</div></div>
            <div className="rounded-md bg-muted p-4"><div className="text-muted-foreground">Status</div><div className="mt-1 font-medium">{updatedLabel}</div></div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-xl">Validation gates</CardTitle><CardDescription>Controls quality checks before publishing.</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <SettingSwitch label="Require valid slug" description="Slug must be lowercase kebab-case." checked={config.validation.requireValidSlug} onCheckedChange={(requireValidSlug) => updateConfig((c) => ({ ...c, validation: { ...c.validation, requireValidSlug } }))} />
            <SettingSwitch label="Require image file" description="Featured image file must exist on disk." checked={config.validation.requireImageFile} onCheckedChange={(requireImageFile) => updateConfig((c) => ({ ...c, validation: { ...c.validation, requireImageFile } }))} />
          </div>
          <div className="grid gap-4 md:grid-cols-4">
            <NumberField label="Min title chars" min={1} value={config.validation.minTitleChars} onChange={(minTitleChars) => updateConfig((c) => ({ ...c, validation: { ...c.validation, minTitleChars } }))} />
            <NumberField label="Min words" min={1} value={config.validation.minWords} onChange={(minWords) => updateConfig((c) => ({ ...c, validation: { ...c.validation, minWords } }))} />
            <NumberField label="Max excerpt chars" min={1} value={config.validation.maxExcerptChars} onChange={(maxExcerptChars) => updateConfig((c) => ({ ...c, validation: { ...c.validation, maxExcerptChars } }))} />
            <NumberField label="Min meta title" min={0} value={config.validation.minMetaTitleChars} onChange={(minMetaTitleChars) => updateConfig((c) => ({ ...c, validation: { ...c.validation, minMetaTitleChars } }))} />
            <NumberField label="Max meta title" min={1} value={config.validation.maxMetaTitleChars} onChange={(maxMetaTitleChars) => updateConfig((c) => ({ ...c, validation: { ...c.validation, maxMetaTitleChars } }))} />
            <NumberField label="Min meta desc" min={0} value={config.validation.minMetaDescriptionChars} onChange={(minMetaDescriptionChars) => updateConfig((c) => ({ ...c, validation: { ...c.validation, minMetaDescriptionChars } }))} />
            <NumberField label="Max meta desc" min={1} value={config.validation.maxMetaDescriptionChars} onChange={(maxMetaDescriptionChars) => updateConfig((c) => ({ ...c, validation: { ...c.validation, maxMetaDescriptionChars } }))} />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-xl">Slug & image</CardTitle><CardDescription>Controls final slug checks and image upload behavior.</CardDescription></CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            <SettingSwitch label="Verify uniqueness" description="Check Convex before writing." checked={config.slug.verifyUniqueness} onCheckedChange={(verifyUniqueness) => updateConfig((c) => ({ ...c, slug: { ...c.slug, verifyUniqueness } }))} />
            <SettingSwitch label="Fail on duplicate" description="Throw if slug already exists." checked={config.slug.failOnDuplicate} onCheckedChange={(failOnDuplicate) => updateConfig((c) => ({ ...c, slug: { ...c.slug, failOnDuplicate } }))} />
            <SettingSwitch label="Upload image" description="Upload local featured image to Convex Storage." checked={config.image.uploadToConvexStorage} onCheckedChange={(uploadToConvexStorage) => updateConfig((c) => ({ ...c, image: { ...c.image, uploadToConvexStorage } }))} />
            <SettingSwitch label="Require storage URL" description="Fail if storage URL is unavailable." checked={config.image.requireStorageUrl} onCheckedChange={(requireStorageUrl) => updateConfig((c) => ({ ...c, image: { ...c.image, requireStorageUrl } }))} />
            <SettingSwitch label="Allow existing storage" description="Reuse existing storageId/publicUrl if present." checked={config.image.allowExistingStorageId} onCheckedChange={(allowExistingStorageId) => updateConfig((c) => ({ ...c, image: { ...c.image, allowExistingStorageId } }))} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-xl">Publish behavior</CardTitle><CardDescription>Controls whether Publisher writes to Convex.</CardDescription></CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            <SettingSwitch label="Publishing enabled" description="Allow Convex post creation." checked={config.publish.enabled} onCheckedChange={(enabled) => updateConfig((c) => ({ ...c, publish: { ...c.publish, enabled } }))} />
            <SettingSwitch label="Dry run" description="Validate but skip Convex write." checked={config.publish.dryRun} onCheckedChange={(dryRun) => updateConfig((c) => ({ ...c, publish: { ...c.publish, dryRun } }))} />
            <SettingSwitch label="Fallback keywords" description="Use chosen topic keywords if draft has none." checked={config.publish.fallbackToChosenKeywords} onCheckedChange={(fallbackToChosenKeywords) => updateConfig((c) => ({ ...c, publish: { ...c.publish, fallbackToChosenKeywords } }))} />
            <SettingSwitch label="Require category ID" description="Fail if Topic Picker did not resolve categoryId." checked={config.publish.requireCategoryId} onCheckedChange={(requireCategoryId) => updateConfig((c) => ({ ...c, publish: { ...c.publish, requireCategoryId } }))} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
