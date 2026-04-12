import "./globals.css";
import type { ReactNode } from "react";
import { AuthProvider } from "../components/layout/auth-provider";

export const metadata = { title: "Amplified Staff Portal", description: "Staff timesheet portal" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
