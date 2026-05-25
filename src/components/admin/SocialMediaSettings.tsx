import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Megaphone, RotateCcw, Save } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

const socialMediaDefaults = {
  runtime: {
    enabled: true,
    dryRun: false,
    force: false,
    retryFailed: false,
    failManualProcessOnAllFailed: true,
  },
  platforms: {
    x: true,
  },
  copy: {
    maxTextChars: 280,
    hashtagCount: 3,
    requiredFirstHashtag: "PassivePress",
    includeArticlePayload: true,
    includeDryRunFlag: true,
    customInstruction: "",
  },
  campaign: {
    copyVersion: "social-x-playwright-v1",
    skipIfExistingSuccess: true,
    createCampaignInDryRun: true,
  },
  alerts: {
    telegramOnAutoFailure: true,
  },
  logging: {
    writeSocialLog: true,
  },
};

type SocialMediaConfig = typeof socialMediaDefaults;

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

export function SocialMediaSettings() {
  const saved = useQuery(api.agentSettings.getSocialMedia, {});
  const saveSocialMedia = useMutation(api.agentSettings.updateSocialMedia);
  const resetSocialMedia = useMutation(api.agentSettings.resetSocialMedia);
  const [config, setConfig] = useState<SocialMediaConfig>(socialMediaDefaults);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (saved?.config) setConfig(saved.config as SocialMediaConfig);
  }, [saved]);

  const updatedLabel = useMemo(() => {
    if (!saved?.updatedAt) return "Using code defaults";
    return `Last saved ${new Date(saved.updatedAt).toLocaleString()}`;
  }, [saved?.updatedAt]);

  const updateConfig = (updater: (current: SocialMediaConfig) => SocialMediaConfig) => setConfig((current) => updater(current));

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await saveSocialMedia({ config });
      toast.success("Social Media settings saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save Social Media settings");
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = async () => {
    if (!confirm("Reset Social Media settings to code defaults?")) return;
    setIsSaving(true);
    try {
      const defaults = await resetSocialMedia();
      setConfig(defaults as SocialMediaConfig);
      toast.success("Social Media settings reset");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to reset Social Media settings");
    } finally {
      setIsSaving(false);
    }
  };

  if (saved === undefined) {
    return <div className="rounded-md border border-border p-8 text-center text-sm text-muted-foreground">Loading Social Media settings…</div>;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Megaphone className="h-5 w-5 text-muted-foreground" />
                <CardTitle>Social Media</CardTitle>
              </div>
              <CardDescription className="mt-2">Generates X copy and publishes using the Playwright-backed social runtime.</CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={handleReset} disabled={isSaving}><RotateCcw className="mr-2 h-4 w-4" />Reset</Button>
              <Button onClick={handleSave} disabled={isSaving}><Save className="mr-2 h-4 w-4" />Save settings</Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 text-sm md:grid-cols-3">
            <div className="rounded-md bg-muted p-4"><div className="text-muted-foreground">Pipeline stage</div><div className="mt-1 font-medium">8 — Social distribution</div></div>
            <div className="rounded-md bg-muted p-4"><div className="text-muted-foreground">Runtime</div><div className="mt-1 font-medium">X-only Playwright</div></div>
            <div className="rounded-md bg-muted p-4"><div className="text-muted-foreground">Status</div><div className="mt-1 font-medium">{updatedLabel}</div></div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-xl">Runtime</CardTitle><CardDescription>Controls run mode and retry behavior.</CardDescription></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          <SettingSwitch label="Enabled" description="Allow social media agent to run." checked={config.runtime.enabled} onCheckedChange={(enabled) => updateConfig((c) => ({ ...c, runtime: { ...c.runtime, enabled } }))} />
          <SettingSwitch label="Dry run" description="Generate/capture attempts without live post." checked={config.runtime.dryRun} onCheckedChange={(dryRun) => updateConfig((c) => ({ ...c, runtime: { ...c.runtime, dryRun } }))} />
          <SettingSwitch label="Force repost" description="Ignore existing successful social post." checked={config.runtime.force} onCheckedChange={(force) => updateConfig((c) => ({ ...c, runtime: { ...c.runtime, force } }))} />
          <SettingSwitch label="Retry failed" description="Only retry previously failed platforms." checked={config.runtime.retryFailed} onCheckedChange={(retryFailed) => updateConfig((c) => ({ ...c, runtime: { ...c.runtime, retryFailed } }))} />
          <SettingSwitch label="Fail manual on all failed" description="Exit non-zero for manual all-failed runs." checked={config.runtime.failManualProcessOnAllFailed} onCheckedChange={(failManualProcessOnAllFailed) => updateConfig((c) => ({ ...c, runtime: { ...c.runtime, failManualProcessOnAllFailed } }))} />
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-xl">Platforms</CardTitle><CardDescription>Currently only X is implemented.</CardDescription></CardHeader>
          <CardContent className="grid gap-3">
            <SettingSwitch label="X" description="Enable X/Twitter publishing." checked={config.platforms.x} onCheckedChange={(x) => updateConfig((c) => ({ ...c, platforms: { ...c.platforms, x } }))} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-xl">Copy rules</CardTitle><CardDescription>Controls X post body and hashtag requirements.</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              <NumberField label="Max text chars" min={1} value={config.copy.maxTextChars} onChange={(maxTextChars) => updateConfig((c) => ({ ...c, copy: { ...c.copy, maxTextChars } }))} />
              <NumberField label="Hashtag count" min={0} value={config.copy.hashtagCount} onChange={(hashtagCount) => updateConfig((c) => ({ ...c, copy: { ...c.copy, hashtagCount } }))} />
              <div className="space-y-2"><Label>First hashtag</Label><Input value={config.copy.requiredFirstHashtag} onChange={(event) => updateConfig((c) => ({ ...c, copy: { ...c.copy, requiredFirstHashtag: event.target.value } }))} /></div>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <SettingSwitch label="Include article payload" description="Send article data to copy agent." checked={config.copy.includeArticlePayload} onCheckedChange={(includeArticlePayload) => updateConfig((c) => ({ ...c, copy: { ...c.copy, includeArticlePayload } }))} />
              <SettingSwitch label="Include dry-run flag" description="Include dryRun in copy payload." checked={config.copy.includeDryRunFlag} onCheckedChange={(includeDryRunFlag) => updateConfig((c) => ({ ...c, copy: { ...c.copy, includeDryRunFlag } }))} />
            </div>
            <div className="space-y-2"><Label>Custom social instruction</Label><Textarea rows={5} value={config.copy.customInstruction} onChange={(event) => updateConfig((c) => ({ ...c, copy: { ...c.copy, customInstruction: event.target.value } }))} /></div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-xl">Campaign</CardTitle><CardDescription>Controls campaign metadata and duplicate handling.</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2"><Label>Copy version</Label><Input value={config.campaign.copyVersion} onChange={(event) => updateConfig((c) => ({ ...c, campaign: { ...c.campaign, copyVersion: event.target.value } }))} /></div>
            <div className="grid gap-3 md:grid-cols-2">
              <SettingSwitch label="Skip existing success" description="Skip platform if post already succeeded." checked={config.campaign.skipIfExistingSuccess} onCheckedChange={(skipIfExistingSuccess) => updateConfig((c) => ({ ...c, campaign: { ...c.campaign, skipIfExistingSuccess } }))} />
              <SettingSwitch label="Campaign in dry run" description="Keep creating campaign rows in dry run." checked={config.campaign.createCampaignInDryRun} onCheckedChange={(createCampaignInDryRun) => updateConfig((c) => ({ ...c, campaign: { ...c.campaign, createCampaignInDryRun } }))} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-xl">Alerts & logs</CardTitle><CardDescription>Controls Telegram alerts and social run logs.</CardDescription></CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            <SettingSwitch label="Telegram auto failure" description="Send Telegram alert on auto failures." checked={config.alerts.telegramOnAutoFailure} onCheckedChange={(telegramOnAutoFailure) => updateConfig((c) => ({ ...c, alerts: { ...c.alerts, telegramOnAutoFailure } }))} />
            <SettingSwitch label="Write social log" description="Write agents/logs/*-social.json." checked={config.logging.writeSocialLog} onCheckedChange={(writeSocialLog) => updateConfig((c) => ({ ...c, logging: { ...c.logging, writeSocialLog } }))} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
