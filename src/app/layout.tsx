import type { Metadata, Viewport } from "next";
import { JobProvider } from "@/components/JobProvider";
import { PwaSetup } from "@/components/PwaSetup";
import "./globals.css";

export const metadata: Metadata = {
  title: "BARDEN LineOS",
  description: "Mark work prints, split unit codes across sheets, export clean sheets.",
  applicationName: "LineOS",
  appleWebApp: { capable: true, title: "LineOS", statusBarStyle: "default" },
  icons: { icon: "/icon-192.png", apple: "/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0f172a",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh bg-slate-100 text-slate-900 antialiased">
        <PwaSetup />
        <JobProvider>{children}</JobProvider>
      </body>
    </html>
  );
}
