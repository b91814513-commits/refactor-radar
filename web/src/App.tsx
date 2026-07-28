import { useMemo, useState, useCallback } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { Languages, Radar, ShieldCheck, Menu, X } from "lucide-react";

import { ThemeToggle } from "./components/common/ThemeToggle";
import { useTheme } from "./hooks/useTheme";
import { createTranslator, LocaleContext, type Locale } from "./lib/i18n";

const LOCALE_KEY = "refactor-radar-locale";

function AppShell() {
  const [locale, setLocaleState] = useState<Locale>(() => {
    const stored = window.localStorage.getItem(LOCALE_KEY);
    return stored === "zh" ? "zh" : "en";
  });
  const t = useMemo(() => createTranslator(locale), [locale]);
  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    window.localStorage.setItem(LOCALE_KEY, next);
  }, []);

  const { theme, toggleTheme } = useTheme();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const localeCtx = useMemo(
    () => ({ locale, setLocale, t }),
    [locale, setLocale, t],
  );

  const navItems = [
    { path: "/", label: t("nav.dashboard") },
    { path: "/history", label: t("nav.history") },
    { path: "/settings", label: t("nav.settings") },
  ];

  return (
    <LocaleContext.Provider value={localeCtx}>
      <div className="shell">
        <a className="skip-link" href="#workspace">{t("nav.skipToWorkspace")}</a>

        <header className="topbar">
          <div className="topbar-inner">
            <div className="brand" translate="no">
              <span className="brand-mark" aria-hidden="true"><Radar size={18} strokeWidth={1.8} /></span>
              <span>Refactor Radar</span>
            </div>

            <nav className={`topbar-nav ${mobileMenuOpen ? "open" : ""}`}>
              {navItems.map((item) => (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`topbar-nav-link ${location.pathname === item.path ? "active" : ""}`}
                  onClick={() => setMobileMenuOpen(false)}
                >
                  {item.label}
                </Link>
              ))}
            </nav>

            <div className="topbar-actions">
              <span className="privacy-status">
                <ShieldCheck size={15} aria-hidden="true" />
                {t("hero.staticFirst")}
              </span>
              <ThemeToggle theme={theme} onToggle={toggleTheme} />
              <button
                className="lang-toggle"
                onClick={() => setLocale(locale === "en" ? "zh" : "en")}
                aria-label={locale === "en" ? "Switch to Chinese" : "Switch to English"}
              >
                <Languages size={15} aria-hidden="true" />
                <span className="lang-toggle-inner">{t("lang.toggle")}</span>
              </button>
              <button
                className="mobile-menu-toggle"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                aria-label="Menu"
                aria-expanded={mobileMenuOpen}
              >
                {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
              </button>
            </div>
          </div>
        </header>

        <main className="workspace" id="workspace">
          <Outlet />
        </main>
      </div>
    </LocaleContext.Provider>
  );
}

export default AppShell;
