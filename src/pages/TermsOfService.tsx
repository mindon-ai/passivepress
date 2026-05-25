import { Link } from "react-router-dom";
import { SEO } from "@/components/SEO";
import { Layout } from "@/components/Layout";

const termsHighlights = [
  "Use the site lawfully and do not interfere with its operation.",
  "Content is provided for general informational purposes.",
  "PassivePress retains rights in its original content and branding.",
  "We may update these terms from time to time.",
];

const TermsOfService = () => (
  <Layout>
    <SEO
      title="Terms of Service — PassivePress"
      description="Read the terms that govern your use of the PassivePress website, content, and services."
    />

    <div className="container max-w-5xl py-16 md:py-20">
      <section className="mb-12 md:mb-16">
        <p className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Legal</p>
        <h1 className="font-display text-4xl font-extrabold leading-tight md:text-6xl">Terms of Service</h1>
        <p className="mt-6 max-w-3xl text-lg leading-8 text-muted-foreground md:text-xl">
          These Terms of Service govern your access to and use of the PassivePress website. By using the site, you agree to these
          terms. If you do not agree, please do not use the site.
        </p>
      </section>

      <section className="mb-12 grid gap-6 md:mb-16 md:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-2xl border border-border bg-card p-8 shadow-sm">
          <h2 className="font-display text-2xl font-bold">How to use PassivePress</h2>
          <p className="mt-4 leading-7 text-muted-foreground">
            PassivePress is an editorial website focused on buying guides, product comparisons, and review coverage. You may browse, read, and share
            links to our content for lawful, personal, and informational use, subject to these terms and applicable law.
          </p>
          <p className="mt-4 leading-7 text-muted-foreground">
            We want the site to remain useful, secure, and accessible, which means use of the platform must not disrupt operations,
            violate rights, or attempt to bypass restrictions.
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-secondary/30 p-8">
          <h2 className="font-display text-2xl font-bold">Key points</h2>
          <ul className="mt-4 space-y-3 text-sm leading-6 text-muted-foreground md:text-base">
            {termsHighlights.map((item) => (
              <li key={item} className="flex gap-3">
                <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-accent" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <article className="max-w-3xl editorial-prose">
        <h2>Use of the site</h2>
        <p>
          You may use PassivePress only for lawful purposes. You agree not to misuse the site, attempt unauthorized access, interfere
          with performance or availability, scrape or reproduce content at scale without permission, distribute malicious code, or use
          the site in a way that infringes the rights of others.
        </p>

        <h2>Editorial content and accuracy</h2>
        <p>
          PassivePress publishes reporting, summaries, commentary, and analysis about consumer products. While we strive for
          accuracy and timely updates, content is provided for general informational purposes only and may contain errors, omissions, or
          evolving information. We may update, revise, or remove content at any time.
        </p>

        <h2>No professional advice</h2>
        <p>
          Content on the site does not constitute legal, financial, investment, business, technical, or other professional advice.
          Readers should evaluate information independently and consult appropriate professionals when needed.
        </p>

        <h2>Intellectual property</h2>
        <p>
          Unless otherwise stated, PassivePress and its licensors own the site’s original text, branding, design elements, logos, and
          editorial materials. These materials are protected by copyright, trademark, and other applicable laws. Limited personal use of
          the site does not transfer any ownership rights.
        </p>

        <h2>User communications</h2>
        <p>
          If you send us tips, feedback, corrections, or other communications, you represent that you have the right to share that
          information. Unless we explicitly agree otherwise, such communications may be used to review, respond to, or improve our
          editorial and operational processes.
        </p>

        <h2>Third-party links and services</h2>
        <p>
          The site may include links to third-party websites, tools, research sources, embedded media, or external services. We do not
          control those third parties and are not responsible for their content, availability, security, products, or policies.
        </p>

        <h2>Disclaimer of warranties</h2>
        <p>
          To the fullest extent permitted by law, the site is provided on an “as is” and “as available” basis without warranties of any
          kind, whether express or implied, including warranties of merchantability, fitness for a particular purpose, non-infringement,
          or uninterrupted availability.
        </p>

        <h2>Limitation of liability</h2>
        <p>
          To the fullest extent permitted by law, PassivePress will not be liable for any indirect, incidental, consequential, special,
          exemplary, or punitive damages, or for any loss of data, revenue, profits, goodwill, or business opportunities arising from or
          related to your use of or inability to use the site.
        </p>

        <h2>Changes to these terms</h2>
        <p>
          We may revise these Terms of Service from time to time. When updates are made, the revised version will be posted on this page
          with a new effective date. Continued use of the site after the revised terms become effective constitutes acceptance of those
          changes.
        </p>
      </article>

      <section className="mt-12 rounded-2xl border border-border bg-secondary/30 p-8 md:mt-16 md:p-10">
        <h2 className="font-display text-3xl font-bold">Questions about these terms?</h2>
        <p className="mt-4 max-w-2xl leading-7 text-muted-foreground">
          If you have questions about these Terms of Service or need to contact us regarding site use, reach out by email.
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <a
            href="mailto:info@passivepress.qzz.io"
            className="inline-flex items-center justify-center rounded-md bg-primary px-5 py-3 text-sm font-medium text-primary-foreground transition hover:opacity-90"
          >
            Contact us
          </a>
          <Link
            to="/privacy"
            className="inline-flex items-center justify-center rounded-md border border-border bg-background px-5 py-3 text-sm font-medium transition hover:bg-accent hover:text-accent-foreground"
          >
            Read privacy policy
          </Link>
        </div>
        <p className="mt-6 text-sm text-muted-foreground">Effective date: May 9, 2026</p>
      </section>
    </div>
  </Layout>
);

export default TermsOfService;
