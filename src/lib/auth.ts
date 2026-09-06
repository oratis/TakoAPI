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
        // 8 tries per 15 minutes per (account, client IP), checked before the user
        // lookup so a flood costs neither a query nor a bcrypt compare.
        //
        // The IP half is caller-controlled (see extractClientIp), so this raises the
        // cost of grinding one account from one source; it is not, and cannot be, a
        // defence against a spray distributed over many addresses.
        const bucketId = loginBucketId(email);
        const rl = await checkRateLimit(asRateLimitRequest(request), {
          key: `login:${bucketId}`,
          windowMs: 15 * 60 * 1000,
          max: 8,
        });
        if (!rl.ok) {
          console.warn("[auth] credentials login rate-limited", {
            bucketId,
            retryAfterMs: rl.retryAfterMs,
          });
          // Returning null surfaces the same "invalid email or password" the UI
          // already shows for a wrong password. A distinct "too many attempts" would
          // tell a grinder exactly when to back off, and confirm the account exists.
          return null;
        }

        const user = await prisma.user.findUnique({
          where: { email },
        });

        if (!user || !user.password) return null;

        const isValid = await bcrypt.compare(
          credentials.password as string,
          user.password
        );
        if (!isValid) return null;

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
