import { Link, NavLink } from "react-router-dom";
import { ThemeToggle } from "./ThemeToggle";
import { useThemedLogo } from "@/hooks/use-themed-logo";

const categories = [
  { slug: "tech", name: "Tech" },
  { slug: "home-appliances", name: "Home" },
  { slug: "fitness", name: "Fitness" },
  { slug: "kitchen", name: "Kitchen" },
  { slug: "outdoors", name: "Outdoors" },
];

export const Header = () => {
  const { logoSrc, logoClassName } = useThemedLogo();

  return (
    <header className="sticky top-0 z-40 bg-background/85 backdrop-blur-md border-b border-border">
      <div className="container flex items-center justify-between h-16">
        <Link to="/" className="flex items-center gap-2 group">
          <img
            src={logoSrc}
            alt="PassivePress"
            className={logoClassName}
          />
        </Link>

        <nav className="hidden md:flex items-center gap-6 text-sm font-medium">
          {categories.map((c) => (
            <NavLink
              key={c.slug}
              to={`/category/${c.slug}`}
              className={({ isActive }) =>
                `transition-colors hover:text-foreground ${isActive ? "text-foreground" : "text-muted-foreground"}`
              }
            >
              {c.name}
            </NavLink>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Link
            to="/about"
            className="text-sm font-medium hidden sm:inline-flex items-center px-3 py-1.5 border border-foreground rounded-sm hover:bg-foreground hover:text-background transition-colors"
          >
            About
          </Link>
        </div>
      </div>
    </header>
  );
};
