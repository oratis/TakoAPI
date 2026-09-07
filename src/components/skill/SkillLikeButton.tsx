"use client";

import { useState } from "react";
import { Heart } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { fetchJson } from "@/hooks/useAsync";

// The one interactive control in the detail page header.
//
// Two bugs come from the state it did not have: it always mounted as "not liked",
// so a visitor who had already liked the skill un-liked it on their first click and
// watched the count go to -1; and the signed-out branch did
// `window.location.href = "/auth/signin"`, which dropped both the locale prefix and
// the way back. The server now passes the real state in, and signed-out visitors
// get a locale-aware link that returns them here.
export function SkillLikeButton({
  idOrSlug,
  initialLiked,
  initialCount,
  signedIn,
}: {
  idOrSlug: string;
  initialLiked: boolean;
  initialCount: number;
  signedIn: boolean;
}) {
  const t = useTranslations("SkillDetail");
  const pathname = usePathname();
  const [liked, setLiked] = useState(initialLiked);
  const [count, setCount] = useState(initialCount);
  const [busy, setBusy] = useState(false);

  const shape = "inline-flex items-center gap-1.5 rounded-full border px-4 py-2 text-sm font-medium transition-colors";
  const tone = liked
    ? "border-red-200 bg-red-50 text-red-600"
    : "border-gray-200 bg-gray-50 text-gray-600 hover:bg-red-50 hover:text-red-600";

  const toggle = async () => {
    if (busy) return;
    setBusy(true);
    const wasLiked = liked;
    const wasCount = count;
    setLiked(!wasLiked);
    setCount(wasCount + (wasLiked ? -1 : 1)); // optimistic
    try {
      const res = await fetchJson<{ liked: boolean }>(`/api/skills/${encodeURIComponent(idOrSlug)}/like`, {
        method: "POST",
      });
      // Trust the server's answer rather than the guess, so a request that raced
      // another tab still lands on the right count.
      setLiked(res.liked);
      setCount(wasCount + (res.liked ? 1 : 0) - (wasLiked ? 1 : 0));
    } catch {
      setLiked(wasLiked);
      setCount(wasCount);
    } finally {
      setBusy(false);
    }
  };

  if (!signedIn) {
    return (
      <Link
        href={{ pathname: "/auth/signin", query: { callbackUrl: pathname } }}
        className={`${shape} ${tone}`}
      >
        <Heart className="h-4 w-4" aria-hidden />
        {t("likes", { count })}
        {/* Appended rather than an aria-label, which would hide the count. */}
        <span className="sr-only">{t("signInToLike")}</span>
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      aria-pressed={liked}
      className={`${shape} ${tone} disabled:opacity-60`}
    >
      <Heart className={`h-4 w-4 ${liked ? "fill-current" : ""}`} aria-hidden />
      {t("likes", { count })}
    </button>
  );
}
