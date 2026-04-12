"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

const nav = [
  { href: "/dashboard",      icon: "🏠", label: "Home" },
  { href: "/schedule",       icon: "📅", label: "Schedule" },
  { href: "/timesheets",     icon: "⏱️", label: "Timesheets" },
  { href: "/timesheets/new", icon: "➕", label: "Submit" },
  { href: "/profile",        icon: "👤", label: "Profile" },
];

export function AppShell({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  const pathname = usePathname();

  async function handleSignOut() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  return (
    <div className="layout">
      {/* ── Desktop sidebar ── */}
      <aside className="sidebar">
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <img
            src="/branding/client-logo.png"
            alt="Amplified"
            className="sidebar-logo"
            onError={(e) => (e.currentTarget.style.display = "none")}
          />
          <div className="brand-sub">Staff Portal</div>
        </div>

        {nav.map(({ href, icon, label }) => (
          <Link
            key={href}
            href={href}
            className={`nav-link${pathname === href || (href !== "/dashboard" && pathname.startsWith(href)) ? " active" : ""}`}
          >
            <span style={{ fontSize: 18, marginRight: 10 }}>{icon}</span>
            {label === "Submit" ? "Submit Timesheet" : `My ${label === "Home" ? "" : label}`.trim() || "Dashboard"}
          </Link>
        ))}

        <div style={{ marginTop: "auto", paddingTop: 24 }}>
          <button
            onClick={handleSignOut}
            style={{ width: "100%", background: "transparent", border: "1px solid #555", color: "#999", borderRadius: 6, padding: "8px 12px", cursor: "pointer", fontSize: 13 }}
          >
            Sign out
          </button>
        </div>
      </aside>

      {/* ── Main content ── */}
      <main className="main">
        <div className="topbar">
          <img
            src="/branding/client-logo.png"
            alt="Logo"
            className="header-logo"
            onError={(e) => (e.currentTarget.style.display = "none")}
          />
          <div>
            <h1 className="page-title">{title}</h1>
            {subtitle && <div className="page-subtitle">{subtitle}</div>}
          </div>
        </div>
        {children}
      </main>

      {/* ── Mobile bottom nav ── */}
      <nav className="bottom-nav">
        {nav.map(({ href, icon, label }) => {
          const isActive = pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              className={`bottom-nav-link${isActive ? " active" : ""}`}
            >
              <span className="nav-icon">{icon}</span>
              {label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
