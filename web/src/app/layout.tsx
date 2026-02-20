import type { Metadata } from "next";
import { Syne, Manrope, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import Providers from "./providers";

const syne = Syne({
  subsets: ["latin"],
  variable: "--font-syne",
  display: "swap",
  weight: ["400", "500", "600", "700", "800"],
});

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "TestKOKO — Secure CBT, Reinvented",
  description:
    "Browser-based examination platform with anti-cheat detection, live monitoring, and auto-grading. Built for institutions that demand integrity.",
  openGraph: {
    title: "TestKOKO — Secure CBT, Reinvented",
    description:
      "Browser-based examination platform with anti-cheat detection.",
    siteName: "TestKOKO",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "TestKOKO — Secure CBT, Reinvented",
    description:
      "Browser-based examination platform with anti-cheat detection.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${syne.variable} ${manrope.variable} ${jetbrains.variable}`}>
      <body className="app-body antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
