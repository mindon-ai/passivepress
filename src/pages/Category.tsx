import { useParams } from "react-router-dom";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { SEO } from "@/components/SEO";
import { Layout } from "@/components/Layout";
import { PostCard, PostCardData } from "@/components/PostCard";
import NotFound from "./NotFound";

interface Cat { id: string; name: string; slug: string; description: string | null }

const Category = () => {
  const { slug } = useParams<{ slug: string }>();
  const category = useQuery(api.categories.getBySlug, slug ? { slug } : "skip") as Cat | null | undefined;
  const posts = useQuery(api.posts.listPublished, slug ? { categorySlug: slug } : "skip") as PostCardData[] | undefined;
  const loading = slug !== undefined && (category === undefined || posts === undefined);

  if (slug && category === null) return <NotFound />;

  return (
    <Layout>
      {category && (
        <SEO
          title={`${category.name} — AI articles & news | PassivePress`}
          description={category.description || `Latest articles in ${category.name}`}
        />
      )}
      <header className="border-b border-border bg-gradient-hero">
        <div className="container py-16 md:py-20">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">Category</p>
          <h1 className="font-display text-5xl md:text-6xl font-extrabold tracking-tight mb-4">{category?.name}</h1>
          <p className="text-lg text-muted-foreground max-w-2xl">{category?.description}</p>
        </div>
      </header>

      <section className="container py-12">
        {loading ? (
          <p className="text-muted-foreground">Loading…</p>
        ) : (posts?.length ?? 0) === 0 ? (
          <p className="text-muted-foreground">No published articles yet — check back soon.</p>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-10">
            {posts?.map((p) => <PostCard key={p.slug} post={p} />)}
          </div>
        )}
      </section>
    </Layout>
  );
};

export default Category;
