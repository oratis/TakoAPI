import { createHash, randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { sendPasswordResetEmail, sendVerificationEmail } from "@/lib/email";
import { SITE_URL } from "@/lib/seo";

// Password-reset and email-verification tokens. Both reuse the VerificationToken
// table, which has existed since 0_init without a single reader or writer.
//
// Only a SHA-256 digest of the token is stored. The raw value is a bearer credential
// — whoever holds it can take over the account it names — and the table is visible to
// anything with a DB connection and lands in every backup, so the plaintext lives
// only in the mail we send. A plain digest (no bcrypt/argon) is the right choice
// here and not an oversight: unlike a password, the token is 256 bits of CSPRNG
// output, so there is no guessable input to slow an attacker down against.
//
// `identifier` carries the kind and the subject together ("reset:<userId>"), which
// keeps both flows in one table while making it impossible to redeem a verification
// token as a password reset — consume() requires the prefix to match.

const RESET_PREFIX = "reset:";
const VERIFY_PREFIX = "verify:";

/** Long enough to find the mail, short enough that an old inbox copy isn't a key. */
const RESET_TTL_MS = 60 * 60 * 1000;
/** 24 hours, matching the copy in sendVerificationEmail. */
const VERIFY_TTL_MS = 24 * 60 * 60 * 1000;

function digest(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

/**
 * Drop expired rows of every kind. Called on the way into both flows because nothing
 * else ever deletes from this table and there is no cron for it — without this a
 * table of dead credentials grows forever on a 10 GB shared-core instance.
 *
 * Cheap because migration 013 indexes "expires". Failures are swallowed: an
 * un-swept table is a housekeeping problem and must never fail somebody's reset.
 */
async function purgeExpired(): Promise<void> {
  try {
    await prisma.verificationToken.deleteMany({ where: { expires: { lt: new Date() } } });
  } catch {
    /* best effort */
  }
}

/** Mint a token for `identifier` and return the raw value — the only copy that exists. */
async function issue(identifier: string, ttlMs: number): Promise<string> {
  const rawToken = randomBytes(32).toString("hex");
  await prisma.verificationToken.create({
    data: { identifier, token: digest(rawToken), expires: new Date(Date.now() + ttlMs) },
  });
  return rawToken;
}

/** Claim a token of one kind, single-use. Returns the user it belongs to, or null. */
async function consume(rawToken: string, prefix: string): Promise<{ userId: string } | null> {
  await purgeExpired();
  const row = await prisma.verificationToken.findUnique({ where: { token: digest(rawToken) } });
  // A verification token must not work as a password reset (and vice versa), so a
  // row of the wrong kind is left in place rather than consumed.
  if (!row || !row.identifier.startsWith(prefix)) return null;

  // The delete IS the claim: two requests carrying the same token race here and only
  // the one that actually removed the row gets to act on it. Checking-then-deleting
  // in the other order would let both through.
  const { count } = await prisma.verificationToken.deleteMany({ where: { token: row.token } });
  if (count !== 1) return null;
  if (row.expires.getTime() <= Date.now()) return null;

  const userId = row.identifier.slice(prefix.length);
  return userId ? { userId } : null;
}

/**
 * Start a password reset for `email`, if that address belongs to an account that can
 * have a password.
 *
 * Resolves the same way in every case — unknown address, OAuth-only account, mail
 * sent — so the endpoint in front of it cannot be used to find out who has an
 * account here.
 */
export async function createResetToken(email: string): Promise<void> {
  await purgeExpired();

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, password: true },
  });

  // An account with no password (signed up through Google/Apple, or an agent
  // registration holding only an API key) is treated exactly like a missing one. It
  // has no credentials login to reset, and minting a password for it from a mail
  // link would add a way to sign in that the owner never asked for.
  if (!user?.email || !user.password) return;

  const identifier = `${RESET_PREFIX}${user.id}`;
  // Only the newest link works. Superseding outstanding tokens means a link that
  // leaked, or one an attacker requested, stops working the moment the real owner
  // asks again.
  await prisma.verificationToken.deleteMany({ where: { identifier } });

  const rawToken = await issue(identifier, RESET_TTL_MS);
  // sendPasswordResetEmail swallows its own failures and returns null when
  // RESEND_API_KEY is unset, so this never throws and never varies the outcome.
  await sendPasswordResetEmail(user.email, `${SITE_URL}/auth/reset?token=${rawToken}`);
}

/** Redeem a reset link. Single-use: a second attempt with the same token fails. */
export async function consumeResetToken(rawToken: string): Promise<{ userId: string } | null> {
  return consume(rawToken, RESET_PREFIX);
}

/**
 * Issue an email-verification token and mail the link.
 *
 * GROUNDWORK ONLY — nothing consumes these yet. The route that redeems the link
 * (/api/auth/verify) is not part of this change, so until it ships the mail's button
 * leads nowhere. Login does not depend on it either way: `User.emailVerified` gates
 * nothing in authorize() or in any route, and making it a gate would lock out every
 * account created before this existed. consumeVerificationToken() below is the whole
 * server side of what remains.
 */
export async function sendEmailVerification(userId: string, email: string): Promise<void> {
  const rawToken = await issue(`${VERIFY_PREFIX}${userId}`, VERIFY_TTL_MS);
  await sendVerificationEmail(email, `${SITE_URL}/api/auth/verify?token=${rawToken}`);
}

/** Redeem an email-verification link. Single-use; the caller sets `emailVerified`. */
export async function consumeVerificationToken(rawToken: string): Promise<{ userId: string } | null> {
  return consume(rawToken, VERIFY_PREFIX);
}
