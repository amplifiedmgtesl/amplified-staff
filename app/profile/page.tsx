"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { supabase } from "@/lib/supabase/client";
import { getProfile, getEmployee } from "@/lib/db";
import type { Profile, Employee } from "@/lib/types";

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 15 }}>{value || <span style={{ color: "var(--muted)" }}>—</span>}</div>
    </div>
  );
}

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const p = await getProfile(user.id);
      if (p) {
        setProfile(p);
        if (p.employeeKey) {
          const emp = await getEmployee(p.employeeKey);
          setEmployee(emp);
        }
      }
      setLoading(false);
    }
    load();
  }, []);

  return (
    <AppShell title="My Profile" subtitle="Contact your administrator to update this information">
      {loading ? (
        <p className="muted">Loading…</p>
      ) : (
        <div style={{ maxWidth: 600 }}>
          <div className="card">
            <h2 className="section-title">Account</h2>
            <div className="grid">
              <Field label="Full Name" value={profile?.fullName ?? ""} />
              <Field label="Email" value={profile?.email ?? ""} />
            </div>
          </div>

          {employee && (
            <div className="card" style={{ marginTop: 16 }}>
              <h2 className="section-title">Contact Information</h2>
              <div className="grid">
                <div className="grid2">
                  <Field label="First Name" value={employee.firstName} />
                  <Field label="Last Name" value={employee.lastName} />
                </div>
                <Field label="Phone" value={employee.phone} />
                <Field label="Email" value={employee.email} />
                <Field label="Address" value={employee.address} />
                <div className="grid2">
                  <Field label="City" value={employee.city} />
                  <Field label="State" value={employee.state} />
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </AppShell>
  );
}
