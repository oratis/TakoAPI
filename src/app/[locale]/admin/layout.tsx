"use client";

import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { LayoutDashboard, Package, Bot, FolderTree, Users, ScrollText, ArrowLeft } from "lucide-react";

const NAV_ITEMS = [
  { href: "/admin", labelKey: "navDashboard", icon: LayoutDashboard },
  { href: "/admin/skills", labelKey: "navSkills", icon: Package },
  { href: "/admin/agents", labelKey: "navAgents", icon: Bot },
  { href: "/admin/categories", labelKey: "navCategories", icon: FolderTree },
  { href: "/admin/users", labelKey: "navUsers", icon: Users },
  { href: "/admin/logs", labelKey: "navLogs", icon: ScrollText },
] as const;

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const t = useTranslations("Admin");

  if (status === "loading") {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div
          role="status"
          aria-label={t("loading")}
          className="animate-spin h-8 w-8 border-2 border-purple-600 border-t-transparent rounded-full"
        />
      </div>
    );
  }

  const role = (session?.user as { role?: string })?.role;
  if (!session || role !== "admin") {
    return (
      <div className="max-w-lg mx-auto px-4 py-20 text-center">
        <h1 className="text-2xl font-bold mb-2">{t("accessDenied")}</h1>
        <p className="text-gray-600 mb-6">{t("accessDeniedDescription")}</p>
        <Link
          href="/"
          className="inline-flex bg-purple-600 text-white px-6 py-2.5 rounded-full text-sm font-medium hover:bg-purple-700"
        >
          {t("goHome")}
        </Link>
      </div>
    );
  }

  return (
    <div className="flex min-h-[calc(100vh-64px)]">
      {/* Sidebar. Muted text here sits on gray-900, so it goes *lighter* (gray-300)
          rather than following the on-white rule of gray-500/600 — gray-400 was
          only just over AA against this background. */}
      <aside className="w-56 bg-gray-900 text-white shrink-0">
        <div className="p-4 border-b border-gray-800">
          <Link href="/" className="flex items-center gap-2 text-sm text-gray-300 hover:text-white transition-colors">
            <ArrowLeft className="h-3.5 w-3.5 rtl:-scale-x-100" aria-hidden />
            {t("backToSite")}
          </Link>
          <h2 className="mt-3 text-lg font-bold">{t("panelTitle")}</h2>
        </div>
        <nav className="p-2 space-y-0.5" aria-label={t("adminNavLabel")}>
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href || (item.href !== "/admin" && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                  isActive
                    ? "bg-purple-600 text-white"
                    : "text-gray-300 hover:bg-gray-800 hover:text-white"
                }`}
              >
                <item.icon className="h-4 w-4" />
                {t(item.labelKey)}
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Main content */}
      <main className="flex-1 bg-gray-50 overflow-auto">
        <div className="p-6 lg:p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
