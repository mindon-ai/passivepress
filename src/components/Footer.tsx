import { Link } from "react-router-dom";
import { useThemedLogo } from "@/hooks/use-themed-logo";

const CURRENT_YEAR = new Date().getFullYear();

export const Footer = () => {
  const { logoSrc, logoClassName } = useThemedLogo();

  return (
    <footer className="border-t border-border mt-24 bg-secondary/30">
      <div className="container py-12 grid gap-8 md:grid-cols-4">
        <div>
          <div className="mb-4">
            <Link to="/" className="flex items-center gap-2 group">
              <img
                src={logoSrc}
                alt="PassivePress"
                className={logoClassName}
              />
            </Link>
          </div>
          <p className="text-sm text-muted-foreground max-w-xs">
            Practical buying guides, product comparisons, and review roundups for gear worth researching before you buy.
          </p>
        </div>
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">Categories</h4>
          <ul className="space-y-2 text-sm">
            <li><Link to="/category/tech" className="hover:text-accent">Tech</Link></li>
            <li><Link to="/category/home-appliances" className="hover:text-accent">Home Appliances</Link></li>
            <li><Link to="/category/fitness" className="hover:text-accent">Fitness</Link></li>
            <li><Link to="/category/kitchen" className="hover:text-accent">Kitchen</Link></li>
          </ul>
        </div>
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">More</h4>
          <ul className="space-y-2 text-sm">
            <li><Link to="/category/outdoors" className="hover:text-accent">Outdoors</Link></li>
            <li><Link to="/category/tech" className="hover:text-accent">Buying Guides</Link></li>
            <li><Link to="/about" className="hover:text-accent">About</Link></li>
          </ul>
        </div>
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">Legal</h4>
          <ul className="space-y-2 text-sm">
            <li><Link to="/privacy" className="hover:text-accent">Privacy Policy</Link></li>
            <li><Link to="/terms" className="hover:text-accent">Terms of Service</Link></li>
            <li><a href="mailto:info@passivepress.qzz.io" className="hover:text-accent">Contact</a></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-border">
        <div className="container py-6 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-muted-foreground">
          <p>© {CURRENT_YEAR} PassivePress. All rights reserved.</p>
          <p>Useful product research. Updated regularly.</p>
        </div>
      </div>
    </footer>
  );
};
