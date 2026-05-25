import { Link } from "react-router-dom";
import { SEO } from "@/components/SEO";
import { Layout } from "@/components/Layout";

const privacyHighlights = [
  "We collect limited information needed to operate and improve the site.",
  "We do not sell personal information.",
  "Third-party analytics or advertising tools may collect data under their own policies.",
  "You can contact us with privacy questions or requests at any time.",
];

const PrivacyPolicy = () => (
  <Layout>
    <SEO
      title="Privacy Policy — PassivePress"
      description="Learn how PassivePress collects, uses, stores, and protects information when you visit our website."
    />

    <div className="container max-w-5xl py-16 md:py-20">
      <section className="mb-12 md:mb-16">
        <p className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Legal</p>
        <h1 className="font-display text-4xl font-extrabold leading-tight md:text-6xl">Privacy Policy</h1>
        <p className="mt-6 max-w-3xl text-lg leading-8 text-muted-foreground md:text-xl">
          This Privacy Policy explains what information PassivePress may collect, how we use it, and the choices available to people
          who visit or contact us through the site.
        </p>
      </section>

      <section className="mb-12 grid gap-6 md:mb-16 md:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-2xl border border-border bg-card p-8 shadow-sm">
          <h2 className="font-display text-2xl font-bold">Privacy at a glance</h2>
          <p className="mt-4 leading-7 text-muted-foreground">
            We aim to keep our privacy practices straightforward. As an editorial website, we mainly use information to publish content,
            understand site performance, respond to messages, and maintain security and reliability.
          </p>
          <p className="mt-4 leading-7 text-muted-foreground">
            If we rely on third-party tools for analytics, ads, hosting, or embedded content, those providers may also process certain
            information according to their own privacy terms.
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-secondary/30 p-8">
          <h2 className="font-display text-2xl font-bold">Key points</h2>
          <ul className="mt-4 space-y-3 text-sm leading-6 text-muted-foreground md:text-base">
            {privacyHighlights.map((item) => (
              <li key={item} className="flex gap-3">
                <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-accent" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <article className="max-w-3xl editorial-prose">
        <h2>Information we collect</h2>
        <p>
          We may collect limited technical and usage information when you browse the site, such as page views, browser type, device
          information, approximate location based on IP, referral sources, and interaction data. If you contact us directly, we may
          also collect the information you choose to provide, such as your name, email address, and message contents.
        </p>

        <h2>How we use information</h2>
        <p>We may use information we collect to:</p>
        <ul>
          <li>operate, maintain, and improve the site,</li>
          <li>understand readership patterns and site performance,</li>
          <li>respond to tips, inquiries, corrections, or feedback,</li>
          <li>monitor for fraud, abuse, spam, or unauthorized activity, and</li>
          <li>comply with applicable legal obligations.</li>
        </ul>

        <h2>Cookies and similar technologies</h2>
        <p>
          We may use cookies, local storage, pixels, or similar technologies to support functionality, remember preferences, measure
          traffic, and improve user experience. You can usually control cookies through your browser settings, though disabling them may
          affect certain site features.
        </p>

        <h2>Analytics, advertising, and third-party services</h2>
        <p>
          We may work with third-party providers for analytics, advertising, hosting, content delivery, or embedded media. These
          providers may collect or receive information as needed to perform their services and may use cookies or similar technologies
          under their own policies.
        </p>

        <h2>Third-party links</h2>
        <p>
          PassivePress frequently links to outside sources, products, companies, research papers, and websites. We are not responsible
          for the privacy practices, content, or security of third-party destinations, and we encourage you to review their policies
          directly.
        </p>

        <h2>How information may be shared</h2>
        <p>
          We do not sell personal information. We may share limited information with vendors or service providers that help us run the
          site, with legal or regulatory authorities when required, or when reasonably necessary to protect our rights, users, or the
          security of the platform.
        </p>

        <h2>Data retention</h2>
        <p>
          We retain information only for as long as reasonably necessary for the purposes described in this policy, including operating
          the site, resolving disputes, enforcing agreements, maintaining records, and complying with legal requirements.
        </p>

        <h2>Your choices and requests</h2>
        <p>
          Depending on how you interact with us and the laws that apply to you, you may be able to request access to, correction of, or
          deletion of information you have provided directly. You may also manage cookie preferences through your browser or device
          settings.
        </p>

        <h2>Children’s privacy</h2>
        <p>
          PassivePress is not intended for children under the age of 13, and we do not knowingly collect personal information from
          children. If you believe a child has submitted personal information to us, please contact us so we can review the issue.
        </p>

        <h2>Policy updates</h2>
        <p>
          We may update this Privacy Policy from time to time to reflect operational, legal, or product changes. If we make updates,
          the revised version will be posted on this page with a new effective date.
        </p>
      </article>

      <section className="mt-12 rounded-2xl border border-border bg-secondary/30 p-8 md:mt-16 md:p-10">
        <h2 className="font-display text-3xl font-bold">Questions or requests?</h2>
        <p className="mt-4 max-w-2xl leading-7 text-muted-foreground">
          If you have questions about this Privacy Policy or want to contact us about information you provided directly, email us and
          we’ll review your request.
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <a
            href="mailto:info@passivepress.qzz.io"
            className="inline-flex items-center justify-center rounded-md bg-primary px-5 py-3 text-sm font-medium text-primary-foreground transition hover:opacity-90"
          >
            Contact us
          </a>
          <Link
            to="/terms"
            className="inline-flex items-center justify-center rounded-md border border-border bg-background px-5 py-3 text-sm font-medium transition hover:bg-accent hover:text-accent-foreground"
          >
            Read terms of service
          </Link>
        </div>
        <p className="mt-6 text-sm text-muted-foreground">Effective date: May 9, 2026</p>
      </section>
    </div>
  </Layout>
);

export default PrivacyPolicy;
