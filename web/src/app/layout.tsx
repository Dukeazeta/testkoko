import type { Metadata } from "next";
import { DM_Sans, IBM_Plex_Mono, Outfit } from "next/font/google";

import Providers from "./providers";
import "./globals.css";

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
  display: "swap",
  weight: ["400", "500", "700"],
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  display: "swap",
  weight: ["400", "500"],
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  variable: "--font-ibm-plex",
  display: "swap",
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "TestKOKO",
  description: "Simple web exams for lecturers and candidates.",
  openGraph: {
    title: "TestKOKO",
    description: "Simple web exams for lecturers and candidates.",
    siteName: "TestKOKO",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "TestKOKO",
    description: "Simple web exams for lecturers and candidates.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${outfit.variable} ${dmSans.variable} ${ibmPlexMono.variable}`}>
      <body className="app-body antialiased selection:bg-black selection:text-white">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
