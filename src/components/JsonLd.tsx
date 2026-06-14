// Renders a JSON-LD structured-data block. Server-safe; the payload is
// JSON.stringify'd so it never injects executable markup.
export function JsonLd({ data }: { data: object }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
