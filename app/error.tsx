"use client";
export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div style={{ padding: 40, textAlign: "center" }}>
      <h2>Something went wrong</h2>
      <p style={{ color: "#666" }}>{error.message}</p>
      <button onClick={reset}>Try again</button>
    </div>
  );
}
