// PayPal Orders v2 client for prepaid-credit top-ups. Server-side only.
//
// Configured via PAYPAL_CLIENT_ID + PAYPAL_CLIENT_SECRET. PAYPAL_ENV=live hits the
// live API; anything else (default) uses sandbox. Inert until creds exist
// (`paypalConfigured()` === false), so the top-up UI/routes stay disabled and the
// dashboard keeps showing "coming soon" until you drop credentials in.

const LIVE = "https://api-m.paypal.com";
const SANDBOX = "https://api-m.sandbox.paypal.com";

export function paypalBaseUrl(): string {
  return process.env.PAYPAL_ENV === "live" ? LIVE : SANDBOX;
}

export function paypalConfigured(): boolean {
  return !!(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET);
}

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt > now + 60_000) return cachedToken.token;
  const id = process.env.PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_CLIENT_SECRET;
  if (!id || !secret) throw new Error("PayPal is not configured");
  const res = await fetch(`${paypalBaseUrl()}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) throw new Error(`PayPal auth failed: HTTP ${res.status}`);
  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { token: data.access_token, expiresAt: now + data.expires_in * 1000 };
  return data.access_token;
}

export type CreatedOrder = { id: string; approveUrl: string };

// Create a one-time CAPTURE order for a USD top-up. Returns the order id and the
// PayPal approval URL to redirect the buyer to. `reference` is stored as the
// order's custom_id (we pass the userId) for server-side cross-checking.
export async function createOrder(params: {
  amountUsd: number;
  returnUrl: string;
  cancelUrl: string;
  reference?: string;
}): Promise<CreatedOrder> {
  const token = await getAccessToken();
  const value = params.amountUsd.toFixed(2);
  const res = await fetch(`${paypalBaseUrl()}/v2/checkout/orders`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [
        {
          amount: { currency_code: "USD", value },
          custom_id: params.reference,
          description: "TakoAPI credit top-up",
        },
      ],
      application_context: {
        brand_name: "TakoAPI",
        user_action: "PAY_NOW",
        shipping_preference: "NO_SHIPPING",
        return_url: params.returnUrl,
        cancel_url: params.cancelUrl,
      },
    }),
  });
  if (!res.ok) throw new Error(`PayPal create order failed: HTTP ${res.status}`);
  const data = (await res.json()) as { id: string; links?: Array<{ rel: string; href: string }> };
  const approve = data.links?.find((l) => l.rel === "approve" || l.rel === "payer-action");
  if (!data.id || !approve) throw new Error("PayPal create order: missing approval link");
  return { id: data.id, approveUrl: approve.href };
}

export type CaptureResult = {
  status: string;
  captureId: string | null;
  amountUsd: number;
  customId: string | null;
};

// Capture an approved order. Returns the capture status ("COMPLETED" on success),
// the capture id, the captured USD amount, and the order's custom_id (the userId
// we set at creation) so callers can attribute the credit reliably.
export async function captureOrder(orderId: string): Promise<CaptureResult> {
  const token = await getAccessToken();
  const res = await fetch(
    `${paypalBaseUrl()}/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    }
  );
  if (!res.ok) throw new Error(`PayPal capture failed: HTTP ${res.status}`);
  const data = (await res.json()) as {
    status: string;
    purchase_units?: Array<{
      custom_id?: string;
      payments?: { captures?: Array<{ id: string; custom_id?: string; amount: { value: string } }> };
    }>;
  };
  const unit = data.purchase_units?.[0];
  const cap = unit?.payments?.captures?.[0];
  return {
    status: data.status,
    captureId: cap?.id ?? null,
    amountUsd: cap ? Number(cap.amount.value) : 0,
    customId: cap?.custom_id ?? unit?.custom_id ?? null,
  };
}

export function paypalWebhookConfigured(): boolean {
  return !!process.env.PAYPAL_WEBHOOK_ID;
}

export type PaypalWebhookHeaders = {
  authAlgo: string;
  certUrl: string;
  transmissionId: string;
  transmissionSig: string;
  transmissionTime: string;
};

// Verify a webhook delivery is genuinely from PayPal via the
// verify-webhook-signature API (needs PAYPAL_WEBHOOK_ID). Fails closed: returns
// false if the webhook id isn't set, headers are missing, or verification fails.
export async function verifyWebhookSignature(h: PaypalWebhookHeaders, event: unknown): Promise<boolean> {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  if (!webhookId) return false;
  if (!h.transmissionId || !h.transmissionSig || !h.certUrl) return false;
  try {
    const token = await getAccessToken();
    const res = await fetch(`${paypalBaseUrl()}/v1/notifications/verify-webhook-signature`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        auth_algo: h.authAlgo,
        cert_url: h.certUrl,
        transmission_id: h.transmissionId,
        transmission_sig: h.transmissionSig,
        transmission_time: h.transmissionTime,
        webhook_id: webhookId,
        webhook_event: event,
      }),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { verification_status?: string };
    return data.verification_status === "SUCCESS";
  } catch {
    return false;
  }
}
