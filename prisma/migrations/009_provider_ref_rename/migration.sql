-- Rename the ledger's external payment reference from Stripe-specific to
-- provider-agnostic (holds the PayPal order/capture id).
ALTER TABLE "LedgerEntry" RENAME COLUMN "stripeRef" TO "providerRef";
