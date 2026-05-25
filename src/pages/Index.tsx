import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import gsap from "gsap";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { SEO } from "@/components/SEO";
import { Layout } from "@/components/Layout";
import { PostCard, PostCardData } from "@/components/PostCard";
import { AdSlot } from "@/components/AdSlot";
import { normalizeImageUrl } from "@/lib/image";
import { Loader2 } from "lucide-react";

interface Category {
  slug: string;
  name: string;
  description: string | null;
}

// Computed once at module load — avoids `new Date()` on every render
const TODAY_LABEL = new Date().toLocaleDateString("en-US", {
  month: "long",
  day: "numeric",
  year: "numeric",
});

const HERO_NOISE_WORDS = ["hype", "clutter", "guesswork", "sponsored noise", "regret", "fog"];

const Index = () => {
  const heroRef = useRef<HTMLElement>(null);
  const posts = useQuery(api.posts.listPublished, { limit: 13 }) as
    | PostCardData[]
    | undefined;
  const categories = useQuery(api.categories.listAll, {}) as
    | Category[]
    | undefined;
  const subscribe = useMutation(api.newsletter.subscribe);

  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubscribe = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await subscribe({ email });
      setSubmitted(true);
      setEmail("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const safePosts = posts ?? [];
  const safeCategories = categories ?? [];
  const loading = posts === undefined || categories === undefined;

  useEffect(() => {
    if (loading || !heroRef.current) return;
    const ctx = gsap.context(() => {
      gsap.from("[data-hero-meta]", {
        y: 20,
        opacity: 0,
        duration: 0.6,
        ease: "power3.out",
      });
      gsap.from("[data-hero-title-line]", {
        y: 60,
        opacity: 0,
        duration: 0.9,
        ease: "power4.out",
        stagger: 0.12,
        delay: 0.1,
      });
      gsap.from("[data-hero-sub]", {
        y: 20,
        opacity: 0,
        duration: 0.7,
        ease: "power3.out",
        delay: 0.5,
      });
      gsap.from("[data-hero-cta]", {
        y: 20,
        opacity: 0,
        duration: 0.6,
        ease: "power3.out",
        delay: 0.7,
        stagger: 0.08,
      });
      gsap.from("[data-hero-feature]", {
        y: 40,
        opacity: 0,
        duration: 1,
        ease: "power4.out",
        delay: 0.4,
      });

      gsap.to("[data-hero-live-dot]", {
        scale: 1.45,
        opacity: 0.45,
        duration: 0.9,
        ease: "sine.inOut",
        repeat: -1,
        yoyo: true,
      });

      const noiseWord = heroRef.current?.querySelector<HTMLElement>(
        "[data-hero-noise-word]",
      );
      if (noiseWord) {
        let index = 0;
        noiseWord.textContent = HERO_NOISE_WORDS[0];

        gsap.set(noiseWord, {
          display: "inline-block",
          willChange: "transform, opacity, filter",
          transformOrigin: "50% 55%",
        });

        const switchNoiseWord = () => {
          gsap
            .timeline({
              onComplete: () => gsap.delayedCall(2.1, switchNoiseWord),
            })
            .to(noiseWord, {
              x: 18,
              scale: 0.985,
              opacity: 0,
              filter: "blur(8px)",
              duration: 0.34,
              ease: "power2.in",
              onComplete: () => {
                index = (index + 1) % HERO_NOISE_WORDS.length;
                noiseWord.textContent = HERO_NOISE_WORDS[index];
              },
            })
            .fromTo(
              noiseWord,
              {
                x: -18,
                scale: 1.015,
                opacity: 0,
                filter: "blur(8px)",
              },
              {
                x: 0,
                scale: 1,
                opacity: 1,
                filter: "blur(0px)",
                duration: 0.56,
                ease: "power4.out",
              },
            );
        };

        gsap.delayedCall(3, switchNoiseWord);
      }
    }, heroRef);
    return () => ctx.revert();
  }, [loading]);

  const [feature, ...rest] = safePosts;
  const featureImage = normalizeImageUrl(feature?.featured_image);
  const grid = rest.slice(0, 6);
  const more = rest.slice(6);

  return (
    <Layout>
      <SEO
        title="PassivePress — Buying Guides, Reviews & Product Comparisons"
        description="Practical product research, comparison guides, and review roundups for tech, home, kitchen, fitness, and outdoor gear."
        keywords={[
          "buying guides",
          "product reviews",
          "best products",
          "Amazon affiliate reviews",
          "tech gear",
          "home appliances",
          "fitness gear",
          "kitchen gear",
        ]}
        jsonLd={{
          "@context": "https://schema.org",
          "@type": "Blog",
          name: "PassivePress",
          description: "Buying Guides, Reviews & Product Comparisons",
          url: typeof window !== "undefined" ? window.location.origin : "",
        }}
      />

      {/* Hero — simple editorial */}
      <section
        ref={heroRef}
        className="relative border-b border-border overflow-hidden bg-background isolate"
      >
        {/* Layered pro background */}
        <div className="absolute inset-0 -z-10 bg-gradient-hero" />
        <div className="absolute inset-0 -z-10 bg-grid-fine mask-fade-b opacity-70" />
        <div
          aria-hidden
          className="absolute -top-40 -left-32 -z-10 w-[42rem] h-[42rem] rounded-full blur-3xl opacity-40"
          style={{
            background:
              "radial-gradient(closest-side, hsl(var(--accent) / 0.55), transparent 70%)",
          }}
        />
        <div
          aria-hidden
          className="absolute -bottom-48 right-[-8rem] -z-10 w-[36rem] h-[36rem] rounded-full blur-3xl opacity-30"
          style={{
            background:
              "radial-gradient(closest-side, hsl(var(--highlight) / 0.55), transparent 70%)",
          }}
        />
        <div
          aria-hidden
          className="absolute inset-x-0 top-0 -z-10 h-px bg-gradient-to-r from-transparent via-foreground/20 to-transparent"
        />
        <div
          aria-hidden
          className="absolute inset-0 -z-10 bg-noise opacity-[0.35] mix-blend-overlay pointer-events-none"
        />

        <div className="container py-16 md:py-24">
          <div
            data-hero-meta
            className="flex items-center gap-3 mb-10 text-xs font-mono uppercase tracking-[0.25em] text-muted-foreground"
          >
            <span className="flex items-center gap-2 text-foreground">
              <span
                data-hero-live-dot
                className="w-1.5 h-1.5 bg-accent rounded-full"
              />{" "}
              Live
            </span>
            <span>·</span>
            <span>{TODAY_LABEL}</span>
            <span className="hidden md:inline">·</span>
            <span className="hidden md:inline">Vol. 01 / Issue 06</span>
          </div>

          <div className="grid lg:grid-cols-12 gap-12 lg:gap-16 items-end">
            <div className="lg:col-span-7">
              <h1
                data-hero-title
                className="font-display font-bold leading-[0.95] tracking-tight text-balance text-[clamp(2.75rem,7vw,5.5rem)]"
              >
                <span data-hero-title-line className="block">
                  The signal,
                </span>
                <span
                  data-hero-title-line
                  className="block italic font-normal text-muted-foreground"
                >
                  not the{" "}
                  <span className="inline-flex min-w-[3.8em] overflow-visible align-baseline leading-[1.15] pb-[0.08em]">
                    <span data-hero-noise-word>{HERO_NOISE_WORDS[0]}</span>
                  </span>
                </span>
              </h1>
              <p
                data-hero-sub
                className="text-lg md:text-xl text-muted-foreground max-w-xl mt-8 leading-relaxed"
              >
                Practical product research for people who want the right gear without reading twenty tabs first. We compare picks, prices, trade-offs, and real-world use cases.
              </p>
              <div className="flex flex-wrap gap-3 mt-10">
                <Link
                  data-hero-cta
                  to={feature ? `/${feature.slug}` : "/category/tech"}
                  className="group inline-flex items-center gap-2 px-6 py-3 bg-foreground text-background font-medium hover:bg-accent hover:text-accent-foreground transition-colors"
                >
                  Today's top guide
                  <span className="transition-transform group-hover:translate-x-1">
                    →
                  </span>
                </Link>
                <Link
                  data-hero-cta
                  to="/category/tech"
                  className="inline-flex items-center px-6 py-3 border border-border font-medium hover:border-foreground transition-colors"
                >
                  Browse archive
                </Link>
              </div>
            </div>

            {/* Lead story */}
            <div className="lg:col-span-5">
              {feature && (
                <Link
                  data-hero-feature
                  to={`/${feature.slug}`}
                  className="group block"
                >
                  {featureImage && (
                    <div className="relative aspect-[4/3] overflow-hidden bg-muted mb-5">
                      <img
                        src={featureImage}
                        alt={feature.featured_image_alt || feature.title}
                        loading="eager"
                        fetchpriority="high"
                        className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-[1.03]"
                      />
                    </div>
                  )}
                  <div className="flex items-center gap-3 text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-3">
                    <span className="text-accent-foreground bg-accent px-2 py-0.5">
                      Lead
                    </span>
                    {feature.category && <span>{feature.category.name}</span>}
                    <span>·</span>
                    <span>{feature.reading_time ?? 5} min</span>
                  </div>
                  <h2 className="font-display text-xl md:text-2xl font-semibold leading-snug group-hover:text-muted-foreground transition-colors">
                    {feature.title}
                  </h2>
                </Link>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Categories strip */}
      <section className="border-b border-border bg-secondary/30">
        <div className="container py-8">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-4">
            Browse by topic
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {safeCategories.map((c) => (
              <Link
                key={c.slug}
                to={`/category/${c.slug}`}
                className="group block p-4 bg-card border border-border rounded-sm hover:border-foreground hover:bg-foreground hover:text-background transition-all"
              >
                <h3 className="font-display font-semibold leading-tight">
                  {c.name}
                </h3>
                <p className="text-xs text-muted-foreground group-hover:text-background/70 mt-1 line-clamp-2">
                  {c.description}
                </p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {loading && (
        <div className="container py-16 text-muted-foreground">Loading…</div>
      )}

      <div className="container">
        <AdSlot slot="home_top" />
      </div>

      {/* Latest grid */}
      {grid.length > 0 && (
        <section className="container py-12">
          <h2 className="font-display text-3xl font-bold mb-8">
            Latest Articles
          </h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-10">
            {grid.map((p) => (
              <PostCard key={p.slug} post={p} />
            ))}
          </div>
        </section>
      )}

      {/* More */}
      {more.length > 0 && (
        <section className="container py-24 border-t border-border/50">
          <div className="grid lg:grid-cols-12 gap-16 items-start">
            <div className="lg:col-span-8">
              <div className="flex items-center gap-4 mb-8">
                <h2 className="font-display text-4xl font-bold tracking-tight">
                  More to read
                </h2>
                <div className="h-px flex-1 bg-gradient-to-r from-border via-border to-transparent" />
              </div>
              <div className="space-y-2">
                {more.map((p) => (
                  <PostCard key={p.slug} post={p} variant="compact" />
                ))}
              </div>
              <div className="mt-12 flex justify-center">
                <Link
                  to="/category/tech"
                  className="px-8 py-3 border border-border text-sm font-semibold hover:border-foreground transition-all rounded-sm uppercase tracking-widest"
                >
                  Explore the full archive
                </Link>
              </div>
            </div>

            <aside className="lg:col-span-4 sticky top-24">
              <div className="relative p-8 border border-border bg-card overflow-hidden group shadow-sm">
                {/* Decorative background element */}
                <div className="absolute top-0 right-0 -translate-y-1/2 translate-x-1/2 w-32 h-32 bg-accent/10 rounded-full blur-2xl transition-all group-hover:scale-150" />

                <div className="relative">
                  <h3 className="font-display text-2xl font-bold mb-3 tracking-tight">
                    The Buying Brief
                  </h3>
                  <p className="text-sm text-muted-foreground leading-relaxed mb-6">
                    Get useful product comparisons, deal-aware buying guides, and practical research notes delivered to your inbox.
                  </p>

                  {submitted ? (
                    <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-sm p-4 text-center">
                      <p className="text-emerald-500 text-sm font-semibold">
                        Thank you! You're subscribed.
                      </p>
                    </div>
                  ) : (
                    <form onSubmit={handleSubscribe} className="space-y-3">
                      <input
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="Enter your email"
                        disabled={submitting}
                        className="w-full px-4 py-3 text-sm bg-background border border-border rounded-sm focus:outline-none focus:ring-1 focus:ring-foreground transition-all disabled:opacity-50"
                      />
                      <button
                        type="submit"
                        disabled={submitting}
                        className="w-full py-3 bg-foreground text-background text-sm font-bold uppercase tracking-widest hover:bg-accent hover:text-accent-foreground transition-all rounded-sm flex items-center justify-center gap-2 disabled:opacity-70"
                      >
                        {submitting ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Subscribing...
                          </>
                        ) : (
                          "Subscribe Now"
                        )}
                      </button>
                      {error && (
                        <p className="text-[10px] text-destructive uppercase tracking-tight text-center">
                          {error}
                        </p>
                      )}
                    </form>
                  )}
                  <p className="text-[10px] text-muted-foreground mt-4 text-center uppercase tracking-tighter">
                    Weekly digest · No spam · Opt-out anytime
                  </p>
                </div>
              </div>

              <div className="mt-12">
                <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-[0.2em] text-muted-foreground/60 mb-6">
                  <span className="w-8 h-px bg-muted-foreground/30" />
                  Advertisement
                </div>
                <div className="bg-muted/30 rounded-sm p-4 border border-dashed border-border">
                  <AdSlot slot="home_sidebar" />
                </div>
              </div>
            </aside>
          </div>
        </section>
      )}
    </Layout>
  );
};

export default Index;
