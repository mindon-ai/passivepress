import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Brain, RotateCcw, Save, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

const categoryOptions = [
  { id: "tech", label: "Tech" },
  { id: "home-appliances", label: "Home Appliances" },
  { id: "fitness", label: "Fitness" },
  { id: "kitchen", label: "Kitchen" },
  { id: "outdoors", label: "Outdoors" },
] as const;

const topicPickerDefaults = {
  candidatePool: {
    maxCandidates: 10,
    recentLogLimit: 12,
    recentChosenTitlesLimit: 10,
    recentCategoriesLimit: 10,
  },
  editorialWeights: {
    novelty: 5,
    specificity: 5,
    audienceFit: 5,
    categoryDiversity: 4,
    sourceQuality: 3,
  },
  categoryRules: {
    enabledCategories: ["tech", "home-appliances", "fitness", "kitchen", "outdoors"],
    avoidLastRuns: 3,
    overusedCategoryThreshold: 2,
    allowCategoryOverride: true,
    defaultFallbackCategory: "tech" as const,
  },
  duplicateRules: {
    promptSimilarityThreshold: 0.25,
    strategyOverrideDelta: 8,
    repeatedEntityStaleThreshold: 3,
    blockNearDuplicates: true,
    blockRecentChosenTitles: true,
    blockPublishedTitles: true,
  },
  sourceRules: {
    preferOfficial: true,
    preferResearch: true,
    preferTopTier: true,
    allowCommunity: true,
    allowAggregator: true,
    minimumSourceTier: "aggregator" as const,
  },
  keywordRules: {
    minKeywords: 5,
    maxKeywords: 10,
    requireLongTail: true,
    deduplicateKeywords: true,
  },
  angleRules: {
    minSentences: 1,
    maxSentences: 3,
    headlineMaxChars: 90,
    fallbackAngle: "A practical buyer guide comparing current products by value, use case, and trade-offs.",
    banClickbait: true,
  },
  promptControls: {
    customInstruction: "",
    includeScoringNotes: true,
    includeBlockedTitles: true,
    includeRecentCategories: true,
    includeDuplicateRiskLabels: true,
  },
  fallbackRules: {
    enableFallback: true,
    overrideDuplicateChoice: true,
    overrideStaleChoice: true,
    overrideOverusedCategory: true,
    preferNonDuplicateFallback: true,
  },
};

type TopicPickerConfig = typeof topicPickerDefaults;
type CategorySlug = (typeof categoryOptions)[number]["id"];
type SourceTier = TopicPickerConfig["sourceRules"]["minimumSourceTier"];

function numberValue(value: string, fallback: number) {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

function SettingSwitch({
  label,
  description,
  checked,
  onCheckedChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
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

function NumberField({ label, value, onChange, step = 1, min }: { label: string; value: number; onChange: (value: number) => void; step?: number | string; min?: number }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input type="number" min={min} step={step} value={value} onChange={(event) => onChange(numberValue(event.target.value, value))} />
    </div>
  );
}

export function TopicPickerSettings() {
  const saved = useQuery(api.agentSettings.getTopicPicker, {});
  const saveTopicPicker = useMutation(api.agentSettings.updateTopicPicker);
  const resetTopicPicker = useMutation(api.agentSettings.resetTopicPicker);
  const [config, setConfig] = useState<TopicPickerConfig>(topicPickerDefaults);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (saved?.config) setConfig(saved.config as TopicPickerConfig);
  }, [saved]);

  const updatedLabel = useMemo(() => {
    if (!saved?.updatedAt) return "Using code defaults";
    return `Last saved ${new Date(saved.updatedAt).toLocaleString()}`;
  }, [saved?.updatedAt]);

  const updateConfig = (updater: (current: TopicPickerConfig) => TopicPickerConfig) => {
    setConfig((current) => updater(current));
  };

  const toggleCategory = (category: CategorySlug, checked: boolean) => {
    updateConfig((current) => {
      const enabled = new Set(current.categoryRules.enabledCategories);
      if (checked) enabled.add(category);
      else enabled.delete(category);
      return {
        ...current,
        categoryRules: {
          ...current.categoryRules,
          enabledCategories: [...enabled] as CategorySlug[],
        },
      };
    });
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await saveTopicPicker({ config });
      toast.success("Topic Picker settings saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save Topic Picker settings");
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = async () => {
    if (!confirm("Reset Topic Picker settings to code defaults?")) return;
    setIsSaving(true);
    try {
      const defaults = await resetTopicPicker();
      setConfig(defaults as TopicPickerConfig);
      toast.success("Topic Picker settings reset");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to reset Topic Picker settings");
    } finally {
      setIsSaving(false);
    }
  };

  if (saved === undefined) {
    return <div className="rounded-md border border-border p-8 text-center text-sm text-muted-foreground">Loading Topic Picker settings…</div>;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Brain className="h-5 w-5 text-muted-foreground" />
                <CardTitle>Topic Picker</CardTitle>
              </div>
              <CardDescription className="mt-2">
                Chooses the final article topic and editorial angle from Trend Scout candidates.
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={handleReset} disabled={isSaving}>
                <RotateCcw className="mr-2 h-4 w-4" />Reset
              </Button>
              <Button onClick={handleSave} disabled={isSaving}>
                <Save className="mr-2 h-4 w-4" />Save settings
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 text-sm md:grid-cols-3">
            <div className="rounded-md bg-muted p-4"><div className="text-muted-foreground">Pipeline stage</div><div className="mt-1 font-medium">2 — Editorial selection</div></div>
            <div className="rounded-md bg-muted p-4"><div className="text-muted-foreground">Runtime</div><div className="mt-1 font-medium">pi agent + validation</div></div>
            <div className="rounded-md bg-muted p-4"><div className="text-muted-foreground">Status</div><div className="mt-1 font-medium">{updatedLabel}</div></div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Candidate pool</CardTitle>
            <CardDescription>How many candidates and history entries Topic Picker considers.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <NumberField label="Max candidates" min={1} value={config.candidatePool.maxCandidates} onChange={(maxCandidates) => updateConfig((c) => ({ ...c, candidatePool: { ...c.candidatePool, maxCandidates } }))} />
            <NumberField label="Recent log limit" min={1} value={config.candidatePool.recentLogLimit} onChange={(recentLogLimit) => updateConfig((c) => ({ ...c, candidatePool: { ...c.candidatePool, recentLogLimit } }))} />
            <NumberField label="Recent chosen titles" min={1} value={config.candidatePool.recentChosenTitlesLimit} onChange={(recentChosenTitlesLimit) => updateConfig((c) => ({ ...c, candidatePool: { ...c.candidatePool, recentChosenTitlesLimit } }))} />
            <NumberField label="Recent categories" min={1} value={config.candidatePool.recentCategoriesLimit} onChange={(recentCategoriesLimit) => updateConfig((c) => ({ ...c, candidatePool: { ...c.candidatePool, recentCategoriesLimit } }))} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Editorial weights</CardTitle>
            <CardDescription>Preference weights used to guide editorial selection.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            {([
              ["novelty", "Novelty"],
              ["specificity", "Specificity"],
              ["audienceFit", "Audience fit"],
              ["categoryDiversity", "Category diversity"],
              ["sourceQuality", "Source quality"],
            ] as const).map(([key, label]) => (
              <NumberField key={key} label={label} min={0} value={config.editorialWeights[key]} onChange={(value) => updateConfig((c) => ({ ...c, editorialWeights: { ...c.editorialWeights, [key]: value } }))} />
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Category rules</CardTitle>
          <CardDescription>Control category eligibility and rotation behavior.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {categoryOptions.map((category) => (
              <SettingSwitch
                key={category.id}
                label={category.label}
                description={category.id}
                checked={config.categoryRules.enabledCategories.includes(category.id)}
                onCheckedChange={(checked) => toggleCategory(category.id, checked)}
              />
            ))}
          </div>
          <div className="grid gap-4 md:grid-cols-4">
            <NumberField label="Avoid last N runs" min={1} value={config.categoryRules.avoidLastRuns} onChange={(avoidLastRuns) => updateConfig((c) => ({ ...c, categoryRules: { ...c.categoryRules, avoidLastRuns } }))} />
            <NumberField label="Overuse threshold" min={1} value={config.categoryRules.overusedCategoryThreshold} onChange={(overusedCategoryThreshold) => updateConfig((c) => ({ ...c, categoryRules: { ...c.categoryRules, overusedCategoryThreshold } }))} />
            <div className="space-y-2">
              <Label>Fallback category</Label>
              <Select value={config.categoryRules.defaultFallbackCategory} onValueChange={(defaultFallbackCategory: CategorySlug) => updateConfig((c) => ({ ...c, categoryRules: { ...c.categoryRules, defaultFallbackCategory } }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{categoryOptions.map((category) => <SelectItem key={category.id} value={category.id}>{category.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <SettingSwitch label="Allow category override" description="Let validation replace overused categories." checked={config.categoryRules.allowCategoryOverride} onCheckedChange={(allowCategoryOverride) => updateConfig((c) => ({ ...c, categoryRules: { ...c.categoryRules, allowCategoryOverride } }))} />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Duplicate & freshness rules</CardTitle>
            <CardDescription>Controls duplicate blocking and strategy overrides.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              <NumberField label="Prompt similarity" step="0.01" value={config.duplicateRules.promptSimilarityThreshold} onChange={(promptSimilarityThreshold) => updateConfig((c) => ({ ...c, duplicateRules: { ...c.duplicateRules, promptSimilarityThreshold } }))} />
              <NumberField label="Override delta" value={config.duplicateRules.strategyOverrideDelta} onChange={(strategyOverrideDelta) => updateConfig((c) => ({ ...c, duplicateRules: { ...c.duplicateRules, strategyOverrideDelta } }))} />
              <NumberField label="Stale entity threshold" value={config.duplicateRules.repeatedEntityStaleThreshold} onChange={(repeatedEntityStaleThreshold) => updateConfig((c) => ({ ...c, duplicateRules: { ...c.duplicateRules, repeatedEntityStaleThreshold } }))} />
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <SettingSwitch label="Block near duplicates" description="Reject high duplicate-risk topics." checked={config.duplicateRules.blockNearDuplicates} onCheckedChange={(blockNearDuplicates) => updateConfig((c) => ({ ...c, duplicateRules: { ...c.duplicateRules, blockNearDuplicates } }))} />
              <SettingSwitch label="Block recent choices" description="Avoid recently chosen log titles." checked={config.duplicateRules.blockRecentChosenTitles} onCheckedChange={(blockRecentChosenTitles) => updateConfig((c) => ({ ...c, duplicateRules: { ...c.duplicateRules, blockRecentChosenTitles } }))} />
              <SettingSwitch label="Block published titles" description="Avoid already published posts." checked={config.duplicateRules.blockPublishedTitles} onCheckedChange={(blockPublishedTitles) => updateConfig((c) => ({ ...c, duplicateRules: { ...c.duplicateRules, blockPublishedTitles } }))} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Source rules</CardTitle>
            <CardDescription>Source quality preferences and allowed tiers.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <SettingSwitch label="Prefer official" description="Prioritize official AI source material." checked={config.sourceRules.preferOfficial} onCheckedChange={(preferOfficial) => updateConfig((c) => ({ ...c, sourceRules: { ...c.sourceRules, preferOfficial } }))} />
              <SettingSwitch label="Prefer research" description="Prioritize arXiv/open research." checked={config.sourceRules.preferResearch} onCheckedChange={(preferResearch) => updateConfig((c) => ({ ...c, sourceRules: { ...c.sourceRules, preferResearch } }))} />
              <SettingSwitch label="Prefer top-tier" description="Prioritize trusted tech outlets." checked={config.sourceRules.preferTopTier} onCheckedChange={(preferTopTier) => updateConfig((c) => ({ ...c, sourceRules: { ...c.sourceRules, preferTopTier } }))} />
              <SettingSwitch label="Allow community" description="Allow Reddit/HN/community topics." checked={config.sourceRules.allowCommunity} onCheckedChange={(allowCommunity) => updateConfig((c) => ({ ...c, sourceRules: { ...c.sourceRules, allowCommunity } }))} />
              <SettingSwitch label="Allow aggregator" description="Allow lower-tier aggregated sources." checked={config.sourceRules.allowAggregator} onCheckedChange={(allowAggregator) => updateConfig((c) => ({ ...c, sourceRules: { ...c.sourceRules, allowAggregator } }))} />
            </div>
            <div className="space-y-2">
              <Label>Minimum source tier</Label>
              <Select value={config.sourceRules.minimumSourceTier} onValueChange={(minimumSourceTier: SourceTier) => updateConfig((c) => ({ ...c, sourceRules: { ...c.sourceRules, minimumSourceTier } }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="official">Official</SelectItem>
                  <SelectItem value="research">Research</SelectItem>
                  <SelectItem value="top-tier">Top-tier</SelectItem>
                  <SelectItem value="community">Community</SelectItem>
                  <SelectItem value="aggregator">Aggregator</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Keyword & angle rules</CardTitle>
            <CardDescription>Controls SEO keyword and editorial angle requirements.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              <NumberField label="Min keywords" min={0} value={config.keywordRules.minKeywords} onChange={(minKeywords) => updateConfig((c) => ({ ...c, keywordRules: { ...c.keywordRules, minKeywords } }))} />
              <NumberField label="Max keywords" min={1} value={config.keywordRules.maxKeywords} onChange={(maxKeywords) => updateConfig((c) => ({ ...c, keywordRules: { ...c.keywordRules, maxKeywords } }))} />
              <NumberField label="Headline max chars" min={20} value={config.angleRules.headlineMaxChars} onChange={(headlineMaxChars) => updateConfig((c) => ({ ...c, angleRules: { ...c.angleRules, headlineMaxChars } }))} />
              <NumberField label="Min angle sentences" min={1} value={config.angleRules.minSentences} onChange={(minSentences) => updateConfig((c) => ({ ...c, angleRules: { ...c.angleRules, minSentences } }))} />
              <NumberField label="Max angle sentences" min={1} value={config.angleRules.maxSentences} onChange={(maxSentences) => updateConfig((c) => ({ ...c, angleRules: { ...c.angleRules, maxSentences } }))} />
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <SettingSwitch label="Require long-tail" description="Ask for long-tail SEO phrases." checked={config.keywordRules.requireLongTail} onCheckedChange={(requireLongTail) => updateConfig((c) => ({ ...c, keywordRules: { ...c.keywordRules, requireLongTail } }))} />
              <SettingSwitch label="Deduplicate keywords" description="Remove repeated keywords." checked={config.keywordRules.deduplicateKeywords} onCheckedChange={(deduplicateKeywords) => updateConfig((c) => ({ ...c, keywordRules: { ...c.keywordRules, deduplicateKeywords } }))} />
              <SettingSwitch label="Ban clickbait" description="Avoid clickbait headlines." checked={config.angleRules.banClickbait} onCheckedChange={(banClickbait) => updateConfig((c) => ({ ...c, angleRules: { ...c.angleRules, banClickbait } }))} />
            </div>
            <div className="space-y-2">
              <Label>Fallback angle</Label>
              <Textarea rows={3} value={config.angleRules.fallbackAngle} onChange={(event) => updateConfig((c) => ({ ...c, angleRules: { ...c.angleRules, fallbackAngle: event.target.value } }))} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2"><SlidersHorizontal className="h-5 w-5 text-muted-foreground" /><CardTitle className="text-xl">Prompt controls</CardTitle></div>
            <CardDescription>Controls extra context injected into the Topic Picker prompt.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <SettingSwitch label="Include scoring notes" description="Tell the LLM about strategy scoring." checked={config.promptControls.includeScoringNotes} onCheckedChange={(includeScoringNotes) => updateConfig((c) => ({ ...c, promptControls: { ...c.promptControls, includeScoringNotes } }))} />
              <SettingSwitch label="Include blocked titles" description="Show titles that must be avoided." checked={config.promptControls.includeBlockedTitles} onCheckedChange={(includeBlockedTitles) => updateConfig((c) => ({ ...c, promptControls: { ...c.promptControls, includeBlockedTitles } }))} />
              <SettingSwitch label="Include recent categories" description="Show category rotation history." checked={config.promptControls.includeRecentCategories} onCheckedChange={(includeRecentCategories) => updateConfig((c) => ({ ...c, promptControls: { ...c.promptControls, includeRecentCategories } }))} />
              <SettingSwitch label="Include duplicate risk" description="Label candidates by duplicate risk." checked={config.promptControls.includeDuplicateRiskLabels} onCheckedChange={(includeDuplicateRiskLabels) => updateConfig((c) => ({ ...c, promptControls: { ...c.promptControls, includeDuplicateRiskLabels } }))} />
            </div>
            <div className="space-y-2">
              <Label>Custom editorial instruction</Label>
              <Textarea rows={5} placeholder="Optional extra instruction for Topic Picker..." value={config.promptControls.customInstruction} onChange={(event) => updateConfig((c) => ({ ...c, promptControls: { ...c.promptControls, customInstruction: event.target.value } }))} />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Fallback behavior</CardTitle>
          <CardDescription>Controls deterministic overrides when the LLM makes a weak or unsafe choice.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 lg:grid-cols-5">
          <SettingSwitch label="Enable fallback" description="Use fallback if no valid topic is returned." checked={config.fallbackRules.enableFallback} onCheckedChange={(enableFallback) => updateConfig((c) => ({ ...c, fallbackRules: { ...c.fallbackRules, enableFallback } }))} />
          <SettingSwitch label="Override duplicates" description="Replace duplicate LLM choices." checked={config.fallbackRules.overrideDuplicateChoice} onCheckedChange={(overrideDuplicateChoice) => updateConfig((c) => ({ ...c, fallbackRules: { ...c.fallbackRules, overrideDuplicateChoice } }))} />
          <SettingSwitch label="Override stale" description="Replace stale repeated-entity choices." checked={config.fallbackRules.overrideStaleChoice} onCheckedChange={(overrideStaleChoice) => updateConfig((c) => ({ ...c, fallbackRules: { ...c.fallbackRules, overrideStaleChoice } }))} />
          <SettingSwitch label="Override overused" description="Replace overused category choices." checked={config.fallbackRules.overrideOverusedCategory} onCheckedChange={(overrideOverusedCategory) => updateConfig((c) => ({ ...c, fallbackRules: { ...c.fallbackRules, overrideOverusedCategory } }))} />
          <SettingSwitch label="Prefer non-duplicate" description="Fallback to first non-duplicate candidate." checked={config.fallbackRules.preferNonDuplicateFallback} onCheckedChange={(preferNonDuplicateFallback) => updateConfig((c) => ({ ...c, fallbackRules: { ...c.fallbackRules, preferNonDuplicateFallback } }))} />
        </CardContent>
      </Card>
    </div>
  );
}
