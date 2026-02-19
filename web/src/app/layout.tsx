import type { Metadata } from "next";
import { Manrope, Poppins } from "next/font/google";
import "./globals.css";

const poppins = Poppins({
  subsets: ["latin"],
  variable: "--font-poppins",
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "TestKOKO — Secure CBT, Reinvented",
  description:
    "Mobile-first browser-based examination platform with military-grade anti-cheat detection, live monitoring, and auto-grading. Built for institutions that demand integrity.",
  openGraph: {
    title: "TestKOKO — Secure CBT, Reinvented",
    description:
      "Mobile-first browser-based examination platform with military-grade anti-cheat detection.",
    siteName: "TestKOKO",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "TestKOKO — Secure CBT, Reinvented",
    description:
      "Mobile-first browser-based examination platform with military-grade anti-cheat detection.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${poppins.variable} ${manrope.variable}`}>
      <body className="app-body antialiased">{children}</body>
    </html>
  );
}
