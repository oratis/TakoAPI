import { notFound } from "next/navigation";

// Catch-all under the locale root. Any path that no real page claims lands here
// and is turned into a 404 rendered by ../not-found.tsx — inside the branded
// layout — instead of the framework's bare default. (The root layout is the
// dynamic [locale] segment, so a top-level app/not-found.tsx cannot be composed
// with it; this is the pattern next-intl documents.)
export default function CatchAllPage() {
  notFound();
}
