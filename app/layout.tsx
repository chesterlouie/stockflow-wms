import type { Metadata } from "next";
import "./globals.css";
import "./action-buttons.css";
import "./mobile.css";
import MobileRuntime from "./components/MobileRuntime";

export const metadata: Metadata = {
  title: { default: "Warevanta WMS", template: "%s · Warevanta" },
  description: "Local-first warehouse management for growing businesses.",
  icons: { icon: "/favicon.svg" },
  manifest: "/manifest.webmanifest",
  themeColor: "#087f5b",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}<MobileRuntime/></body></html>;
}
