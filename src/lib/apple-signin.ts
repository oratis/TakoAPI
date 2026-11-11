/** Check only expiry of our configured Apple client credential (never a user token). */
export function appleSignInAvailable() {
  const jwt = process.env.APPLE_CLIENT_SECRET;
  if (!jwt || !process.env.APPLE_CLIENT_ID) return false;
  try {
    const parts = jwt.split(".");
    if (parts.length !== 3) return false;
    const { exp } = JSON.parse(Buffer.from(parts[1], "base64url").toString());
    return typeof exp === "number" && exp > Date.now() / 1000;
  } catch {
    return false;
  }
}
