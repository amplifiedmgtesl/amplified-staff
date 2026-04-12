import "./globals.css";
import type { ReactNode } from "react";
import { AuthProvider } from "../components/layout/auth-provider";

export const metadata = {
  title: "Amplified Staff Portal",
  description: "Staff timesheet portal",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Staff Portal" },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#15110d",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
