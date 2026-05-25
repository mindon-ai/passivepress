import { Link } from "react-router-dom";
import { format } from "date-fns";
import { normalizeImageUrl } from "@/lib/image";

export interface PostCardData {
  slug: string;
  title: string;
  excerpt: string | null;
  featured_image: string | null;
  featured_image_alt: string | null;
  published_at: string | null;
  reading_time: number | null;
  category?: { name: string; slug: string } | null;
}

export const PostCard = ({ post, variant = "default" }: { post: PostCardData; variant?: "default" | "feature" | "compact" }) => {
  const featuredImage = normalizeImageUrl(post.featured_image);

  if (variant === "feature") {
    return (
      <Link to={`/${post.slug}`} className="group grid md:grid-cols-2 gap-8 items-center">
        <div className="aspect-[4/3] overflow-hidden rounded-sm bg-muted">
          {featuredImage && (
            <img
              src={featuredImage}
              alt={post.featured_image_alt || post.title}
              loading="eager"
              width={1600}
              height={900}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
            />
          )}
        </div>
        <div>
          {post.category && (
            <span className="inline-block text-xs font-semibold uppercase tracking-widest text-accent-foreground bg-accent px-2 py-1 mb-4">
              {post.category.name}
            </span>
          )}
          <h2 className="font-display text-4xl md:text-5xl font-bold leading-[1.05] text-balance mb-4 group-hover:text-accent transition-colors">
            {post.title}
          </h2>
          <p className="text-lg text-muted-foreground leading-relaxed mb-4 line-clamp-3">{post.excerpt}</p>
          <p className="text-xs text-muted-foreground uppercase tracking-wider">
            {post.published_at && format(new Date(post.published_at), "MMM d, yyyy")} · {post.reading_time ?? 5} min read
          </p>
        </div>
      </Link>
    );
  }

  if (variant === "compact") {
    return (
      <Link to={`/${post.slug}`} className="group flex gap-5 py-6 border-b border-border/60 last:border-0 items-center">
        {featuredImage && (
          <div className="relative w-24 h-24 md:w-32 md:h-32 flex-shrink-0 overflow-hidden rounded-sm bg-muted shadow-sm">
            <img
              src={featuredImage}
              alt={post.featured_image_alt || post.title}
              loading="lazy"
              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
            />
            <div className="absolute inset-0 bg-black/5 group-hover:bg-transparent transition-colors" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          {post.category && (
            <span className="text-[10px] font-mono font-medium uppercase tracking-[0.15em] text-accent-foreground mb-1 block">
              {post.category.name}
            </span>
          )}
          <h3 className="font-display text-xl md:text-2xl font-semibold leading-snug group-hover:text-accent transition-colors line-clamp-2">
            {post.title}
          </h3>
          <div className="flex items-center gap-3 mt-2 text-[10px] md:text-xs text-muted-foreground font-medium uppercase tracking-wider">
            <span>{post.published_at && format(new Date(post.published_at), "MMM d, yyyy")}</span>
            <span className="w-1 h-1 bg-muted-foreground/30 rounded-full" />
            <span>{post.reading_time ?? 5} min read</span>
          </div>
        </div>
      </Link>
    );
  }

  return (
    <Link to={`/${post.slug}`} className="group block">
      <div className="aspect-[16/10] overflow-hidden rounded-sm bg-muted mb-4">
        {featuredImage && (
          <img
            src={featuredImage}
            alt={post.featured_image_alt || post.title}
            loading="lazy"
            width={1600}
            height={1000}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
        )}
      </div>
      {post.category && (
        <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">{post.category.name}</span>
      )}
      <h3 className="font-display text-2xl font-semibold leading-tight mt-1 mb-2 text-balance group-hover:text-accent transition-colors">
        {post.title}
      </h3>
      <p className="text-sm text-muted-foreground line-clamp-2 mb-2">{post.excerpt}</p>
      <p className="text-xs text-muted-foreground uppercase tracking-wider">
        {post.published_at && format(new Date(post.published_at), "MMM d, yyyy")} · {post.reading_time ?? 5} min read
      </p>
    </Link>
  );
};
