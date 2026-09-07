import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import Google from "next-auth/providers/google";
import Apple from "next-auth/providers/apple";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { createHash } from "crypto";
import type { NextRequest } from "next/server";
import { prisma } from "./prisma";
import { checkRateLimit } from "./ratelimit";

// checkRateLimit only ever reads `req.headers.get(...)` (through extractClientIp),
// but it is typed for the NextRequest the API routes hand it. NextAuth gives
// `authorize` a plain Request, so the headers are passed through under that type
// instead of loosening the shared limiter for one caller.
function asRateLimitRequest(request: Request | undefined): NextRequest {
  return { headers: request?.headers ?? new Headers() } as NextRequest;
}

/**
 * Stable bucket id for an account, insensitive to how the address was typed.
 *
 * Hashed because rate-limit buckets are rows in RateLimitBucket that outlive the
 * request: every failed login would otherwise leave the attempted address sitting in
 * a table nothing ever cleans out except by expiry.
 */
function loginBucketId(email: string): string {
  return createHash("sha256").update(email.trim().toLowerCase()).digest("hex").slice(0, 16);
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
    Apple({
      clientId: process.env.APPLE_CLIENT_ID,
      clientSecret: process.env.APPLE_CLIENT_SECRET!,
      profile(profile) {
        return {
          id: profile.sub,
          name: profile.name
            ? `${profile.name.firstName ?? ""} ${profile.name.lastName ?? ""}`.trim()
            : profile.email?.split("@")[0],
          email: profile.email,
        };
      },
    }),
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, request) {
        if (!credentials?.email || !credentials?.password) return null;
        const email = String(credentials.email);

        // The only brute-force budget this login has. /api/* is excluded from
        // proxy.ts's matcher and NextAuth owns the route, so nothing upstream ever
        // saw these POSTs: password guessing against a known address was free.
        //
        // `perIp: false` is load-bearing. checkRateLimit otherwise appends
        // extractClientIp(), which reads the FIRST element of X-Forwarded-For — a
        // value the caller writes, since Cloud Run appends to that header rather
        // than replacing it. Bucketing on it would let a single host rotate the
        // header and mint a fresh budget per request, i.e. no limit at all.
        //
        // But a per-account counter is a counter a *stranger* controls: they only
        // need the email address. Refusing on it outright — as this did — hands
        // anyone an account-lockout lever, and because the refusal is deliberately
        // indistinguishable from a wrong password, the victim cannot even tell why
        // they are locked out. /api/auth/forgot is budgeted per account too, so the
        // documented self-recovery path is closed off by the same attacker.
        //
        // So the budget gates *guessing*, not *the owner*: over budget, the password
        // is still verified and a correct one is still admitted. A wrong password is
        // refused whether or not there is budget left, which is what actually stops
        // a grinder. `hardMax` exists only to bound the bcrypt cost of a flood; it is
        // set far above any human's retry rate, and is the one remaining (expensive,
        // sustained) way to hold an account shut.
        const bucketId = loginBucketId(email);
        const window = 15 * 60 * 1000;
        const burst = await checkRateLimit(asRateLimitRequest(request), {
          key: `login-burst:${bucketId}`,
          windowMs: window,
          max: 60,
          perIp: false,
        });
        if (!burst.ok) {
          console.warn("[auth] credentials login flood — refused before compare", {
            bucketId,
            retryAfterMs: burst.retryAfterMs,
          });
          return null;
        }
        const rl = await checkRateLimit(asRateLimitRequest(request), {
          key: `login:${bucketId}`,
          windowMs: window,
          max: 8,
          perIp: false,
        });

        const user = await prisma.user.findUnique({
          where: { email },
        });

        if (!user || !user.password) return null;

        const isValid = await bcrypt.compare(
          credentials.password as string,
          user.password
        );
        // Wrong password: refused, budget or no budget. Returning null surfaces the
        // same "invalid email or password" the UI shows anyway — a distinct "too many
        // attempts" would tell a grinder when to back off and confirm the account
        // exists.
        if (!isValid) return null;
        if (!rl.ok) {
          // Correct password over budget: admit them, and say so, because a sustained
          // stream of these against one account is what being ground on looks like.
          console.warn("[auth] correct password admitted over the login budget", {
            bucketId,
            retryAfterMs: rl.retryAfterMs,
          });
        }

        return { id: user.id, name: user.name, email: user.email, image: user.image };
      },
    }),
  ],
  session: { strategy: "jwt" },
  pages: {
    signIn: "/auth/signin",
  },
  callbacks: {
    async jwt({ token, user, trigger }) {
      if (user) {
        token.id = user.id;
        // Fetch role from DB
        const dbUser = await prisma.user.findUnique({
          where: { id: user.id },
          select: { role: true },
        });
        token.role = dbUser?.role || "user";
      }
      // Refresh role on session update
      if (trigger === "update" && token.id) {
        const dbUser = await prisma.user.findUnique({
          where: { id: token.id as string },
          select: { role: true },
        });
        token.role = dbUser?.role || "user";
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.id) {
        session.user.id = token.id as string;
        (session.user as { role?: string }).role = (token.role as string) || "user";
      }
      return session;
    },
  },
});
