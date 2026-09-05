"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import { Star, Bookmark } from "lucide-react";

// Interactive engagement bar for an agent detail page: community average,
// the signed-in user's own 1–5 rating, and a bookmark toggle. Reads/writes
// /api/agents/[slug]/rating and /bookmark. Not SEO content, so it loads its
// state client-side on mount (the page itself stays server-rendered).
export function AgentEngagement({ slug }: { slug: string }) {
  const t = useTranslations("AgentEngagement");
  const { status } = useSession();
  const signedIn = status === "authenticated";

  const [avgRating, setAvgRating] = useState(0);
  const [ratingCount, setRatingCount] = useState(0);
  const [myRating, setMyRating] = useState<number | null>(null);
  const [bookmarked, setBookmarked] = useState(false);
  const [hover, setHover] = useState(0);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [r, b] = await Promise.all([
      fetch(`/api/agents/${slug}/rating`).then((x) => x.json()).catch(() => null),
      fetch(`/api/agents/${slug}/bookmark`).then((x) => x.json()).catch(() => null),
    ]);
    if (r) {
      setAvgRating(r.avgRating ?? 0);
      setRatingCount(r.ratingCount ?? 0);
      setMyRating(r.myRating ?? null);
    }
    if (b) setBookmarked(!!b.bookmarked);
  }, [slug]);

  useEffect(() => {
    load();
  }, [load]);

  const rate = async (value: number) => {
    if (!signedIn || busy) return;
    setBusy(true);
    const prev = myRating;
    setMyRating(value); // optimistic
    try {
      const res = await fetch(`/api/agents/${slug}/rating`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating: value }),
      });
      if (res.ok) {
        const d = await res.json();
        setAvgRating(d.avgRating ?? 0);
        setRatingCount(d.ratingCount ?? 0);
        setMyRating(d.myRating ?? value);
      } else {
        setMyRating(prev);
      }
    } catch {
      setMyRating(prev);
    } finally {
      setBusy(false);
    }
  };

  const toggleBookmark = async () => {
    if (!signedIn || busy) return;
    setBusy(true);
    const prev = bookmarked;
    setBookmarked(!prev); // optimistic
    try {
      const res = await fetch(`/api/agents/${slug}/bookmark`, { method: "POST" });
      if (res.ok) {
        const d = await res.json();
        setBookmarked(!!d.bookmarked);
      } else {
        setBookmarked(prev);
      }
    } catch {
      setBookmarked(prev);
    } finally {
      setBusy(false);
    }
  };

  const starValue = hover || myRating || 0;

  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-xl border border-gray-200 bg-white px-4 py-3">
      {/* Community average */}
      <div className="flex items-center gap-1.5">
        <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
        <span className="text-sm font-medium text-gray-700">{ratingCount > 0 ? avgRating.toFixed(1) : "—"}</span>
        <span className="text-xs text-gray-400">
          {ratingCount > 0 ? t("ratingsCount", { count: ratingCount }) : t("noRatings")}
        </span>
      </div>

      {/* The user's own rating */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-400">{t("yourRating")}</span>
        <div className="flex" onMouseLeave={() => setHover(0)}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              disabled={!signedIn || busy}
              onMouseEnter={() => signedIn && setHover(n)}
              onClick={() => rate(n)}
              className={signedIn ? "cursor-pointer p-0.5" : "cursor-not-allowed p-0.5"}
              aria-label={`${n}`}
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
        className={`ml-auto inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition ${
          bookmarked
            ? "border-purple-200 bg-purple-50 text-purple-700"
            : "border-gray-200 text-gray-600 hover:bg-gray-50"
        } disabled:opacity-50`}
      >
        <Bookmark className={`h-4 w-4 ${bookmarked ? "fill-purple-600 text-purple-600" : ""}`} />
        {bookmarked ? t("bookmarked") : t("bookmark")}
      </button>

      {!signedIn && <p className="w-full text-xs text-gray-400">{t("signInToRate")}</p>}
    </div>
  );
}
