import { useEffect, useState } from "react";
import { useTheme } from "next-themes";

export interface ThemedLogoResult {
  logoSrc: string;
  logoClassName: string;
  isDark: boolean;
}

/**
 * Returns the correct logo src and className based on the current theme.
 * Uses `mounted` state to avoid hydration mismatches.
 */
export function useThemedLogo(): ThemedLogoResult {
  const { theme, systemTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const currentTheme = theme === "system" ? systemTheme : theme;
  const isDark = mounted && currentTheme === "dark";

  return {
    logoSrc: isDark
      ? "/neuronpress-text-logo.webp"
      : "/neuronpress-text-logo-dark.webp",
    logoClassName: isDark ? "h-9 w-auto object-contain" : "h-12 w-auto object-contain",
    isDark,
  };
}
