import { Moon, Sun } from "lucide-react";

import { useLocale } from "../../lib/i18n";
import type { Theme } from "../../hooks/useTheme";

interface ThemeToggleProps {
  theme: Theme;
  onToggle: () => void;
}

export function ThemeToggle({ theme, onToggle }: ThemeToggleProps) {
  const { t } = useLocale();

  return (
    <button
      className="theme-toggle"
      onClick={onToggle}
      aria-label={t("theme.toggle")}
      title={t("theme.toggle")}
    >
      {theme === "dark" ? <Sun size={16} aria-hidden="true" /> : <Moon size={16} aria-hidden="true" />}
    </button>
  );
}
