import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Kundenmarkt-Scout | HYDAC",
  description: "Öffentliche Marktsignale, belegte Unternehmenszahlen und klare Gesprächsansätze. Dein Portfolio für unterwegs.",
  applicationName: "Kundenmarkt-Scout",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Markt-Scout", statusBarStyle: "default" },
  icons: {
    icon: "/icons/icon-192.png",
    shortcut: "/icons/icon-192.png",
    apple: "/icons/apple-touch-icon.png",
  },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#102e4a" };

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="de">
      <body><a className="skip-link" href="#main-content">Zum Inhalt springen</a>{children}</body>
    </html>
  );
}
