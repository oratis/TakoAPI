// Instant loading state for every page under the locale layout: the header and
// footer stay put while the page's server data streams in, instead of the
// navigation appearing to do nothing for the ~1 s a cold render takes.
export default function Loading() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10" aria-busy="true" aria-live="polite">
      <div className="h-8 w-64 rounded-lg bg-gray-100 animate-pulse" />
      <div className="mt-3 h-4 w-96 max-w-full rounded bg-gray-100 animate-pulse" />
      <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-36 rounded-xl border border-gray-100 bg-gray-50 animate-pulse" />
        ))}
      </div>
    </div>
  );
}
