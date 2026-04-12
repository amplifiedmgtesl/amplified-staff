"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

export function AuthProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isLoginPage = pathname === "/login";
  const [status, setStatus] = useState<"checking" | "ready" | "unauthenticated">("checking");

  useEffect(() => {
    if (isLoginPage) { setStatus("ready"); return; }

    supabase.auth.getSession().then(({ data: { session } }) => {
      setStatus(session ? "ready" : "unauthenticated");
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") window.location.href = "/login";
    });

    return () => subscription.unsubscribe();
  }, [isLoginPage]);

  if (isLoginPage) return <>{children}</>;

  if (status === "unauthenticated") {
    if (typeof window !== "undefined") window.location.href = "/login";
    return null;
  }

  if (status === "checking") {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", gap: 16, fontFamily: "sans-serif", color: "#555", flexDirection: "column" }}>
        <div style={{ width: 36, height: 36, border: "3px solid #e0e0e0", borderTopColor: "#bb9a54", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        <span style={{ fontSize: 14 }}>Loading Staff Portal…</span>
      </div>
    );
  }

  return <>{children}</>;
}
