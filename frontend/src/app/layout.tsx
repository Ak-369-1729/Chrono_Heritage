import type { Metadata, Viewport } from "next";
import "@fontsource-variable/fraunces/full.css";
import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/600.css";
import "./globals.css";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteNav } from "@/components/SiteNav";
import { AuthProvider } from "@/lib/auth";

export const metadata: Metadata = {
  title: { default: "ChronoHeritage — Reading the sky through the memory of stone", template: "%s | ChronoHeritage" },
  description:
    "A scientific research platform for investigating possible relationships between historical sites, astronomical orientations, chronologies and the observable sky, with every source and uncertainty in view.",
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = { themeColor: "#0a0d12", colorScheme: "dark", viewportFit: "cover" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          <SiteNav />
          <div id="main" tabIndex={-1} className="outline-none">
            {children}
          </div>
          <SiteFooter />
        </AuthProvider>
      </body>
    </html>
  );
}
