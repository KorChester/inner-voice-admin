import { useState, useEffect } from "react";

const APP_VERSION = "1.0.0";
const SUPABASE_URL = "https://supabase.physiques-unlimited.de";
const SUPABASE_ANON_KEY = "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJzdXBhYmFzZSIsImlhdCI6MTc3NDk1NTc2MCwiZXhwIjo0OTMwNjI5MzYwLCJyb2xlIjoiYW5vbiJ9.oOYnXD3j3A2VTIaFN9Ratq1X-rhGgTw8blBBRFkuP50";

/* ── Supabase Client ── */
const sb = {
  token: null,
  headers(extra = {}) {
    const h = { "apikey": SUPABASE_ANON_KEY, "Content-Type": "application/json", ...extra };
    if (this.token) h["Authorization"] = `Bearer ${this.token}`;
    return h;
  },
  async auth(email, password) {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, { method: "POST", headers: this.headers(), body: JSON.stringify({ email, password }) });
    const data = await res.json();
    if (data.error || data.msg) throw new Error(data.error_description || data.msg || data.error);
    if (data.access_token) this.token = data.access_token;
    return data;
  },
  async query(table, filter = "") {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=*${filter}`, { headers: this.headers({ "Prefer": "return=representation" }) });
    if (!r.ok) { const e = await r.json(); throw new Error(e.message); }
    return r.json();
  },
  async rpc(body) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/admin_reset_password`, { method: "POST", headers: this.headers(), body: JSON.stringify(body) });
    return r.ok;
  },
  async update(table, data, match) {
    const f = Object.entries(match).map(([k, v]) => `${k}=eq.${v}`).join("&");
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${f}`, { method: "PATCH", headers: this.headers({ "Prefer": "return=representation" }), body: JSON.stringify(data) });
    if (!r.ok) { const e = await r.json(); throw new Error(e.message); }
    return r.json();
  },
};

/* ── Colors ── */
const C = {
  bg: "#09090B", surface: "#111113", card: "#18181B", border: "#27272A", borderLight: "#3F3F46",
  red: "#DC2626", green: "#22C55E", yellow: "#EAB308", cyan: "#06B6D4", blue: "#3B82F6",
  white: "#FAFAFA", text: "#E4E4E7", textMid: "#A1A1AA", textSoft: "#71717A",
};

const MOODS = [{ v: 1, e: "😞" }, { v: 2, e: "😐" }, { v: 3, e: "🙂" }, { v: 4, e: "😊" }, { v: 5, e: "🔥" }];
const TYPES = [{ v: "negative", l: "Negativ", c: "#F87171" }, { v: "neutral", l: "Neutral", c: C.textMid }, { v: "positive", l: "Positiv", c: C.green }];

/* ── App ── */
export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const saved = localStorage.getItem("iv_admin_session");
    if (saved) {
      try {
        const s = JSON.parse(saved);
        sb.token = s.token;
        fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { "apikey": SUPABASE_ANON_KEY, "Authorization": `Bearer ${s.token}` } })
          .then(async r => {
            if (r.ok) { setUser(s.user); }
            else if (s.refreshToken) {
              const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
                method: "POST", headers: { "apikey": SUPABASE_ANON_KEY, "Content-Type": "application/json" },
                body: JSON.stringify({ refresh_token: s.refreshToken })
              });
              const data = await res.json();
              if (data.access_token) {
                sb.token = data.access_token;
                localStorage.setItem("iv_admin_session", JSON.stringify({ ...s, token: data.access_token, refreshToken: data.refresh_token || s.refreshToken }));
                setUser(s.user);
              } else { localStorage.removeItem("iv_admin_session"); sb.token = null; }
            } else { localStorage.removeItem("iv_admin_session"); sb.token = null; }
            setLoading(false);
          })
          .catch(() => { localStorage.removeItem("iv_admin_session"); sb.token = null; setLoading(false); });
      } catch { setLoading(false); }
    } else { setLoading(false); }
  }, []);

  const login = async (email, password) => {
    setError("");
    try {
      const data = await sb.auth(email, password);
      const profiles = await sb.query("iv_profiles", `&id=eq.${data.user.id}`);
      const profile = profiles[0];
      if (!profile || profile.role !== "coach") { setError("Nur Coach-Accounts haben Zugang."); sb.token = null; return; }
      setUser(profile);
      localStorage.setItem("iv_admin_session", JSON.stringify({ token: data.access_token, refreshToken: data.refresh_token, user: profile }));
    } catch (err) { setError(err.message); }
  };

  const logout = () => { sb.token = null; setUser(null); localStorage.removeItem("iv_admin_session"); };

  if (loading) return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: C.bg, color: C.textSoft, fontFamily: "'Inter', sans-serif" }}>Laden...</div>;

  return (
    <div style={{ fontFamily: "'Inter', sans-serif", background: C.bg, minHeight: "100vh", color: C.text }}>
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet" />
      <style>{`* { box-sizing: border-box; margin: 0; } input:focus, textarea:focus { outline: none; border-color: ${C.red} !important; } ::-webkit-scrollbar { width: 6px; } ::-webkit-scrollbar-track { background: ${C.bg}; } ::-webkit-scrollbar-thumb { background: ${C.border}; border-radius: 3px; } ::selection { background: ${C.red}40; }`}</style>
      {!user ? <LoginScreen onLogin={login} error={error} /> : <Dashboard user={user} onLogout={logout} />}
    </div>
  );
}

/* ── Login ── */
function LoginScreen({ onLogin, error }) {
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => { setBusy(true); await onLogin(email, pw); setBusy(false); };

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", padding: 24 }}>
      <div style={{ width: 380, background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 36 }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ fontSize: 11, letterSpacing: 4, color: C.red, fontWeight: 700, marginBottom: 6 }}>INNER VOICE</div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: C.white }}>Coach Admin</h1>
          <p style={{ fontSize: 13, color: C.textSoft, marginTop: 6 }}>Nur für Coach-Accounts</p>
        </div>
        <label style={{ fontSize: 12, fontWeight: 600, color: C.textSoft, display: "block", marginBottom: 6 }}>E-Mail</label>
        <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="coach@email.de" style={{ width: "100%", padding: 11, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, color: C.text, fontSize: 14, marginBottom: 16, fontFamily: "inherit" }} />
        <label style={{ fontSize: 12, fontWeight: 600, color: C.textSoft, display: "block", marginBottom: 6 }}>Passwort</label>
        <input type="password" value={pw} onChange={e => setPw(e.target.value)} onKeyDown={e => e.key === "Enter" && submit()} placeholder="Passwort" style={{ width: "100%", padding: 11, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, color: C.text, fontSize: 14, marginBottom: 20, fontFamily: "inherit" }} />
        {error && <p style={{ fontSize: 13, color: "#F87171", marginBottom: 12, textAlign: "center" }}>{error}</p>}
        <button onClick={submit} disabled={busy || !email || !pw} style={{ width: "100%", padding: 12, background: C.red, border: "none", borderRadius: 6, color: C.white, fontSize: 14, fontWeight: 600, cursor: "pointer", opacity: busy ? 0.5 : 1, fontFamily: "inherit" }}>{busy ? "Laden..." : "Anmelden"}</button>
        <div style={{ textAlign: "center", marginTop: 20, fontSize: 11, color: C.textSoft }}>v{APP_VERSION}</div>
      </div>
    </div>
  );
}

/* ── Dashboard ── */
function Dashboard({ user, onLogout }) {
  const [page, setPage] = useState("overview");
  const [clients, setClients] = useState([]);
  const [allSessions, setAllSessions] = useState([]);
  const [allJournal, setAllJournal] = useState([]);
  const [selectedClient, setSelectedClient] = useState(null);
  const [clientDetail, setClientDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [profiles, sessions, journal] = await Promise.all([
        sb.query("iv_profiles", ""),
        sb.query("iv_practice_sessions", "&order=created_at.desc"),
        sb.query("iv_journal", "&order=created_at.desc"),
      ]);
      setClients(profiles);
      setAllSessions(sessions);
      setAllJournal(journal);
    } catch (err) { console.error(err); }
    setLoading(false);
  };

  const loadClientDetail = async (client) => {
    setSelectedClient(client);
    setPage("clientDetail");
    try {
      const uid = `&user_id=eq.${client.id}`;
      const [journal, reframes, scens, scenPhrases, sessions] = await Promise.all([
        sb.query("iv_journal", uid + "&order=created_at.desc"),
        sb.query("iv_reframes", uid + "&order=created_at.desc"),
        sb.query("iv_scenarios", uid + "&order=sort_order.asc"),
        sb.query("iv_scenario_phrases", uid),
        sb.query("iv_practice_sessions", uid + "&order=created_at.desc"),
      ]);
      setClientDetail({
        journal, reframes, sessions,
        scenarios: scens.map(s => ({ ...s, phrases: scenPhrases.filter(p => p.scenario_id === s.id) })),
      });
    } catch (err) { console.error(err); }
  };

  // Compute client overviews
  const getOverview = (clientId) => {
    const cSessions = allSessions.filter(s => s.user_id === clientId);
    const cJournal = allJournal.filter(j => j.user_id === clientId);
    const allDates = [...cSessions.map(s => s.created_at), ...cJournal.map(j => j.created_at)].sort().reverse();
    const lastActive = allDates[0] ? new Date(allDates[0]) : null;
    const daysSince = lastActive ? Math.floor((Date.now() - lastActive.getTime()) / 86400000) : 999;
    const moods = cJournal.map(j => j.mood);
    const recent5 = moods.slice(0, 5);
    const prev5 = moods.slice(5, 10);
    const avgRecent = recent5.length ? recent5.reduce((a, b) => a + b, 0) / recent5.length : 0;
    const avgPrev = prev5.length ? prev5.reduce((a, b) => a + b, 0) / prev5.length : 0;
    const moodTrend = !prev5.length ? "stable" : avgRecent > avgPrev + 0.3 ? "rising" : avgRecent < avgPrev - 0.3 ? "falling" : "stable";
    const neg = cJournal.filter(j => j.self_talk_type === "negative").length;
    const total = cJournal.length;
    const negPct = total ? Math.round(neg / total * 100) : 0;
    const posPct = total ? Math.round(cJournal.filter(j => j.self_talk_type === "positive").length / total * 100) : 0;
    const now = new Date();
    const day = now.getDay();
    const startThisWeek = new Date(now); startThisWeek.setDate(now.getDate() - ((day + 6) % 7)); startThisWeek.setHours(0, 0, 0, 0);
    const sessionsThisWeek = cSessions.filter(s => new Date(s.created_at) >= startThisWeek).length;
    const hasData = cSessions.length > 0 || cJournal.length > 0;
    let status = "green";
    if (!hasData) status = "new";
    else if (daysSince > 7 || moodTrend === "falling" || negPct > 60) status = "red";
    else if (daysSince > 3 || (moodTrend === "stable" && negPct > 40)) status = "yellow";
    return { daysSince, moodTrend, avgRecent, moods, negPct, posPct, sessionsThisWeek, totalSessions: cSessions.length, totalJournal: cJournal.length, status, lastActive };
  };

  const statusColors = { green: C.green, yellow: C.yellow, red: "#EF4444", new: C.cyan };
  const statusLabels = { green: "Gut dabei", yellow: "Aufmerksamkeit", red: "Eingreifen", new: "Neu" };
  const trendLabels = { rising: "↗ steigend", stable: "→ stabil", falling: "↘ sinkend" };
  const trendColors = { rising: C.green, stable: C.textSoft, falling: "#EF4444" };

  const daysAgoText = (d) => d === 0 ? "Heute" : d === 1 ? "Gestern" : d === 999 ? "Nie" : `Vor ${d}d`;

  const NAV = [
    { id: "overview", icon: "◈", label: "Übersicht" },
    { id: "clients", icon: "◉", label: "Klienten" },
  ];

  if (loading) return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: C.bg, color: C.textSoft }}>Daten werden geladen...</div>;

  // Filtered clients
  const filteredClients = clients.filter(c => {
    const q = search.toLowerCase();
    return !q || (c.display_name || "").toLowerCase().includes(q) || (c.email || "").toLowerCase().includes(q);
  });

  return (
    <div style={{ display: "flex", height: "100vh" }}>
      {/* Sidebar */}
      <aside style={{ width: 220, background: C.surface, borderRight: `1px solid ${C.border}`, display: "flex", flexDirection: "column", flexShrink: 0 }}>
        <div style={{ padding: "20px 16px", borderBottom: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 10, letterSpacing: 3, color: C.red, fontWeight: 700, marginBottom: 4 }}>INNER VOICE</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.white }}>Coach Admin</div>
        </div>
        <nav style={{ flex: 1, padding: "12px 8px" }}>
          {NAV.map(n => (
            <button key={n.id} onClick={() => { setPage(n.id); setSelectedClient(null); setClientDetail(null); }}
              style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "10px 12px", background: page === n.id || (n.id === "clients" && page === "clientDetail") ? C.card : "transparent", border: "none", borderRadius: 6, color: page === n.id || (n.id === "clients" && page === "clientDetail") ? C.white : C.textMid, fontSize: 13, fontWeight: 500, cursor: "pointer", marginBottom: 2, fontFamily: "inherit", textAlign: "left" }}>
              <span style={{ fontSize: 16 }}>{n.icon}</span>{n.label}
            </button>
          ))}
        </nav>
        <div style={{ padding: 16, borderTop: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 12, color: C.textSoft, marginBottom: 4 }}>{user.display_name || user.email}</div>
          <button onClick={onLogout} style={{ background: "none", border: "none", color: C.red, fontSize: 12, cursor: "pointer", padding: 0, fontFamily: "inherit" }}>Abmelden</button>
        </div>
      </aside>

      {/* Main */}
      <main style={{ flex: 1, overflow: "auto", padding: 32 }}>
        {page === "overview" && <OverviewPage clients={clients} getOverview={getOverview} statusColors={statusColors} statusLabels={statusLabels} onSelectClient={loadClientDetail} />}
        {page === "clients" && (
          <ClientListPage clients={filteredClients} search={search} setSearch={setSearch} getOverview={getOverview}
            statusColors={statusColors} statusLabels={statusLabels} trendLabels={trendLabels} trendColors={trendColors}
            daysAgoText={daysAgoText} onSelectClient={loadClientDetail} />
        )}
        {page === "clientDetail" && selectedClient && (
          <ClientDetailPage client={selectedClient} detail={clientDetail} overview={getOverview(selectedClient.id)}
            statusColors={statusColors} statusLabels={statusLabels} trendLabels={trendLabels} trendColors={trendColors}
            daysAgoText={daysAgoText} onBack={() => { setPage("clients"); setSelectedClient(null); setClientDetail(null); }}
            reload={() => loadClientDetail(selectedClient)} loadAll={loadAll} />
        )}
      </main>
    </div>
  );
}

/* ── Overview Page ── */
function OverviewPage({ clients, getOverview, statusColors, statusLabels, onSelectClient }) {
  const overviews = clients.map(c => ({ ...c, ov: getOverview(c.id) }));
  const counts = { green: 0, yellow: 0, red: 0, new: 0 };
  overviews.forEach(c => counts[c.ov.status]++);

  const totalSessions = overviews.reduce((s, c) => s + c.ov.totalSessions, 0);
  const totalJournal = overviews.reduce((s, c) => s + c.ov.totalJournal, 0);
  const activeThisWeek = overviews.filter(c => c.ov.sessionsThisWeek > 0).length;

  // Clients needing attention (red + yellow)
  const attention = overviews.filter(c => c.ov.status === "red" || c.ov.status === "yellow").sort((a, b) => {
    if (a.ov.status === "red" && b.ov.status !== "red") return -1;
    if (a.ov.status !== "red" && b.ov.status === "red") return 1;
    return 0;
  });

  return (
    <div style={{ maxWidth: 960 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, color: C.white, marginBottom: 4 }}>Übersicht</h1>
      <p style={{ fontSize: 14, color: C.textSoft, marginBottom: 28 }}>Dein Coaching auf einen Blick.</p>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 28 }}>
        {[
          { label: "Klienten", value: clients.length, color: C.white },
          { label: "Aktiv diese Woche", value: activeThisWeek, color: C.green },
          { label: "Sessions gesamt", value: totalSessions, color: C.blue },
          { label: "Journal-Einträge", value: totalJournal, color: C.yellow },
        ].map((s, i) => (
          <div key={i} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 18 }}>
            <div style={{ fontSize: 12, color: C.textSoft, marginBottom: 6 }}>{s.label}</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Ampel */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 28 }}>
        {["green", "yellow", "red", "new"].map(s => (
          <div key={s} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 16, textAlign: "center" }}>
            <div style={{ width: 14, height: 14, borderRadius: 7, background: statusColors[s], margin: "0 auto 8px", boxShadow: `0 0 10px ${statusColors[s]}40` }} />
            <div style={{ fontSize: 22, fontWeight: 700, color: C.white }}>{counts[s]}</div>
            <div style={{ fontSize: 12, color: C.textSoft }}>{statusLabels[s]}</div>
          </div>
        ))}
      </div>

      {/* Attention needed */}
      {attention.length > 0 && (
        <div>
          <h2 style={{ fontSize: 16, fontWeight: 600, color: C.white, marginBottom: 12 }}>⚠ Aufmerksamkeit erforderlich</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {attention.map(c => (
              <button key={c.id} onClick={() => onSelectClient(c)}
                style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, cursor: "pointer", textAlign: "left", fontFamily: "inherit", width: "100%" }}>
                <div style={{ width: 10, height: 10, borderRadius: 5, background: statusColors[c.ov.status], flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: C.white }}>{c.display_name || c.email}</div>
                  <div style={{ fontSize: 12, color: C.textSoft }}>{c.email}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 12, color: statusColors[c.ov.status] }}>{statusLabels[c.ov.status]}</div>
                  <div style={{ fontSize: 11, color: C.textSoft }}>{c.ov.daysSince === 999 ? "Noch nie aktiv" : `Letzte Aktivität vor ${c.ov.daysSince}d`}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Client List Page ── */
function ClientListPage({ clients, search, setSearch, getOverview, statusColors, statusLabels, trendLabels, trendColors, daysAgoText, onSelectClient }) {
  const [sortBy, setSortBy] = useState("status");
  const [sortDir, setSortDir] = useState("asc");

  const withOv = clients.map(c => ({ ...c, ov: getOverview(c.id) }));

  const statusOrder = { red: 0, yellow: 1, new: 2, green: 3 };
  const sorted = [...withOv].sort((a, b) => {
    let cmp = 0;
    if (sortBy === "status") cmp = (statusOrder[a.ov.status] || 0) - (statusOrder[b.ov.status] || 0);
    else if (sortBy === "name") cmp = (a.display_name || a.email).localeCompare(b.display_name || b.email);
    else if (sortBy === "active") cmp = a.ov.daysSince - b.ov.daysSince;
    else if (sortBy === "sessions") cmp = b.ov.totalSessions - a.ov.totalSessions;
    return sortDir === "desc" ? -cmp : cmp;
  });

  const toggleSort = (col) => {
    if (sortBy === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortBy(col); setSortDir("asc"); }
  };

  const SortHeader = ({ col, children, style }) => (
    <th onClick={() => toggleSort(col)} style={{ padding: "10px 12px", textAlign: "left", fontSize: 11, fontWeight: 600, color: sortBy === col ? C.white : C.textSoft, cursor: "pointer", userSelect: "none", letterSpacing: 0.5, textTransform: "uppercase", borderBottom: `1px solid ${C.border}`, ...style }}>
      {children} {sortBy === col && (sortDir === "asc" ? "↑" : "↓")}
    </th>
  );

  return (
    <div style={{ maxWidth: 1100 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: C.white, marginBottom: 4 }}>Klienten</h1>
          <p style={{ fontSize: 14, color: C.textSoft }}>{clients.length} {clients.length === 1 ? "Person" : "Personen"}</p>
        </div>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Suchen..." style={{ padding: "9px 14px", width: 260, background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, color: C.text, fontSize: 13, fontFamily: "inherit" }} />
      </div>

      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: C.surface }}>
              <SortHeader col="status" style={{ width: 50 }}>Status</SortHeader>
              <SortHeader col="name">Name</SortHeader>
              <th style={{ padding: "10px 12px", textAlign: "left", fontSize: 11, fontWeight: 600, color: C.textSoft, letterSpacing: 0.5, textTransform: "uppercase", borderBottom: `1px solid ${C.border}` }}>E-Mail</th>
              <SortHeader col="active">Letzte Aktivität</SortHeader>
              <SortHeader col="sessions">Sessions</SortHeader>
              <th style={{ padding: "10px 12px", textAlign: "left", fontSize: 11, fontWeight: 600, color: C.textSoft, letterSpacing: 0.5, textTransform: "uppercase", borderBottom: `1px solid ${C.border}` }}>Stimmung</th>
              <th style={{ padding: "10px 12px", textAlign: "left", fontSize: 11, fontWeight: 600, color: C.textSoft, letterSpacing: 0.5, textTransform: "uppercase", borderBottom: `1px solid ${C.border}` }}>Rolle</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(c => (
              <tr key={c.id} onClick={() => onSelectClient(c)} style={{ cursor: "pointer", borderBottom: `1px solid ${C.border}` }}
                onMouseEnter={e => e.currentTarget.style.background = C.surface} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                <td style={{ padding: "12px" }}>
                  <div style={{ width: 10, height: 10, borderRadius: 5, background: statusColors[c.ov.status], margin: "0 auto", boxShadow: `0 0 6px ${statusColors[c.ov.status]}40` }} />
                </td>
                <td style={{ padding: "12px", fontWeight: 600, color: C.white, fontSize: 14 }}>{c.display_name || "–"}</td>
                <td style={{ padding: "12px", color: C.textMid, fontSize: 13 }}>{c.email}</td>
                <td style={{ padding: "12px", color: C.textMid, fontSize: 13 }}>{daysAgoText(c.ov.daysSince)}</td>
                <td style={{ padding: "12px", color: C.white, fontSize: 14, fontWeight: 600 }}>{c.ov.totalSessions}</td>
                <td style={{ padding: "12px" }}>
                  {c.ov.moods?.length > 0 ? (
                    <span style={{ color: trendColors[c.ov.moodTrend], fontSize: 13 }}>{trendLabels[c.ov.moodTrend]} · Ø {c.ov.avgRecent.toFixed(1)}</span>
                  ) : (
                    <span style={{ color: C.textSoft, fontSize: 13 }}>–</span>
                  )}
                </td>
                <td style={{ padding: "12px" }}>
                  <span style={{ fontSize: 11, padding: "3px 8px", borderRadius: 4, background: c.role === "coach" ? `${C.red}20` : `${C.blue}20`, color: c.role === "coach" ? C.red : C.blue }}>{c.role}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── Client Detail Page ── */
function ClientDetailPage({ client, detail, overview, statusColors, statusLabels, trendLabels, trendColors, daysAgoText, onBack, reload, loadAll }) {
  const [tab, setTab] = useState("journal");
  const [notes, setNotes] = useState(() => localStorage.getItem(`iv_notes_${client.id}`) || "");
  const [notesSaved, setNotesSaved] = useState(false);

  const saveNotes = () => {
    localStorage.setItem(`iv_notes_${client.id}`, notes);
    setNotesSaved(true);
    setTimeout(() => setNotesSaved(false), 1500);
  };

  const ov = overview;
  const TABS = [
    { id: "journal", label: "Journal", count: detail?.journal?.length || 0 },
    { id: "scenarios", label: "Szenarien", count: detail?.scenarios?.length || 0 },
    { id: "reframes", label: "Reframes", count: detail?.reframes?.length || 0 },
    { id: "sessions", label: "Sessions", count: detail?.sessions?.length || 0 },
    { id: "notes", label: "Notizen", count: null },
  ];

  return (
    <div style={{ maxWidth: 1100 }}>
      <button onClick={onBack} style={{ background: "none", border: "none", color: C.red, fontSize: 13, cursor: "pointer", marginBottom: 16, fontFamily: "inherit", padding: 0 }}>← Alle Klienten</button>

      {/* Header */}
      <div style={{ display: "flex", gap: 16, marginBottom: 24 }}>
        <div style={{ flex: 1, background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: 20, borderLeft: `3px solid ${statusColors[ov.status]}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <h1 style={{ fontSize: 22, fontWeight: 700, color: C.white, marginBottom: 4 }}>{client.display_name || client.email}</h1>
              <p style={{ fontSize: 13, color: C.textSoft }}>{client.email}</p>
              <p style={{ fontSize: 12, color: C.textSoft, marginTop: 4 }}>Registriert: {new Date(client.created_at).toLocaleDateString("de-DE")}</p>
            </div>
            <div style={{ padding: "4px 12px", borderRadius: 12, background: `${statusColors[ov.status]}20`, color: statusColors[ov.status], fontSize: 12, fontWeight: 600 }}>{statusLabels[ov.status]}</div>
          </div>
        </div>
      </div>

      {/* Quick stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10, marginBottom: 24 }}>
        {[
          { label: "Letzte Aktivität", value: daysAgoText(ov.daysSince), color: C.white },
          { label: "Sessions gesamt", value: ov.totalSessions, color: C.blue },
          { label: "Diese Woche", value: ov.sessionsThisWeek, color: C.green },
          { label: "Stimmung", value: ov.avgRecent ? `Ø ${ov.avgRecent.toFixed(1)}` : "–", color: trendColors[ov.moodTrend] || C.textSoft },
          { label: "Self-Talk", value: ov.posPct ? `${ov.posPct}% pos` : "–", color: ov.posPct > 50 ? C.green : ov.negPct > 40 ? "#EF4444" : C.textMid },
        ].map((s, i) => (
          <div key={i} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 14 }}>
            <div style={{ fontSize: 11, color: C.textSoft, marginBottom: 4 }}>{s.label}</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Mood chart */}
      {ov.moods?.length > 0 && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: 16, marginBottom: 24 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: C.textSoft, letterSpacing: 1, textTransform: "uppercase", marginBottom: 10 }}>Stimmungsverlauf ({ov.moods.length} Einträge)</div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 60 }}>
            {ov.moods.map((m, i) => {
              const h = (m / 5) * 48 + 12;
              const color = m >= 4 ? C.green : m >= 3 ? C.yellow : "#EF4444";
              return <div key={i} style={{ flex: 1, height: h, background: color, borderRadius: 3, opacity: 0.75 }} />;
            })}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 16, borderBottom: `1px solid ${C.border}`, paddingBottom: 0 }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{ padding: "10px 16px", background: "none", border: "none", borderBottom: tab === t.id ? `2px solid ${C.red}` : "2px solid transparent", color: tab === t.id ? C.white : C.textSoft, fontSize: 13, fontWeight: tab === t.id ? 600 : 400, cursor: "pointer", fontFamily: "inherit" }}>
            {t.label}{t.count !== null ? ` (${t.count})` : ""}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {!detail ? (
        <div style={{ padding: 40, textAlign: "center", color: C.textSoft }}>Daten werden geladen...</div>
      ) : (
        <>
          {tab === "journal" && <JournalTab journal={detail.journal} />}
          {tab === "scenarios" && <ScenariosTab scenarios={detail.scenarios} />}
          {tab === "reframes" && <ReframesTab reframes={detail.reframes} />}
          {tab === "sessions" && <SessionsTab sessions={detail.sessions} />}
          {tab === "notes" && (
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: C.textSoft, letterSpacing: 1, textTransform: "uppercase", marginBottom: 10 }}>Private Notizen zu {client.display_name || client.email}</div>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notizen hier eingeben... (nur für dich sichtbar)"
                rows={8} style={{ width: "100%", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, color: C.text, padding: 12, fontSize: 14, resize: "vertical", lineHeight: 1.6, fontFamily: "inherit" }} />
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>
                <button onClick={saveNotes} style={{ padding: "8px 20px", background: C.red, border: "none", borderRadius: 6, color: C.white, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                  {notesSaved ? "✓ Gespeichert" : "Speichern"}
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ── Journal Tab ── */
function JournalTab({ journal }) {
  if (!journal.length) return <Empty text="Keine Journal-Einträge" />;
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ background: C.surface }}>
            {["Datum", "Stimmung", "Typ", "Text"].map(h => (
              <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontSize: 11, fontWeight: 600, color: C.textSoft, letterSpacing: 0.5, textTransform: "uppercase", borderBottom: `1px solid ${C.border}` }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {journal.map(j => (
            <tr key={j.id} style={{ borderBottom: `1px solid ${C.border}` }}>
              <td style={{ padding: "10px 14px", fontSize: 13, color: C.textMid, whiteSpace: "nowrap" }}>{new Date(j.created_at).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "2-digit" })} {new Date(j.created_at).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}</td>
              <td style={{ padding: "10px 14px", fontSize: 18 }}>{MOODS.find(m => m.v === j.mood)?.e || "–"}</td>
              <td style={{ padding: "10px 14px" }}><span style={{ fontSize: 12, color: TYPES.find(t => t.v === j.self_talk_type)?.c || C.textSoft, fontWeight: 500 }}>{TYPES.find(t => t.v === j.self_talk_type)?.l || "–"}</span></td>
              <td style={{ padding: "10px 14px", fontSize: 13, color: C.text, lineHeight: 1.5, maxWidth: 500 }}>{j.text}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ── Scenarios Tab ── */
function ScenariosTab({ scenarios }) {
  if (!scenarios.length) return <Empty text="Keine Szenarien" />;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
      {scenarios.map(s => (
        <div key={s.id} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <span style={{ fontSize: 22 }}>{s.icon}</span>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: C.white }}>{s.name}</div>
              {s.description && <div style={{ fontSize: 12, color: C.textSoft }}>{s.description}</div>}
            </div>
          </div>
          {s.phrases.map(p => (
            <div key={p.id} style={{ padding: "6px 10px", background: C.surface, borderRadius: 6, marginBottom: 4, fontSize: 13, color: C.textMid, lineHeight: 1.5 }}>"{p.text}"</div>
          ))}
          {!s.phrases.length && <div style={{ fontSize: 12, color: C.textSoft, fontStyle: "italic" }}>Keine Sätze</div>}
        </div>
      ))}
    </div>
  );
}

/* ── Reframes Tab ── */
function ReframesTab({ reframes }) {
  if (!reframes.length) return <Empty text="Keine Reframes" />;
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ background: C.surface }}>
            {["Datum", "Negativer Gedanke", "Reframe"].map(h => (
              <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontSize: 11, fontWeight: 600, color: C.textSoft, letterSpacing: 0.5, textTransform: "uppercase", borderBottom: `1px solid ${C.border}` }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {reframes.map(r => (
            <tr key={r.id} style={{ borderBottom: `1px solid ${C.border}` }}>
              <td style={{ padding: "10px 14px", fontSize: 13, color: C.textMid, whiteSpace: "nowrap" }}>{new Date(r.created_at).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "2-digit" })}</td>
              <td style={{ padding: "10px 14px", fontSize: 13, color: "#F87171", lineHeight: 1.5 }}>{r.negative_text}</td>
              <td style={{ padding: "10px 14px", fontSize: 13, color: C.green, lineHeight: 1.5 }}>{r.positive_text}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ── Sessions Tab ── */
function SessionsTab({ sessions }) {
  if (!sessions.length) return <Empty text="Keine Sessions" />;
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ background: C.surface }}>
            {["Datum", "Typ", "Anzahl"].map(h => (
              <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontSize: 11, fontWeight: 600, color: C.textSoft, letterSpacing: 0.5, textTransform: "uppercase", borderBottom: `1px solid ${C.border}` }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sessions.map(s => (
            <tr key={s.id} style={{ borderBottom: `1px solid ${C.border}` }}>
              <td style={{ padding: "10px 14px", fontSize: 13, color: C.textMid, whiteSpace: "nowrap" }}>{new Date(s.created_at).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "2-digit" })} {new Date(s.created_at).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}</td>
              <td style={{ padding: "10px 14px", fontSize: 13, color: C.white }}>{s.session_type === "practice" ? "Praxis" : "Reframe-Übung"}</td>
              <td style={{ padding: "10px 14px", fontSize: 13, color: C.white }}>{s.phrases_count} {s.session_type === "practice" ? "Sätze" : "Karten"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ── Empty State ── */
function Empty({ text }) {
  return <div style={{ padding: 60, textAlign: "center", color: C.textSoft, fontSize: 14, background: C.card, border: `1px solid ${C.border}`, borderRadius: 10 }}>{text}</div>;
}
