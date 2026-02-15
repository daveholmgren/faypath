import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import LinkedIn from "next-auth/providers/linkedin";
import type { Adapter } from "next-auth/adapters";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { compare } from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { ensureSeedData } from "@/lib/seed";

type AppUserRole = "CANDIDATE" | "EMPLOYER" | "ADMIN";

function toAppUserRole(role: string): AppUserRole {
  return role === "EMPLOYER" || role === "ADMIN" ? role : "CANDIDATE";
}

const providers = [
  Credentials({
    name: "Email + Password",
    credentials: {
      email: { label: "Email", type: "email" },
      password: { label: "Password", type: "password" }
    },
    async authorize(credentials, _request) {
      await ensureSeedData();
      const email =
        typeof credentials?.email === "string" ? credentials.email.trim().toLowerCase() : "";
      const password = typeof credentials?.password === "string" ? credentials.password : "";
      if (!email || !password) return null;

      const user = await prisma.user.findUnique({ where: { email } });
      if (!user?.passwordHash) return null;

      const ok = await compare(password, user.passwordHash);
      if (!ok) return null;

      return {
        id: user.id,
        email: user.email,
        name: user.name,
        role: toAppUserRole(user.role)
      };
    }
  }),
  ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
    ? [
        Google({
          clientId: process.env.GOOGLE_CLIENT_ID,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET
        })
      ]
    : []),
  ...(process.env.LINKEDIN_CLIENT_ID && process.env.LINKEDIN_CLIENT_SECRET
    ? [
        LinkedIn({
          clientId: process.env.LINKEDIN_CLIENT_ID,
          clientSecret: process.env.LINKEDIN_CLIENT_SECRET
        })
      ]
    : [])
];

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma) as Adapter,
  trustHost: true,
  session: { strategy: "jwt" },
  pages: { signIn: "/sign-in" },
  providers,
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = toAppUserRole(user.role ?? "CANDIDATE");
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub ?? "";
        session.user.role =
          token.role === "EMPLOYER" || token.role === "ADMIN" ? token.role : "CANDIDATE";
      }
      return session;
    }
  }
});
