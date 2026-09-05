import { createNavigation } from "next-intl/navigation";
import { routing } from "./routing";

// Locale-aware navigation primitives. Use these instead of `next/link` and
// `next/navigation` for internal links so the active locale prefix is applied
// automatically (e.g. on `/zh`, `<Link href="/agents">` -> `/zh/agents`).
export const { Link, redirect, usePathname, useRouter, getPathname } = createNavigation(routing);
