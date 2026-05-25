import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { RotateCcw, Save, ShoppingCart } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const affiliateDefaults = {
  associateTag: "yourstore-20",
  region: "us-east-1",
  marketplace: "www.amazon.com",
  cacheTtlHours: 24,
};

type AffiliateSettingsConfig = typeof affiliateDefaults;

function numberValue(value: string, fallback: number) {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

export function AffiliateSettings() {
  const saved = useQuery(api.affiliateSettings.getAmazonPublicSettings, {}) as AffiliateSettingsConfig | undefined;
  const updateSettings = useMutation(api.affiliateSettings.updateAmazonPublicSettings);
  const resetSettings = useMutation(api.affiliateSettings.resetAmazonPublicSettings);
  const [config, setConfig] = useState<AffiliateSettingsConfig>(affiliateDefaults);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (saved) setConfig(saved);
  }, [saved]);

  const status = useMemo(() => saved ? "Loaded from Convex agentSettings" : "Using code defaults", [saved]);

  const save = async () => {
    setIsSaving(true);
    try {
      await updateSettings({ config });
      toast.success("Affiliate settings saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save affiliate settings");
    } finally {
      setIsSaving(false);
    }
  };

  const reset = async () => {
    if (!confirm("Reset affiliate settings to defaults?")) return;
    setIsSaving(true);
    try {
      const defaults = await resetSettings() as AffiliateSettingsConfig;
      setConfig(defaults);
      toast.success("Affiliate settings reset");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to reset affiliate settings");
    } finally {
      setIsSaving(false);
    }
  };

  if (saved === undefined) {
    return <div className="rounded-md border border-border p-8 text-center text-sm text-muted-foreground">Loading affiliate settings…</div>;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <ShoppingCart className="h-5 w-5 text-muted-foreground" />
                <CardTitle>Affiliate / Amazon</CardTitle>
              </div>
              <CardDescription className="mt-2">
                Public affiliate runtime settings. API keys remain environment-only and are never stored here.
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={reset} disabled={isSaving}><RotateCcw className="mr-2 h-4 w-4" />Reset</Button>
              <Button onClick={save} disabled={isSaving}><Save className="mr-2 h-4 w-4" />Save settings</Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2 rounded-md bg-muted p-4 text-sm">
            <div className="text-muted-foreground">Status</div>
            <div className="mt-1 font-medium">{status}</div>
          </div>
          <div className="space-y-2">
            <Label>Amazon associate tag</Label>
            <Input value={config.associateTag} onChange={(event) => setConfig((c) => ({ ...c, associateTag: event.target.value }))} />
          </div>
          <div className="space-y-2">
            <Label>PA API region</Label>
            <Input value={config.region} onChange={(event) => setConfig((c) => ({ ...c, region: event.target.value }))} />
          </div>
          <div className="space-y-2">
            <Label>Marketplace</Label>
            <Input value={config.marketplace} onChange={(event) => setConfig((c) => ({ ...c, marketplace: event.target.value }))} />
          </div>
          <div className="space-y-2">
            <Label>Product cache TTL hours</Label>
            <Input type="number" min={1} value={config.cacheTtlHours} onChange={(event) => setConfig((c) => ({ ...c, cacheTtlHours: numberValue(event.target.value, c.cacheTtlHours) }))} />
          </div>
          <div className="md:col-span-2 rounded-md border border-dashed border-border p-4 text-xs text-muted-foreground">
            Required secret environment variables: AMAZON_ACCESS_KEY, AMAZON_SECRET_KEY, AMAZON_ASSOCIATE_TAG, AMAZON_REGION. Do not paste secrets into this UI.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
