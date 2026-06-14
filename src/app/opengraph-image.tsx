import { ImageResponse } from "next/og";
import { SITE_NAME, SITE_TAGLINE } from "@/lib/seo";

export const alt = `${SITE_NAME} — ${SITE_TAGLINE}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Code-generated default social card. Per-route files can override this later.
export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "90px",
          background: "linear-gradient(135deg, #7c3aed 0%, #3b82f6 100%)",
          color: "white",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", fontSize: 40, letterSpacing: -1, opacity: 0.92 }}>
          {SITE_NAME}
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 96,
            fontWeight: 800,
            lineHeight: 1.02,
            marginTop: 28,
            letterSpacing: -3,
          }}
        >
          One API to access all agents
        </div>
        <div style={{ display: "flex", fontSize: 34, opacity: 0.9, marginTop: 30 }}>
          Discover & invoke AI agents · an OpenRouter for agents
        </div>
        <div style={{ display: "flex", fontSize: 30, opacity: 0.85, marginTop: 48 }}>
          takoapi.com
        </div>
      </div>
    ),
    { ...size }
  );
}
