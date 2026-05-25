import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Megaphone, Plus, Save, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

interface AdminAdSlot {
  id: string;
  slot: string;
  name: string;
  code: string;
  isActive: boolean;
  updatedAt: number;
  updatedBy: string | null;
}

interface AdSlotFormState {
  id?: string;
  slot: string;
  name: string;
  code: string;
  isActive: boolean;
}

const adSlotOptions = [
  { value: "home_top", label: "Home top" },
  { value: "post_inline_1", label: "Post inline 1" },
  { value: "post_inline_2", label: "Post inline 2" },
  { value: "home_sidebar", label: "Home sidebar" },
];

const adSlotLabels = Object.fromEntries(adSlotOptions.map((slot) => [slot.value, slot.label]));

const emptyForm: AdSlotFormState = {
  slot: "home_top",
  name: adSlotLabels.home_top,
  code: "",
  isActive: true,
};

const exampleCode = `<!-- BEGIN AADS AD UNIT 2438635 -->
<div id="frame" style="width: 100%;margin: auto;position: relative; z-index: 99998;">
  <iframe data-aa='2438635' src='//acceptable.a-ads.com/2438635/?size=Adaptive&background_color=100f0d&title_color=b8fa1e&title_hover_color=f5f5f5&text_color=ffffff&link_color=b8fa1e&link_hover_color=ffffff' style='border:0; padding:0; width:70%; height:auto; overflow:hidden;display: block;margin: auto'></iframe>
</div>
<!-- END AADS AD UNIT 2438635 -->`;

export function AdsSettings() {
  const slots = useQuery(api.ads.listAdmin, {}) as AdminAdSlot[] | undefined;
  const saveAdSlot = useMutation(api.ads.upsert);
  const deleteAdSlot = useMutation(api.ads.remove);
  const [form, setForm] = useState<AdSlotFormState>(emptyForm);
  const [isSaving, setIsSaving] = useState(false);

  const sortedSlots = useMemo(() => slots ?? [], [slots]);

  useEffect(() => {
    if (!form.id && sortedSlots.length === 0 && !form.code) {
      setForm((current) => ({ ...current, code: exampleCode }));
    }
  }, [form.code, form.id, sortedSlots.length]);

  const startCreate = () => setForm({ ...emptyForm, code: exampleCode });
  const updateSelectedSlot = (slot: string) => {
    setForm((current) => ({
      ...current,
      slot,
      name: !current.name.trim() || adSlotOptions.some((option) => option.label === current.name) ? adSlotLabels[slot] ?? current.name : current.name,
    }));
  };
  const startEdit = (slot: AdminAdSlot) => setForm({ ...slot });

  const handleSave = async () => {
    if (!form.slot.trim()) return toast.error("Slot key is required");
    if (!form.name.trim()) return toast.error("Name is required");
    if (!form.code.trim()) return toast.error("Ad code is required");

    setIsSaving(true);
    try {
      await saveAdSlot({
        slot: form.slot,
        name: form.name,
        code: form.code,
        isActive: form.isActive,
      });
      toast.success("Ad slot saved");
      setForm(emptyForm);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save ad slot");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (slot: AdminAdSlot) => {
    if (!confirm(`Delete ad slot “${slot.slot}”?`)) return;
    try {
      await deleteAdSlot({ id: slot.id as never });
      if (form.id === slot.id) setForm(emptyForm);
      toast.success("Ad slot deleted");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete ad slot");
    }
  };

  if (slots === undefined) {
    return <div className="rounded-md border border-border p-8 text-center text-sm text-muted-foreground">Loading ad slots…</div>;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Megaphone className="h-5 w-5 text-muted-foreground" />
                <CardTitle>Ads</CardTitle>
              </div>
              <CardDescription className="mt-2">
                Manage HTML ad codes by slot. Posts render these slots from markdown ad blocks.
              </CardDescription>
            </div>
            <Button variant="outline" onClick={startCreate}><Plus className="mr-2 h-4 w-4" />New ad slot</Button>
          </div>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Available slot keys are <code>home_top</code>, <code>post_inline_1</code>, <code>post_inline_2</code>, and <code>home_sidebar</code>. Post content can reference inline slots with <code>{'```ad { "slot": "post_inline_1" } ```'}</code>.
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(360px,0.8fr)]">
        <Card>
          <CardHeader><CardTitle className="text-xl">Ad slots</CardTitle><CardDescription>{sortedSlots.length} configured slots</CardDescription></CardHeader>
          <CardContent>
            <div className="overflow-hidden rounded-sm border border-border">
              <table className="w-full text-sm">
                <thead className="bg-muted text-left">
                  <tr>
                    <th className="p-3">Slot</th>
                    <th className="p-3">Name</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">Updated</th>
                    <th className="p-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {sortedSlots.map((slot) => (
                    <tr key={slot.id} className="border-t border-border">
                      <td className="p-3 font-mono text-xs">{slot.slot}</td>
                      <td className="p-3 font-medium">{slot.name}</td>
                      <td className="p-3">
                        <span className={`rounded-sm px-2 py-1 text-xs ${slot.isActive ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground"}`}>
                          {slot.isActive ? "active" : "inactive"}
                        </span>
                      </td>
                      <td className="p-3 text-muted-foreground">{new Date(slot.updatedAt).toLocaleDateString()}</td>
                      <td className="p-3 text-right">
                        <Button size="sm" variant="ghost" onClick={() => startEdit(slot)}>Edit</Button>
                        <Button size="sm" variant="ghost" onClick={() => handleDelete(slot)}><Trash2 className="h-4 w-4" /></Button>
                      </td>
                    </tr>
                  ))}
                  {sortedSlots.length === 0 && (
                    <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">No ad slots yet. Create one to connect a markdown slot to ad code.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-4">
              <div>
                <CardTitle className="text-xl">{form.id ? "Edit ad slot" : "Create ad slot"}</CardTitle>
                <CardDescription>Paste the full provider HTML code for this slot.</CardDescription>
              </div>
              {form.id && <Button size="sm" variant="ghost" onClick={() => setForm(emptyForm)}><X className="h-4 w-4" /></Button>}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Slot key</Label>
              <Select value={form.slot} onValueChange={updateSelectedSlot}>
                <SelectTrigger>
                  <SelectValue placeholder="Select ad slot" />
                </SelectTrigger>
                <SelectContent>
                  {adSlotOptions.map((slot) => (
                    <SelectItem key={slot.value} value={slot.value}>{slot.label} — {slot.value}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Name</Label>
              <Input placeholder="Post inline 1" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} />
            </div>
            <div className="flex items-center justify-between gap-4 rounded-md border border-border p-4">
              <div>
                <Label>Active</Label>
                <p className="mt-1 text-xs text-muted-foreground">Inactive slots render the public placeholder.</p>
              </div>
              <Switch checked={form.isActive} onCheckedChange={(isActive) => setForm((current) => ({ ...current, isActive }))} />
            </div>
            <div className="space-y-2">
              <Label>Ad HTML code</Label>
              <Textarea className="min-h-[280px] font-mono text-xs" value={form.code} onChange={(event) => setForm((current) => ({ ...current, code: event.target.value }))} />
            </div>
            <Button className="w-full" onClick={handleSave} disabled={isSaving}><Save className="mr-2 h-4 w-4" />Save ad slot</Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
