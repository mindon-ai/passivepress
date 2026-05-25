import { useEffect, useState } from "react";
import { useNavigate, useParams, Navigate } from "react-router-dom";
import { useMutation, useQuery } from "convex/react";
import { useUser } from "@clerk/react";
import { api } from "../../convex/_generated/api";
import { SEO } from "@/components/SEO";
import { Layout } from "@/components/Layout";
import { LoadingPage } from "@/components/LoadingPage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

import { toSlug } from "@/lib/slug";

const PostEditor = () => {
  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const { isLoaded, isSignedIn } = useUser();
  const role = useQuery(api.roles.getMyRole, isSignedIn ? {} : "skip");
  const isAdmin = role === "admin";
  const categories = useQuery(api.categories.listAll, isAdmin ? {} : "skip") as { id: string; name: string }[] | undefined;
  const post = useQuery(api.posts.getById, id && isAdmin ? { id: id as never } : "skip");
  const upsertPost = useMutation(api.posts.upsert);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    title: "", slug: "", excerpt: "", content: "", featured_image: "", featured_image_storage_id: "", featured_image_alt: "",
    meta_title: "", meta_description: "", keywords: "", category_id: "", author_name: "", status: "draft", reading_time: 5,
  });

  useEffect(() => {
    if (isLoaded && isSignedIn && role === null) {
      navigate("/admin");
    }
  }, [isLoaded, isSignedIn, navigate, role]);

  useEffect(() => {
    if (!post) return;
    setForm({
      title: post.title || "", slug: post.slug || "", excerpt: post.excerpt || "",
      content: post.content || "", featured_image: post.featured_image || "",
      featured_image_storage_id: post.featured_image_storage_id || "",
      featured_image_alt: post.featured_image_alt || "", meta_title: post.meta_title || "",
      meta_description: post.meta_description || "", keywords: (post.keywords || []).join(", "),
      category_id: post.category_id || "", author_name: post.author_name || "",
      status: post.status || "draft", reading_time: post.reading_time || 5,
    });
  }, [post]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await upsertPost({
        id: id ? (id as never) : undefined,
        title: form.title,
        slug: form.slug || toSlug(form.title),
        excerpt: form.excerpt || null,
        content: form.content,
        featured_image: form.featured_image || null,
        featured_image_storage_id: form.featured_image_storage_id || null,
        featured_image_alt: form.featured_image_alt || null,
        meta_title: form.meta_title || form.title,
        meta_description: form.meta_description || form.excerpt || null,
        keywords: form.keywords ? form.keywords.split(",").map((k) => k.trim()).filter(Boolean) : null,
        category_id: form.category_id ? (form.category_id as never) : null,
        author_name: form.author_name || "PassivePress Editorial",
        status: form.status as "draft" | "published",
        reading_time: Number(form.reading_time) || 5,
      });
      toast.success(id ? "Post updated" : "Post created");
      navigate("/admin");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save post");
    } finally {
      setSaving(false);
    }
  };

  if (!isLoaded || role === undefined) {
    return <LoadingPage />;
  }

  if (!isSignedIn) {
    return <Navigate to="/auth" replace />;
  }

  if (!isAdmin) {
    return (
      <Layout>
        <div className="container py-20 text-center">
          <p className="text-muted-foreground">You do not have admin access.</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <SEO title={id ? "Edit post" : "New post"} description="Editor" />
      <div className="container max-w-4xl py-12">
        <h1 className="font-display text-4xl font-extrabold mb-8">{id ? "Edit Post" : "New Post"}</h1>
        <div className="space-y-4">
          {isAdmin && ((categories === undefined) || (id && post === undefined)) && (
            <p className="text-muted-foreground">Loading editor…</p>
          )}
          <div>
            <Label>Title</Label>
            <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value, slug: form.slug || toSlug(e.target.value) })} />
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <Label>Slug</Label>
              <Input value={form.slug} onChange={(e) => setForm({ ...form, slug: toSlug(e.target.value) })} />
            </div>
            <div>
              <Label>Category</Label>
              <select className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm" value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })}>
                <option value="">— Select —</option>
                {(categories ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>
          <div>
            <Label>Excerpt</Label>
            <Textarea rows={2} value={form.excerpt} onChange={(e) => setForm({ ...form, excerpt: e.target.value })} />
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <Label>Featured image URL</Label>
              <Input value={form.featured_image} onChange={(e) => setForm({ ...form, featured_image: e.target.value })} placeholder="https://your-deployment.convex.cloud/api/storage/..." />
              <p className="mt-1 text-xs text-muted-foreground">Use the Convex storage URL for generated images, or a full external image URL.</p>
            </div>
            <div>
              <Label>Featured image storage ID</Label>
              <Input value={form.featured_image_storage_id} onChange={(e) => setForm({ ...form, featured_image_storage_id: e.target.value })} placeholder="Optional Convex _storage document ID" />
              <p className="mt-1 text-xs text-muted-foreground">Keep this when the image lives in Convex storage so the app can resolve a fresh URL.</p>
            </div>
          </div>
          <div>
            <Label>Featured image ALT</Label>
            <Input value={form.featured_image_alt} onChange={(e) => setForm({ ...form, featured_image_alt: e.target.value })} />
          </div>
          <div>
            <Label>Content (Markdown)</Label>
            <Textarea rows={20} value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} className="font-mono text-sm" />
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <Label>SEO Meta Title</Label>
              <Input value={form.meta_title} onChange={(e) => setForm({ ...form, meta_title: e.target.value })} />
            </div>
            <div>
              <Label>SEO Meta Description</Label>
              <Input value={form.meta_description} onChange={(e) => setForm({ ...form, meta_description: e.target.value })} />
            </div>
          </div>
          <div>
            <Label>Keywords (comma separated)</Label>
            <Input value={form.keywords} onChange={(e) => setForm({ ...form, keywords: e.target.value })} />
          </div>
          <div className="grid md:grid-cols-3 gap-4">
            <div>
              <Label>Author name</Label>
              <Input value={form.author_name} onChange={(e) => setForm({ ...form, author_name: e.target.value })} />
            </div>
            <div>
              <Label>Reading time (min)</Label>
              <Input type="number" value={form.reading_time} onChange={(e) => setForm({ ...form, reading_time: Number(e.target.value) })} />
            </div>
            <div>
              <Label>Status</Label>
              <select className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                <option value="draft">Draft</option>
                <option value="published">Published</option>
              </select>
            </div>
          </div>
          <div className="flex gap-2 pt-4">
            <Button onClick={handleSave} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
            <Button variant="outline" onClick={() => navigate("/admin")}>Cancel</Button>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default PostEditor;
