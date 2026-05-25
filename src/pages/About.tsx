import { Link } from "react-router-dom";
import { SEO } from "@/components/SEO";
import { Layout } from "@/components/Layout";

const coverageAreas = [
  {
    title: "Tech",
    description: "New releases, benchmark results, product launches, and what model improvements actually mean in practice.",
  },
  {
    title: "Home Appliances",
    description: "Generative media tools, creative workflows, and the fast-moving ecosystem around synthetic content.",
  },
  {
    title: "Fitness Gear",
    description: "Copilots, agentic IDEs, developer workflows, and the changing shape of software engineering.",
  },
  {
    title: "Kitchen & Home",
    description: "Real-world deployments across operations, marketing, support, sales, and enterprise decision-making.",
  },
  {
    title: "Outdoor Gear",
    description: "Papers, architectures, training methods, safety work, and the ideas shaping the next generation of systems.",
  },
  {
    title: "Buying Guides",
    description: "Funding, regulation, partnerships, platform shifts, and major industry developments worth tracking.",
  },
];

const principles = [
  "Clear reporting over hype",
  "Primary sources whenever possible",
  "Context that helps readers understand why a story matters",
  "Explanations that stay accessible without oversimplifying",
];

const About = () => (
  <Layout>
    <SEO
      title="About PassivePress — Editorial mission & AI coverage"
      description="Learn about PassivePress, our editorial mission, what we cover, and how we approach reporting on consumer products."
    />

    <div className="container max-w-5xl py-16 md:py-20">
      <section className="mb-16 md:mb-20">
        <p className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">About</p>
        <h1 className="font-display text-4xl font-extrabold leading-tight md:text-6xl">
          Independent reporting on the people, products, and ideas shaping AI.
        </h1>
        <p className="mt-6 max-w-3xl text-lg leading-8 text-muted-foreground md:text-xl">
          PassivePress is an editorial publication focused on consumer products — from frontier models and research labs to
          practical tools used by developers, creators, and businesses every day.
        </p>
      </section>

      <section className="mb-16 grid gap-6 md:mb-20 md:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-2xl border border-border bg-card p-8 shadow-sm">
          <h2 className="font-display text-2xl font-bold">Our mission</h2>
          <p className="mt-4 leading-7 text-muted-foreground">
            The AI industry moves fast, and too much coverage is either overly technical or overly promotional. We aim to sit in the
            middle: accurate, readable, and useful. Our goal is to help readers quickly understand what changed, why it matters, and
            where it fits in the bigger picture.
          </p>
          <p className="mt-4 leading-7 text-muted-foreground">
            Whether the story is a model release, a research breakthrough, a product launch, or a market shift, we try to bring the
            same editorial standard to every piece: clarity, context, and signal over noise.
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-secondary/30 p-8">
          <h2 className="font-display text-2xl font-bold">What readers can expect</h2>
          <ul className="mt-4 space-y-3 text-sm leading-6 text-muted-foreground md:text-base">
            <li>Daily coverage of major AI developments</li>
            <li>Category-specific reporting across tools, research, and business</li>
            <li>Clean summaries with links to source material</li>
            <li>Analysis designed for both technical and non-technical readers</li>
          </ul>
        </div>
      </section>

      <section className="mb-16 md:mb-20">
        <h2 className="font-display text-3xl font-bold">What we cover</h2>
        <p className="mt-3 max-w-3xl text-muted-foreground leading-7">
          We cover the AI landscape through a set of core beats so readers can follow the areas that matter most to them.
        </p>
        <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {coverageAreas.map((area) => (
            <div key={area.title} className="rounded-2xl border border-border bg-card p-6">
              <h3 className="font-semibold text-lg">{area.title}</h3>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">{area.description}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mb-16 grid gap-6 md:mb-20 md:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card p-8">
          <h2 className="font-display text-2xl font-bold">Editorial principles</h2>
          <ul className="mt-5 space-y-3 text-muted-foreground">
            {principles.map((principle) => (
              <li key={principle} className="flex gap-3 leading-7">
                <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-accent" />
                <span>{principle}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-2xl border border-border bg-card p-8">
          <h2 className="font-display text-2xl font-bold">Why PassivePress exists</h2>
          <p className="mt-4 leading-7 text-muted-foreground">
            AI now affects how people search, write, code, design, operate businesses, and make decisions. That makes good coverage
            more important than ever. We believe readers need reporting that is timely without being breathless, informed without being
            inaccessible, and opinionated only when it adds value.
          </p>
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-secondary/30 p-8 md:p-10">
        <h2 className="font-display text-3xl font-bold">Get in touch</h2>
        <p className="mt-4 max-w-2xl leading-7 text-muted-foreground">
          Have a tip, correction, partnership inquiry, or story idea? We’d love to hear from you.
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <a
            href="mailto:info@passivepress.qzz.io"
            className="inline-flex items-center justify-center rounded-md bg-primary px-5 py-3 text-sm font-medium text-primary-foreground transition hover:opacity-90"
          >
            Email us
          </a>
          <Link
            to="/category/tech"
            className="inline-flex items-center justify-center rounded-md border border-border bg-background px-5 py-3 text-sm font-medium transition hover:bg-accent hover:text-accent-foreground"
          >
            Browse coverage
          </Link>
        </div>
      </section>
    </div>
  </Layout>
);

export default About;
