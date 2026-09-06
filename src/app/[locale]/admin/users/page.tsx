"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useAsync, fetchJson } from "@/hooks/useAsync";
import { Users, Search, ChevronLeft, ChevronRight, Shield, ShieldOff, Loader2 } from "lucide-react";

interface UserItem {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  role: string;
  provider: string | null;
  createdAt: string;
  _count: {
    skills: number;
    likes: number;
  };
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export default function AdminUsersPage() {
  const t = useTranslations("Admin");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [togglingRole, setTogglingRole] = useState<string | null>(null);

  // Debounce search input. A new term always restarts at page 1, otherwise a
  // narrower result set would be read from whatever page the admin was on.
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const { data, loading, error, reload } = useAsync(() => {
    const params = new URLSearchParams({ page: String(page), limit: "20" });
    if (debouncedSearch) params.set("q", debouncedSearch);
    return fetchJson<{ users: UserItem[]; pagination: Pagination }>(`/api/admin/users?${params}`);
  }, [page, debouncedSearch]);

  const users = data?.users ?? [];
  const pagination = data?.pagination ?? { page, limit: 20, total: 0, totalPages: 0 };

  const toggleRole = async (userId: string, currentRole: string) => {
    const newRole = currentRole === "admin" ? "user" : "admin";
    setTogglingRole(userId);
    try {
      await fetchJson(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole }),
      });
      reload();
    } catch {
      // silently fail, the table keeps showing the server's last known state
    } finally {
      setTogglingRole(null);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Users className="h-6 w-6 text-purple-600" />
          {t("usersTitle")}
        </h1>
        <span className="text-sm text-gray-600">
          {t("usersTotal", { count: pagination.total })}
        </span>
      </div>

      {/* Search */}
      <div className="mb-4">
        <div className="relative max-w-sm">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
          <input
            type="text"
            placeholder={t("searchUsersPlaceholder")}
            aria-label={t("searchUsersPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full ps-10 pe-4 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-start px-4 py-3 font-medium text-gray-600">{t("colName")}</th>
                <th className="text-start px-4 py-3 font-medium text-gray-600">{t("colEmail")}</th>
                <th className="text-start px-4 py-3 font-medium text-gray-600">{t("colRole")}</th>
                <th className="text-start px-4 py-3 font-medium text-gray-600">{t("colProvider")}</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">{t("colSkills")}</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">{t("colLikes")}</th>
                <th className="text-start px-4 py-3 font-medium text-gray-600">{t("colJoined")}</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">{t("colActions")}</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-16 text-center">
                    <div className="flex items-center justify-center gap-2 text-gray-600">
                      <Loader2 className="h-5 w-5 animate-spin" />
                      {t("loadingUsers")}
                    </div>
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={8} className="py-16 text-center">
                    <p className="text-sm text-gray-600 mb-3">{t("somethingWentWrong")}</p>
                    <button
                      onClick={reload}
                      className="px-4 py-2 rounded-lg text-sm font-medium bg-purple-600 text-white hover:bg-purple-700"
                    >
                      {t("retry")}
                    </button>
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-16 text-center text-gray-600">
                    {t("noUsersFound")}
                  </td>
                </tr>
              ) : (
                users.map((user) => (
                  <tr key={user.id} className="border-b border-gray-100 hover:bg-gray-50/50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        {user.image ? (
                          // Avatars come from arbitrary OAuth CDNs that are not in
                          // next/image's remotePatterns, so this stays a plain <img>.
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={user.image} alt="" className="h-7 w-7 rounded-full object-cover" />
                        ) : (
                          <div className="h-7 w-7 rounded-full bg-purple-100 flex items-center justify-center text-purple-700 text-xs font-bold">
                            {(user.name || user.email).charAt(0).toUpperCase()}
                          </div>
                        )}
                        <span className="font-medium text-gray-900">{user.name || t("noName")}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{user.email}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${
                          user.role === "admin"
                            ? "bg-purple-50 text-purple-700"
                            : "bg-gray-100 text-gray-700"
                        }`}
                      >
                        {user.role === "admin" ? (
                          <Shield className="h-3 w-3" />
                        ) : null}
                        {user.role === "admin" ? t("roleAdmin") : t("roleUser")}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-gray-600 capitalize">{user.provider || t("providerCredentials")}</span>
                    </td>
                    <td className="px-4 py-3 text-center text-gray-700">{user._count.skills}</td>
                    <td className="px-4 py-3 text-center text-gray-700">{user._count.likes}</td>
                    <td className="px-4 py-3 text-gray-600">{formatDate(user.createdAt)}</td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => toggleRole(user.id, user.role)}
                        disabled={togglingRole === user.id}
                        className={`inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg font-medium transition-colors disabled:opacity-50 ${
                          user.role === "admin"
                            ? "bg-gray-100 text-gray-700 hover:bg-gray-200"
                            : "bg-purple-50 text-purple-700 hover:bg-purple-100"
                        }`}
                        title={user.role === "admin" ? t("demoteToUser") : t("promoteToAdmin")}
                      >
                        {togglingRole === user.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : user.role === "admin" ? (
                          <ShieldOff className="h-3 w-3" />
                        ) : (
                          <Shield className="h-3 w-3" />
                        )}
                        {user.role === "admin" ? t("demote") : t("promote")}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50">
            <p className="text-xs text-gray-600">
              {t("showingRange", {
                from: (pagination.page - 1) * pagination.limit + 1,
                to: Math.min(pagination.page * pagination.limit, pagination.total),
                total: pagination.total,
              })}
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={pagination.page <= 1}
                aria-label={t("prevPage")}
                className="p-1.5 rounded-lg text-gray-600 hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              {Array.from({ length: pagination.totalPages }, (_, i) => i + 1)
                .filter((p) => {
                  const current = pagination.page;
                  return p === 1 || p === pagination.totalPages || Math.abs(p - current) <= 1;
                })
                .reduce<(number | string)[]>((acc, p, idx, arr) => {
                  if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push("...");
                  acc.push(p);
                  return acc;
                }, [])
                .map((item, idx) =>
                  typeof item === "string" ? (
                    <span key={`ellipsis-${idx}`} className="px-1 text-gray-600 text-xs">
                      ...
                    </span>
                  ) : (
                    <button
                      key={item}
                      onClick={() => setPage(item)}
                      aria-current={item === pagination.page ? "page" : undefined}
                      className={`min-w-[28px] h-7 rounded-lg text-xs font-medium transition-colors ${
                        item === pagination.page
                          ? "bg-purple-600 text-white"
                          : "hover:bg-gray-200 text-gray-600"
                      }`}
                    >
                      {item}
                    </button>
                  )
                )}
              <button
                onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                disabled={pagination.page >= pagination.totalPages}
                aria-label={t("nextPage")}
                className="p-1.5 rounded-lg text-gray-600 hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
