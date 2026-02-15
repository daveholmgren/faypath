import { DefaultSession } from "next-auth";

type AppUserRole = "CANDIDATE" | "EMPLOYER" | "ADMIN";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: AppUserRole;
    } & DefaultSession["user"];
  }

  interface User {
    role: AppUserRole;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: AppUserRole;
  }
}
