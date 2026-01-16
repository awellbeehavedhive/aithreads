import type { Metadata } from "next";
import "./globals.css";
import GoogleAnalytics from "@/components/google-analytics";
import { AdSenseProvider } from "@/components/ads";
import { KidsLayout } from "@/components/kids-layout";
import { getMode } from "@/lib/get-mode";

// Temporarily using system fonts to resolve build issues
// TODO: Re-enable Google Fonts when TLS issues are resolved
const geistSans = {
  variable: "--font-geist-sans",
};

const geistMono = {
  variable: "--font-geist-mono",
};

export const metadata: Metadata = {
  title: "ThreadBot | AI-Powered News Analysis",
  description: "Get AI-powered news briefings with verified facts, primary source citations, and deep analysis. News from top sources, ranked by quality.",
  icons: {
    icon: '/favicon.ico',
    apple: '/apple-touch-icon.png',
  },
  openGraph: {
    title: "ThreadBot | AI-Powered News Analysis",
    description: "Get AI-powered news briefings with verified facts, primary source citations, and deep analysis.",
    type: 'website',
    siteName: 'ThreadBot',
    locale: 'en_US',
    images: [
      {
        url: '/logo.png',
        width: 512,
        height: 512,
        alt: 'ThreadBot Logo',
      },
    ],
  },
  twitter: {
    card: 'summary',
    title: "ThreadBot | AI-Powered News Analysis",
    description: "Get AI-powered news briefings with verified facts, primary source citations, and deep analysis.",
    images: ['/logo.png'],
  },
  metadataBase: new URL(process.env.NEXT_PUBLIC_BASE_URL || 'https://aithreadbot.com'),
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const mode = await getMode();

  return (
    <html lang="en">
      <head>
        <GoogleAnalytics />
        <AdSenseProvider />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <KidsLayout mode={mode}>
          {children}
        </KidsLayout>
      </body>
    </html>
  );
}
