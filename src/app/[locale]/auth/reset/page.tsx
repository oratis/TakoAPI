import { connection } from "next/server";
import ResetPasswordForm from "./reset-form";

// Server Component so `connection()` can tie this route to the incoming request.
// The form reads the query string with useSearchParams, which during a static
// prerender would otherwise need a Suspense boundary — and the boundary this page
// used had `fallback={null}`, so the prerendered HTML was an empty <main>: a blank
// first paint, and nothing at all without JavaScript. Auth pages have no SEO value
// and touch no database, so rendering per request costs nothing.
export default async function ResetPasswordPage() {
  await connection();
  return <ResetPasswordForm />;
}
