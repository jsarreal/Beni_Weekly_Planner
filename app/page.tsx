import { getSettings } from "@/lib/settings";

export default async function Home() {
  const s = await getSettings();
  const connected = Boolean(s.googleRefresh);
  return (
    <main style={{ padding: 32, fontFamily: "system-ui" }}>
      <h1>Beni&apos;s Weekly Planner</h1>
      <p>Google Calendar: {connected ? "✅ Connected" : "❌ Not connected"}</p>
      {!connected && <a href="/api/auth/google">Connect Google Calendar</a>}
    </main>
  );
}
