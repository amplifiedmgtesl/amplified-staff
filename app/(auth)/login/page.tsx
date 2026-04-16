"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { getProfile, upsertProfile } from "@/lib/db";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password });

    if (signInError || !data.user) {
      setError(signInError?.message ?? "Sign in failed.");
      setLoading(false);
      return;
    }

    const user = data.user;
    const profile = await getProfile(user.id);

    // If a profile exists but the role is admin, block them
    if (profile && profile.role !== "staff") {
      await supabase.auth.signOut();
      setError("This portal is for staff only. Please use the Operations Suite to sign in.");
      setLoading(false);
      return;
    }

    // No profile yet — create one with role='staff'
    if (!profile) {
      await upsertProfile({
        id: user.id,
        role: "staff",
        employeeKey: null,
        fullName: "",
        email: user.email ?? "",
      });
    }

    window.location.href = "/dashboard";
  }

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
      <form onSubmit={handleSubmit} className="card" style={{ width: "100%", maxWidth: 420 }}>
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <img src="/branding/client-logo.png" alt="Amplified" style={{ maxHeight: 80, width: "auto" }} onError={(e) => (e.currentTarget.style.display = "none")} />
        </div>
        <h1 className="page-title" style={{ fontSize: 30, marginBottom: 4 }}>Staff Portal</h1>
        <p className="page-subtitle" style={{ marginBottom: 20 }}>Amplified Entertainment</p>
        <div className="grid">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            required
            autoComplete="email"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            required
            autoComplete="current-password"
          />
          {error && <div style={{ color: "#c0392b", fontSize: 14 }}>{error}</div>}
          <button disabled={loading}>{loading ? "Signing in…" : "Sign in"}</button>
        </div>
      </form>
    </div>
  );
}
