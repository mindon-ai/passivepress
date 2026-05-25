import { Link, Navigate, useNavigate } from "react-router-dom";
import { useClerk, useUser } from "@clerk/react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { SEO } from "@/components/SEO";
import { Layout } from "@/components/Layout";
import { LoadingPage } from "@/components/LoadingPage";
import { AdsSettings } from "@/components/admin/AdsSettings";
import { AffiliateSettings } from "@/components/admin/AffiliateSettings";
import { DataVizSettings } from "@/components/admin/DataVizSettings";
import { ImageGenSettings } from "@/components/admin/ImageGenSettings";
import { MetaAgentSettings } from "@/components/admin/MetaAgentSettings";
import { PublisherSettings } from "@/components/admin/PublisherSettings";
import { ResearcherSettings } from "@/components/admin/ResearcherSettings";
import { SocialMediaSettings } from "@/components/admin/SocialMediaSettings";
import { TopicPickerSettings } from "@/components/admin/TopicPickerSettings";
import { TrendScoutSettings } from "@/components/admin/TrendScoutSettings";
import { WriterSettings } from "@/components/admin/WriterSettings";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Bot, LayoutList, Pencil, Plus, Trash2 } from "lucide-react";

interface AdminPost {
  id: string;
  slug: string;
  title: string;
  status: string;
  published_at: string | null;
  category: { name: string } | null;
}

const agentTabs = [
  { id: "trend-scout", name: "Trend Scout" },
  { id: "topic-picker", name: "Topic Picker" },
  { id: "researcher", name: "Researcher" },
  { id: "image-gen", name: "Image Gen" },
  { id: "data-viz", name: "Data Viz" },
  { id: "writer", name: "Writer" },
  { id: "publisher", name: "Publisher" },
  { id: "affiliate", name: "Affiliate" },
  { id: "social-media", name: "Social Media" },
  { id: "meta-agent", name: "Meta Agent" },
];

const Admin = () => {
  const navigate = useNavigate();
  const { signOut } = useClerk();
  const { isLoaded, isSignedIn, user } = useUser();
  const role = useQuery(api.roles.getMyRole, isSignedIn ? {} : "skip");
  const posts = useQuery(api.posts.listAdmin, role === "admin" ? {} : "skip") as AdminPost[] | undefined;
  const deletePost = useMutation(api.posts.remove);
  const isAdmin = role === "admin";

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this post permanently?")) return;
    try {
      await deletePost({ id: id as never });
      toast.success("Post deleted");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete post");
    }
  };

  // Merge both loading guards (isLoaded + role) into a single early return
  if (!isLoaded || role === undefined) return <LoadingPage />;
  if (!isSignedIn) return <Navigate to="/auth" replace />;

  if (!isAdmin) {
    return (
      <Layout>
        <div className="container max-w-2xl py-20">
          <h1 className="font-display text-3xl font-bold mb-4">Admin access required</h1>
          <p className="text-muted-foreground mb-2">
            Your Clerk account is signed in, but the backend admin role check did not grant access.
          </p>
          <p className="text-sm text-muted-foreground mb-2">
            Signed in as <span className="font-medium text-foreground">{user?.primaryEmailAddress?.emailAddress ?? "Unknown user"}</span>
          </p>
          <p className="text-sm text-muted-foreground mb-6">
            This usually means the configured backend admin email does not match, or admin auth is not configured in the current Convex deployment.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button onClick={handleSignOut} variant="outline">Sign out</Button>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <SEO title="Admin — PassivePress" description="Editor dashboard" />
      <div className="container py-12">
        {/* Page header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="font-display text-4xl font-extrabold">Editor Dashboard</h1>
            <p className="text-muted-foreground mt-1">Manage posts and publishing.</p>
          </div>
          <Button variant="outline" onClick={handleSignOut}>Sign out</Button>
        </div>

        <Tabs defaultValue="posts" className="space-y-6">
          <TabsList>
            <TabsTrigger value="posts">Posts</TabsTrigger>
            <TabsTrigger value="ads">Ads</TabsTrigger>
            <TabsTrigger value="agents">Agents</TabsTrigger>
          </TabsList>

          <TabsContent value="posts" className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <LayoutList className="w-4 h-4" />
                <span>{posts?.length ?? 0} posts total</span>
              </div>
              <Link to="/admin/new"><Button size="sm"><Plus className="w-4 h-4 mr-2" />New Post</Button></Link>
            </div>

            <div className="border border-border rounded-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted text-left">
                  <tr>
                    <th className="p-3">Title</th>
                    <th className="p-3">Category</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">Published</th>
                    <th className="p-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {(posts ?? []).map((p) => (
                    <tr key={p.id} className="border-t border-border">
                      <td className="p-3 font-medium">{p.title}</td>
                      <td className="p-3 text-muted-foreground">{p.category?.name || "—"}</td>
                      <td className="p-3">
                        <span className={`text-xs px-2 py-1 rounded-sm ${p.status === "published" ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground"}`}>
                          {p.status}
                        </span>
                      </td>
                      <td className="p-3 text-muted-foreground">{p.published_at ? new Date(p.published_at).toLocaleDateString() : "—"}</td>
                      <td className="p-3 text-right">
                        <Link to={`/admin/edit/${p.id}`}><Button size="sm" variant="ghost"><Pencil className="w-4 h-4" /></Button></Link>
                        <Button size="sm" variant="ghost" onClick={() => handleDelete(p.id)}><Trash2 className="w-4 h-4" /></Button>
                      </td>
                    </tr>
                  ))}
                  {(posts?.length ?? 0) === 0 && (
                    <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">No posts yet. Create your first one.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </TabsContent>

          <TabsContent value="ads">
            <AdsSettings />
          </TabsContent>

          <TabsContent value="agents">
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Bot className="w-5 h-5 text-muted-foreground" />
                  <CardTitle>Agents</CardTitle>
                </div>
                <CardDescription>Agent settings controls will be added here.</CardDescription>
              </CardHeader>
              <CardContent>
                <Tabs defaultValue={agentTabs[0].id} className="space-y-6">
                  <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1">
                    {agentTabs.map((agent) => (
                      <TabsTrigger key={agent.id} value={agent.id}>
                        {agent.name}
                      </TabsTrigger>
                    ))}
                  </TabsList>

                  {agentTabs.map((agent) => (
                    <TabsContent key={agent.id} value={agent.id}>
                      {agent.id === "trend-scout" ? (
                        <TrendScoutSettings />
                      ) : agent.id === "topic-picker" ? (
                        <TopicPickerSettings />
                      ) : agent.id === "researcher" ? (
                        <ResearcherSettings />
                      ) : agent.id === "image-gen" ? (
                        <ImageGenSettings />
                      ) : agent.id === "data-viz" ? (
                        <DataVizSettings />
                      ) : agent.id === "writer" ? (
                        <WriterSettings />
                      ) : agent.id === "publisher" ? (
                        <PublisherSettings />
                      ) : agent.id === "affiliate" ? (
                        <AffiliateSettings />
                      ) : agent.id === "social-media" ? (
                        <SocialMediaSettings />
                      ) : agent.id === "meta-agent" ? (
                        <MetaAgentSettings />
                      ) : (
                        <div className="rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                          {agent.name} settings will appear here.
                        </div>
                      )}
                    </TabsContent>
                  ))}
                </Tabs>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
};

export default Admin;
