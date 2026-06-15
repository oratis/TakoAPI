"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { useTranslations } from "next-intl";

export default function HomeSearch() {
  const t = useTranslations("Components");
  const [query, setQuery] = useState("");
  const router = useRouter();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      router.push(`/skills?q=${encodeURIComponent(query.trim())}`);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="mt-8 max-w-xl mx-auto">
      <div className="relative">
        <Search className="absolute start-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
        <input
          type="text"
          placeholder={t("homeSearchPlaceholder")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full ps-12 pe-28 py-3.5 rounded-full border border-gray-300 bg-white shadow-sm focus:border-purple-400 focus:ring-2 focus:ring-purple-100 outline-none text-base transition-all"
        />
        <button
          type="submit"
          className="absolute end-2 top-1/2 -translate-y-1/2 bg-purple-600 text-white px-5 py-2 rounded-full text-sm font-medium hover:bg-purple-700 transition-colors"
        >
          {t("homeSearchButton")}
        </button>
      </div>
    </form>
  );
}
