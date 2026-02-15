import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { Providers } from "@/app/providers";
import { runStartupEnvValidation } from "@/lib/env-validation";

export const metadata: Metadata = {
  title: "Faypath | Merit-Based Employment Platform",
  description:
    "Faypath is a merit-first employment platform blending job discovery with professional reputation."
};

export default function RootLayout({
  children
}: Readonly<{
  children: ReactNode;
}>) {
  runStartupEnvValidation();

  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
