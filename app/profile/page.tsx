"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { supabase } from "@/lib/supabase/client";
import { getProfile, upsertProfile } from "@/lib/db";
import type { Profile } from "@/lib/types";

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [form, setForm] = useState({ fullName: "", email: "" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const p = await getProfile(user.id);
      if (p) {
        setProfile(p);
        setForm({ fullName: p.fullName, email: p.email || user.email || "" });
      } else {
        setForm((f) => ({ ...f, email: user.email || "" }));
        setProfile({ id: user.id, role: "staff", employeeKey: null, fullName: "", email: user.email || "" });
      }
      setLoading(false);
    }
    load();
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!profile) return;
    setSaving(true);
    await upsertProfile({ ...profile, ...form });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <AppShell title="My Profile" subtitle="Keep your contact information up to date">
      {loading ? (
        <p className="muted">Loading…</p>
      ) : (
        <form onSubmit={handleSave} style={{ maxWidth: 600 }}>
          <div className="card">
            <h2 className="section-title">Profile</h2>
            <div className="grid">
              <div>
                <label style={{ fontSize: 13, color: "var(--muted)", display: "block", marginBottom: 4 }}>Full Name</label>
                <input value={form.fullName} onChange={set("fullName")} placeholder="Full Name" required />
              </div>
              <div>
                <label style={{ fontSize: 13, color: "var(--muted)", display: "block", marginBottom: 4 }}>Email</label>
                <input type="email" value={form.email} onChange={set("email")} placeholder="Email" />
              </div>
              <p style={{ fontSize: 12, color: "var(--muted)", margin: 0 }}>
                Phone, address, and other contact details are managed by your administrator.
              </p>
              <div className="action-row">
                <button type="submit" disabled={saving}>{saving ? "Saving…" : "Save Profile"}</button>
                {saved && <span style={{ color: "var(--olive)", fontSize: 14 }}>✓ Saved</span>}
              </div>
            </div>
          </div>
        </form>
      )}
    </AppShell>
  );
}
