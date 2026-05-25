import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Bot, RotateCcw, Save, Search, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

const trendScoutDefaults = {
  sources: {
    serper: true,
    hackerNews: false,
    reddit: true,
    arxiv: false,
    fallback: true,
  },
  serper: {
    queries: [
      "best laptop to buy 2026",
      "best robot vacuum under 300",
      "best headphones 2026 review",
      "best air purifier for home",
      "best fitness tracker 2026",
      "best standing desk under 500",
    ],
    resultsPerQuery: 8,
    recency: "qdr:m" as const,
  },
  hackerNews: {
    query: "",
    hoursBack: 48,
    minPoints: 5,
    resultsPerPage: 20,
  },
  reddit: {
    subreddits: ["BuyItForLife", "frugalmalefashion", "homeimprovement", "gadgets", "buildapcsales", "VacuumCleaners"],
    timeframe: "week" as const,
    limitPerSubreddit: 8,
  },
  arxiv: {
    category: "",
    maxPapers: 0,
  },
  scoring: {
    majorModelBonus: 0,
    launchWordBonus: 20,
    freshnessBonus: 10,
    duplicatePenalty: 30,
    existingTitleSimilarityThreshold: 0.3,
    discoveredTopicDedupeThreshold: 0.35,
  },
  output: {
    maxTopics: 15,
    fallbackTopics: 5,
  },
};

type TrendScoutConfig = typeof trendScoutDefaults;
type Recency = TrendScoutConfig["serper"]["recency"];
type RedditTimeframe = TrendScoutConfig["reddit"]["timeframe"];

function linesToArray(value: string) {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

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

export function TrendScoutSettings() {
  const saved = useQuery(api.agentSettings.getTrendScout, {});
  const saveTrendScout = useMutation(api.agentSettings.updateTrendScout);
  const resetTrendScout = useMutation(api.agentSettings.resetTrendScout);
  const [config, setConfig] = useState<TrendScoutConfig>(trendScoutDefaults);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (saved?.config) setConfig(saved.config as TrendScoutConfig);
  }, [saved]);

  const updatedLabel = useMemo(() => {
    if (!saved?.updatedAt) return "Using code defaults";
    return `Last saved ${new Date(saved.updatedAt).toLocaleString()}`;
  }, [saved?.updatedAt]);

  const updateConfig = (updater: (current: TrendScoutConfig) => TrendScoutConfig) => {
    setConfig((current) => updater(current));
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await saveTrendScout({ config });
      toast.success("Trend Scout settings saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save Trend Scout settings");
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = async () => {
    if (!confirm("Reset Trend Scout settings to code defaults?")) return;
    setIsSaving(true);
    try {
      const defaults = await resetTrendScout();
      setConfig(defaults as TrendScoutConfig);
      toast.success("Trend Scout settings reset");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to reset Trend Scout settings");
    } finally {
      setIsSaving(false);
    }
  };

  if (saved === undefined) {
    return <div className="rounded-md border border-border p-8 text-center text-sm text-muted-foreground">Loading Trend Scout settings…</div>;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Search className="h-5 w-5 text-muted-foreground" />
                <CardTitle>Trend Scout</CardTitle>
              </div>
              <CardDescription className="mt-2">
                Discovers buyer-intent product topics from search and community sources.
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
            <div className="rounded-md bg-muted p-4">
              <div className="text-muted-foreground">Pipeline stage</div>
              <div className="mt-1 font-medium">1 — Discovery</div>
            </div>
            <div className="rounded-md bg-muted p-4">
              <div className="text-muted-foreground">Persistence</div>
              <div className="mt-1 font-medium">Convex agentSettings</div>
            </div>
            <div className="rounded-md bg-muted p-4">
              <div className="text-muted-foreground">Status</div>
              <div className="mt-1 font-medium">{updatedLabel}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Discovery sources</CardTitle>
          <CardDescription>Enable or disable each topic discovery source.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <SettingSwitch label="Serper / Google" description="Searches Google results through Serper." checked={config.sources.serper} onCheckedChange={(serper) => updateConfig((c) => ({ ...c, sources: { ...c.sources, serper } }))} />
          <SettingSwitch label="Hacker News" description="Optional legacy source; disabled by default for affiliate topics." checked={config.sources.hackerNews} onCheckedChange={(hackerNews) => updateConfig((c) => ({ ...c, sources: { ...c.sources, hackerNews } }))} />
          <SettingSwitch label="Reddit" description="Reads top posts from configured buying/product subreddits." checked={config.sources.reddit} onCheckedChange={(reddit) => updateConfig((c) => ({ ...c, sources: { ...c.sources, reddit } }))} />
          <SettingSwitch label="arXiv" description="Optional legacy research feed; disabled by default for affiliate topics." checked={config.sources.arxiv} onCheckedChange={(arxiv) => updateConfig((c) => ({ ...c, sources: { ...c.sources, arxiv } }))} />
          <SettingSwitch label="Evergreen fallback" description="Allows fallback topics when live sources return nothing." checked={config.sources.fallback} onCheckedChange={(fallback) => updateConfig((c) => ({ ...c, sources: { ...c.sources, fallback } }))} />
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Serper / Google</CardTitle>
            <CardDescription>One query per line. Current runtime uses simple phrases for Serper free-tier compatibility.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Search queries</Label>
              <Textarea rows={6} value={config.serper.queries.join("\n")} onChange={(event) => updateConfig((c) => ({ ...c, serper: { ...c.serper, queries: linesToArray(event.target.value) } }))} />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Results per query</Label>
                <Input type="number" min={1} value={config.serper.resultsPerQuery} onChange={(event) => updateConfig((c) => ({ ...c, serper: { ...c.serper, resultsPerQuery: numberValue(event.target.value, c.serper.resultsPerQuery) } }))} />
              </div>
              <div className="space-y-2">
                <Label>Search recency</Label>
                <Select value={config.serper.recency} onValueChange={(recency: Recency) => updateConfig((c) => ({ ...c, serper: { ...c.serper, recency } }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="qdr:d">Last 24 hours</SelectItem>
                    <SelectItem value="qdr:w">Last week</SelectItem>
                    <SelectItem value="qdr:m">Last month</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Hacker News / legacy source</CardTitle>
            <CardDescription>Optional source for tech-adjacent product trends. Disabled by default.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Search query</Label>
              <Input value={config.hackerNews.query} onChange={(event) => updateConfig((c) => ({ ...c, hackerNews: { ...c.hackerNews, query: event.target.value } }))} />
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2"><Label>Hours back</Label><Input type="number" min={1} value={config.hackerNews.hoursBack} onChange={(event) => updateConfig((c) => ({ ...c, hackerNews: { ...c.hackerNews, hoursBack: numberValue(event.target.value, c.hackerNews.hoursBack) } }))} /></div>
              <div className="space-y-2"><Label>Min points</Label><Input type="number" min={0} value={config.hackerNews.minPoints} onChange={(event) => updateConfig((c) => ({ ...c, hackerNews: { ...c.hackerNews, minPoints: numberValue(event.target.value, c.hackerNews.minPoints) } }))} /></div>
              <div className="space-y-2"><Label>Results/page</Label><Input type="number" min={1} value={config.hackerNews.resultsPerPage} onChange={(event) => updateConfig((c) => ({ ...c, hackerNews: { ...c.hackerNews, resultsPerPage: numberValue(event.target.value, c.hackerNews.resultsPerPage) } }))} /></div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Reddit</CardTitle>
            <CardDescription>One subreddit per line, without the r/ prefix.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Subreddits</Label>
              <Textarea rows={5} value={config.reddit.subreddits.join("\n")} onChange={(event) => updateConfig((c) => ({ ...c, reddit: { ...c.reddit, subreddits: linesToArray(event.target.value) } }))} />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Timeframe</Label>
                <Select value={config.reddit.timeframe} onValueChange={(timeframe: RedditTimeframe) => updateConfig((c) => ({ ...c, reddit: { ...c.reddit, timeframe } }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="day">Day</SelectItem>
                    <SelectItem value="week">Week</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2"><Label>Limit per subreddit</Label><Input type="number" min={1} value={config.reddit.limitPerSubreddit} onChange={(event) => updateConfig((c) => ({ ...c, reddit: { ...c.reddit, limitPerSubreddit: numberValue(event.target.value, c.reddit.limitPerSubreddit) } }))} /></div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Legacy research feed</CardTitle>
            <CardDescription>Optional research feed controls. Affiliate discovery normally keeps this disabled.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2"><Label>Category</Label><Input value={config.arxiv.category} onChange={(event) => updateConfig((c) => ({ ...c, arxiv: { ...c.arxiv, category: event.target.value } }))} /></div>
              <div className="space-y-2"><Label>Max papers</Label><Input type="number" min={1} value={config.arxiv.maxPapers} onChange={(event) => updateConfig((c) => ({ ...c, arxiv: { ...c.arxiv, maxPapers: numberValue(event.target.value, c.arxiv.maxPapers) } }))} /></div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-muted-foreground" /><CardTitle className="text-xl">Scoring</CardTitle></div>
            <CardDescription>Core weights used to rank discovered topic titles.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            {([
              ["majorModelBonus", "Legacy/source bonus"],
              ["launchWordBonus", "Buying-intent bonus"],
              ["freshnessBonus", "Freshness bonus"],
              ["duplicatePenalty", "Duplicate penalty"],
              ["existingTitleSimilarityThreshold", "Existing-title similarity"],
              ["discoveredTopicDedupeThreshold", "Topic dedupe threshold"],
            ] as const).map(([key, label]) => (
              <div className="space-y-2" key={key}>
                <Label>{label}</Label>
                <Input type="number" step={key.includes("Threshold") ? "0.01" : "1"} value={config.scoring[key]} onChange={(event) => updateConfig((c) => ({ ...c, scoring: { ...c.scoring, [key]: numberValue(event.target.value, c.scoring[key]) } }))} />
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2"><Bot className="h-5 w-5 text-muted-foreground" /><CardTitle className="text-xl">Output</CardTitle></div>
            <CardDescription>Caps for ranked live topics and fallback topics.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2"><Label>Max output topics</Label><Input type="number" min={1} value={config.output.maxTopics} onChange={(event) => updateConfig((c) => ({ ...c, output: { ...c.output, maxTopics: numberValue(event.target.value, c.output.maxTopics) } }))} /></div>
            <div className="space-y-2"><Label>Fallback topics</Label><Input type="number" min={1} value={config.output.fallbackTopics} onChange={(event) => updateConfig((c) => ({ ...c, output: { ...c.output, fallbackTopics: numberValue(event.target.value, c.output.fallbackTopics) } }))} /></div>
            <div className="md:col-span-2 rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
              These settings now drive PassivePress buyer-intent discovery. Use product/search phrases rather than AI research queries.
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
