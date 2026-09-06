"use client";

import { useSession, signOut } from "next-auth/react";
import { useEffect, useId, useRef, useState } from "react";
import { Menu, X, User, LogOut, Shield, KeyRound, Bookmark, LayoutList, Upload, ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import LocaleSwitcher from "@/components/LocaleSwitcher";
import SiteSearch from "@/components/ui/SiteSearch";

// Primary navigation. One product story: agents first, projects and skills as
// sub-catalogs, and "Get API key" as the standing call to action. The account
// menu opens on click (not hover) so it works with touch and keyboard, and both
// menus carry the ARIA state assistive tech expects.
const NAV: { href: string; key: "agents" | "projects" | "skills" | "blog" | "install" }[] = [
  { href: "/agents", key: "agents" },
  { href: "/agents?kind=PROJECT", key: "projects" },
  { href: "/skills", key: "skills" },
  { href: "/blog", key: "blog" },
  { href: "/install", key: "install" },
];

export default function Header() {
  const { data: session } = useSession();
  const t = useTranslations("Header");
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const accountRef = useRef<HTMLDivElement>(null);
  const mobileId = useId();
  const accountId = useId();
  const isAdmin = (session?.user as { role?: string } | undefined)?.role === "admin";
  const signInHref = { pathname: "/auth/signin", query: { callbackUrl: pathname } } as const;

  // Close the account menu on outside click / Escape.
  useEffect(() => {
    if (!accountOpen) return;
    const onDown = (e: MouseEvent) => {
      if (accountRef.current && !accountRef.current.contains(e.target as Node)) setAccountOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAccountOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [accountOpen]);

  const menuItem = "flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50";

  return (
    <header className="sticky top-0 z-50 bg-white/85 backdrop-blur-md border-b border-gray-200">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:start-2 focus:top-2 focus:z-[60] focus:rounded-md focus:bg-purple-600 focus:px-3 focus:py-2 focus:text-sm focus:text-white"
      >
        {t("skipToContent")}
      </a>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-4 h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 shrink-0" aria-label="TakoAPI">
            <span className="text-2xl" aria-hidden>🐙</span>
            <span className="text-xl font-bold bg-gradient-to-r from-purple-600 to-blue-500 bg-clip-text text-transparent">
              TakoAPI
            </span>
          </Link>

          {/* Search - desktop */}
          <div className="hidden lg:block flex-1 max-w-md">
            <SiteSearch />
          </div>

          {/* Nav links - desktop */}
          <nav className="hidden md:flex items-center gap-1" aria-label={t("mainNav")}>
            {NAV.map((item) => {
              const active =
                item.key === "projects"
                  ? false
                  : item.href === "/agents"
                    ? pathname === "/agents" || pathname.startsWith("/agents/")
                    : pathname === item.href || pathname.startsWith(item.href + "/");
              return (
                <Link
                  key={item.key}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`px-2.5 py-1.5 rounded-md text-sm transition-colors ${
                    active ? "text-purple-700 bg-purple-50 font-medium" : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                  }`}
                >
                  {t(item.key)}
                </Link>
              );
            })}
            <Link
              href="/dashboard"
              className="ms-2 inline-flex items-center gap-1.5 text-sm bg-purple-600 text-white px-4 py-2 rounded-full hover:bg-purple-700 transition-colors"
            >
              <KeyRound className="h-4 w-4" />
              {t("getApiKey")}
            </Link>
            <div className="ms-1">
              <LocaleSwitcher />
            </div>
            {session ? (
              <div className="relative ms-1" ref={accountRef}>
                <button
                  type="button"
                  onClick={() => setAccountOpen((o) => !o)}
                  aria-haspopup="menu"
                  aria-expanded={accountOpen}
                  aria-controls={accountId}
                  className="flex items-center gap-1.5 rounded-full px-2 py-1.5 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                >
                  <User className="h-4 w-4" />
                  <span className="max-w-[10rem] truncate">{session.user?.name || t("account")}</span>
                  <ChevronDown className="h-3.5 w-3.5" aria-hidden />
                </button>
                {accountOpen && (
                  <div
                    id={accountId}
                    role="menu"
                    className="absolute end-0 top-full mt-1 w-52 overflow-hidden rounded-lg bg-white shadow-lg border border-gray-200"
                  >
                    <Link href="/profile" role="menuitem" className={menuItem} onClick={() => setAccountOpen(false)}>
                      <LayoutList className="h-3.5 w-3.5" /> {t("myListings")}
                    </Link>
                    <Link href="/bookmarks" role="menuitem" className={menuItem} onClick={() => setAccountOpen(false)}>
                      <Bookmark className="h-3.5 w-3.5" /> {t("myBookmarks")}
                    </Link>
                    <Link href="/dashboard" role="menuitem" className={menuItem} onClick={() => setAccountOpen(false)}>
                      <KeyRound className="h-3.5 w-3.5" /> {t("apiUsage")}
                    </Link>
                    <Link href="/submit-agent" role="menuitem" className={menuItem} onClick={() => setAccountOpen(false)}>
                      <Upload className="h-3.5 w-3.5" /> {t("publishAgent")}
                    </Link>
                    {isAdmin && (
                      <Link href="/admin" role="menuitem" className={menuItem} onClick={() => setAccountOpen(false)}>
                        <Shield className="h-3.5 w-3.5" /> {t("adminPanel")}
                      </Link>
                    )}
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => signOut()}
                      className={`w-full text-start border-t border-gray-100 ${menuItem}`}
                    >
                      <LogOut className="h-3.5 w-3.5" /> {t("signOut")}
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <Link href={signInHref} className="ms-1 text-sm text-gray-600 hover:text-gray-900 px-2 py-1.5">
                {t("signIn")}
              </Link>
            )}
          </nav>

          {/* Mobile menu button */}
          <button
            type="button"
            className="md:hidden p-2 rounded-md text-gray-700 hover:bg-gray-50"
            onClick={() => setMenuOpen((o) => !o)}
            aria-label={menuOpen ? t("closeMenu") : t("openMenu")}
            aria-expanded={menuOpen}
            aria-controls={mobileId}
          >
            {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        {/* Mobile menu */}
        {menuOpen && (
          <div id={mobileId} className="md:hidden pb-4 space-y-3">
            <SiteSearch />
            <nav className="flex flex-col gap-1" aria-label={t("mainNav")}>
              {NAV.map((item) => (
                <Link
                  key={item.key}
                  href={item.href}
                  className="text-sm text-gray-700 py-2 px-1"
                  onClick={() => setMenuOpen(false)}
                >
                  {t(item.key)}
                </Link>
              ))}
              <Link
                href="/dashboard"
                className="mt-1 inline-flex w-fit items-center gap-1.5 text-sm bg-purple-600 text-white px-4 py-2 rounded-full"
                onClick={() => setMenuOpen(false)}
              >
                <KeyRound className="h-4 w-4" /> {t("getApiKey")}
              </Link>
              {session ? (
                <>
                  <Link href="/profile" className="text-sm text-gray-700 py-2 px-1" onClick={() => setMenuOpen(false)}>
                    {t("myListings")}
                  </Link>
                  <Link href="/bookmarks" className="text-sm text-gray-700 py-2 px-1" onClick={() => setMenuOpen(false)}>
                    {t("myBookmarks")}
                  </Link>
                  <Link href="/submit-agent" className="text-sm text-gray-700 py-2 px-1" onClick={() => setMenuOpen(false)}>
                    {t("publishAgent")}
                  </Link>
                  {isAdmin && (
                    <Link href="/admin" className="text-sm text-gray-700 py-2 px-1" onClick={() => setMenuOpen(false)}>
                      {t("adminPanel")}
                    </Link>
                  )}
                  <button type="button" onClick={() => signOut()} className="text-start text-sm text-gray-700 py-2 px-1">
                    {t("signOut")}
                  </button>
                </>
              ) : (
                <Link href={signInHref} className="text-sm text-gray-700 py-2 px-1" onClick={() => setMenuOpen(false)}>
                  {t("signIn")}
                </Link>
              )}
              <div className="pt-1">
                <LocaleSwitcher className="w-full" />
              </div>
            </nav>
          </div>
        )}
      </div>
    </header>
  );
}
