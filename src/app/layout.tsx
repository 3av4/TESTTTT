import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "@/components/providers";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { MobileNav } from "@/components/layout/MobileNav";
import { AnnouncementBar } from "@/components/layout/AnnouncementBar";

export const metadata: Metadata = {
  title: {
    default: "BitPoin (BTP) — عملة رقمية مجتمعية",
    template: "%s | BitPoin",
  },
  description:
    "BitPoin (BTP): عملة رقمية مجتمعية متكاملة — راتب يومي، ألعاب ومراهنات، بنك بفائدة، متجر ألقاب، وإحالات. نفس الحساب في الموقع وبوت تلجرام.",
  applicationName: "BitPoin",
  keywords: ["BitPoin", "BTP", "عملة رقمية", "تلجرام", "بوت", "عملات", "مكافآت", "ألعاب"],
  authors: [{ name: "BitPoin Team" }],
  openGraph: {
    title: "BitPoin (BTP)",
    description: "عملة رقمية مجتمعية: راتب يومي، ألعاب، بنك ومتجر — بموقع وبوت تلجرام.",
    type: "website",
    locale: "ar_DZ",
    siteName: "BitPoin",
  },
  twitter: {
    card: "summary_large_image",
    title: "BitPoin (BTP)",
    description: "عملة رقمية مجتمعية بموقع وبوت تلجرام متكاملين.",
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#05070d",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  colorScheme: "dark",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700;800;900&display=swap"
        />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <meta name="telegram:channel" content="@Bitpoin_bot" />
      </head>
      <body className="min-h-screen antialiased">
        <Providers>
          <div className="relative flex min-h-screen flex-col">
            <AnnouncementBar />
            <SiteHeader />
            <main className="flex-1 pb-24 md:pb-0">{children}</main>
            <SiteFooter />
            <MobileNav />
          </div>
        </Providers>
      </body>
    </html>
  );
}
