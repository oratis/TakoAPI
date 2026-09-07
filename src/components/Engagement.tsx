"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import { Star, Bookmark } from "lucide-react";
import { Link, usePathname } from "@/i18n/navigation";
import { useAsync, fetchJson } from "@/hooks/useAsync";

// Rating (1–5) + bookmark bar shared by agent and skill detail pages. The two
// pages used to carry near-identical copies; the only difference is the API base
// (`/api/agents/<slug>` vs `/api/skills/<id>`). Not SEO content, so it loads its
// state client-side after the server-rendered page is on screen.
type RatingState = { avgRating: number; ratingCount: number; myRating: number | null };

export function Engagement({ apiBase, framed = true }: { apiBase: string; framed?: boolean }) {
  const t = useTranslations("AgentEngagement");
  const { status } = useSession();
  const signedIn = status === "authenticated";
  const pathname = usePathname();

  const initial = useAsync(
    async () => {
      const [r, b] = await Promise.all([
        fetchJson<RatingState>(`${apiBase}/rating`).catch(() => null),
        fetchJson<{ bookmarked: boolean }>(`${apiBase}/bookmark`).catch(() => null),
      ]);
      return { rating: r, bookmarked: !!b?.bookmarked };
    },
    [apiBase, status]
  );

  // Local overrides after the user acts; null = show what the server sent.
  const [rating, setRating] = useState<RatingState | null>(null);
  const [bookmarked, setBookmarked] = useState<boolean | null>(null);
  const [hover, setHover] = useState(0);
  const [busy, setBusy] = useState(false);

  const current: RatingState = rating ?? initial.data?.rating ?? { avgRating: 0, ratingCount: 0, myRating: null };
  const isBookmarked = bookmarked ?? initial.data?.bookmarked ?? false;

  const rate = async (value: number) => {
    if (!signedIn || busy) return;
    setBusy(true);
    const prev = current;
    setRating({ ...current, myRating: value }); // optimistic
    try {
      const d = await fetchJson<RatingState>(`${apiBase}/rating`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating: value }),
      });
      setRating({ avgRating: d.avgRating ?? 0, ratingCount: d.ratingCount ?? 0, myRating: d.myRating ?? value });
    } catch {
      setRating(prev);
    } finally {
      setBusy(false);
    }
  };

  const toggleBookmark = async () => {
    if (!signedIn || busy) return;
    setBusy(true);
    const prev = isBookmarked;
    setBookmarked(!prev); // optimistic
    try {
      const d = await fetchJson<{ bookmarked: boolean }>(`${apiBase}/bookmark`, { method: "POST" });
      setBookmarked(!!d.bookmarked);
    } catch {
      setBookmarked(prev);
    } finally {
      setBusy(false);
    }
  };

  const starValue = hover || current.myRating || 0;

  return (
    <div
      className={`flex flex-wrap items-center gap-x-6 gap-y-3 ${
        framed ? "rounded-xl border border-gray-200 bg-white px-4 py-3" : ""
      }`}
    >
      {/* Community average */}
      <div className="flex items-center gap-1.5">
        <Star className="h-4 w-4 fill-amber-400 text-amber-400" aria-hidden />
        <span className="text-sm font-medium text-gray-700">{current.ratingCount > 0 ? current.avgRating.toFixed(1) : "—"}</span>
        <span className="text-xs text-gray-500">
          {current.ratingCount > 0 ? t("ratingsCount", { count: current.ratingCount }) : t("noRatings")}
        </span>
      </div>

      {/* The user's own rating */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-500" id={`rate-label-${apiBase.replace(/\W+/g, "-")}`}>
          {t("yourRating")}
        </span>
        <div className="flex" onMouseLeave={() => setHover(0)} role="radiogroup" aria-labelledby={`rate-label-${apiBase.replace(/\W+/g, "-")}`}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={current.myRating === n}
              disabled={!signedIn || busy}
              onMouseEnter={() => signedIn && setHover(n)}
              onFocus={() => signedIn && setHover(n)}
              onBlur={() => setHover(0)}
              onClick={() => rate(n)}
              className={`${signedIn ? "cursor-pointer" : "cursor-not-allowed"} p-0.5 rounded focus-visible:outline-2 focus-visible:outline-purple-500`}
              aria-label={t("rateStars", { count: n })}
            >
              <Star className={`h-4 w-4 ${n <= starValue ? "fill-amber-400 text-amber-400" : "text-gray-300"}`} />
            </button>
          ))}
        </div>
      </div>

      {/* Bookmark toggle */}
      <button
        type="button"
        onClick={toggleBookmark}
        disabled={!signedIn || busy}
        aria-pressed={isBookmarked}
        className={`ms-auto inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition ${
          isBookmarked ? "border-purple-200 bg-purple-50 text-purple-700" : "border-gray-200 text-gray-600 hover:bg-gray-50"
        } disabled:opacity-50`}
      >
        <Bookmark className={`h-4 w-4 ${isBookmarked ? "fill-purple-600 text-purple-600" : ""}`} aria-hidden />
        {isBookmarked ? t("bookmarked") : t("bookmark")}
      </button>

      {status === "unauthenticated" && (
        <p className="w-full text-xs text-gray-500">
          <Link href={{ pathname: "/auth/signin", query: { callbackUrl: pathname } }} className="text-purple-600 hover:underline">
            {t("signInToRate")}
          </Link>
        </p>
      )}
    </div>
  );
}
