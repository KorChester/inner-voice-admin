import { useState, useEffect } from "react";

const APP_VERSION = "1.1.1";
const SUPABASE_URL = "https://supabase.physiques-unlimited.de";
const SUPABASE_ANON_KEY = "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJzdXBhYmFzZSIsImlhdCI6MTc3NDk1NTc2MCwiZXhwIjo0OTMwNjI5MzYwLCJyb2xlIjoiYW5vbiJ9.oOYnXD3j3A2VTIaFN9Ratq1X-rhGgTw8blBBRFkuP50";

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
  async update(table, data, match) {
    const f = Object.entries(match).map(([k, v]) => `${k}=eq.${v}`).join("&");
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${f}`, { method: "PATCH", headers: this.headers({ "Prefer": "return=representation" }), body: JSON.stringify(data) });
    if (!r.ok) { const e = await r.json(); throw new Error(e.message); }
    return r.json();
  },
};

const C = {
  bg: "#09090B", surface: "#111113", card: "#18181B", border: "#27272A", borderLight: "#3F3F46",
  red: "#DC2626", green: "#22C55E", yellow: "#EAB308", cyan: "#06B6D4", blue: "#3B82F6",
  white: "#FAFAFA", text: "#E4E4E7", textMid: "#A1A1AA", textSoft: "#71717A",
};
const MOODS = [{ v: 1, e: "\u{1F61E}", l: "Schlecht" }, { v: 2, e: "\u{1F610}", l: "Mäßig" }, { v: 3, e: "\u{1F642}", l: "Okay" }, { v: 4, e: "\u{1F60A}", l: "Gut" }, { v: 5, e: "\u{1F525}", l: "Stark" }];
const TYPES = [{ v: "negative", l: "Negativ", c: "#F87171" }, { v: "neutral", l: "Neutral", c: C.yellow }, { v: "positive", l: "Positiv", c: C.green }];
const statusColors = { green: C.green, yellow: C.yellow, red: "#EF4444", new: C.cyan };
const statusLabels = { green: "Gut dabei", yellow: "Beobachten", red: "Eingreifen", new: "Neu" };
const trendIcons = { rising: "\u2197", stable: "\u2192", falling: "\u2198" };
const trendColors = { rising: C.green, stable: C.textSoft, falling: "#EF4444" };

const daysAgo = (d) => { const n = Math.floor((Date.now() - new Date(d).getTime()) / 86400000); return n === 0 ? "Heute" : n === 1 ? "Gestern" : "Vor " + n + " Tagen"; };
const fmtDate = (d) => new Date(d).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "2-digit" });
const fmtDateTime = (d) => fmtDate(d) + " " + new Date(d).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
const mondayOfWeek = (date, weeksAgo = 0) => { const dd = new Date(date); dd.setDate(dd.getDate() - ((dd.getDay() + 6) % 7) - weeksAgo * 7); dd.setHours(0, 0, 0, 0); return dd; };

const getClientOverview = (clientId, allSessions, allJournal) => {
  const cS = allSessions.filter(s => s.user_id === clientId);
  const cJ = allJournal.filter(j => j.user_id === clientId);
  const allDates = [...cS.map(s => s.created_at), ...cJ.map(j => j.created_at)].sort().reverse();
  const lastActive = allDates[0] || null;
  const daysSince = lastActive ? Math.floor((Date.now() - new Date(lastActive).getTime()) / 86400000) : 999;
  const moods = cJ.map(j => j.mood);
  const r5 = moods.slice(0, 5), p5 = moods.slice(5, 10);
  const avgR = r5.length ? r5.reduce((a, b) => a + b, 0) / r5.length : 0;
  const avgP = p5.length ? p5.reduce((a, b) => a + b, 0) / p5.length : 0;
  const moodTrend = !r5.length ? "stable" : !p5.length ? "stable" : avgR > avgP + 0.3 ? "rising" : avgR < avgP - 0.3 ? "falling" : "stable";
  const neg = cJ.filter(j => j.self_talk_type === "negative").length;
  const pos = cJ.filter(j => j.self_talk_type === "positive").length;
  const total = cJ.length;
  const negPct = total ? Math.round(neg / total * 100) : 0;
  const posPct = total ? Math.round(pos / total * 100) : 0;
  const neuPct = total ? 100 - negPct - posPct : 0;
  const mon = mondayOfWeek(new Date());
  const sessionsThisWeek = [...new Set(cS.filter(s => new Date(s.created_at) >= mon).map(s => s.created_at.slice(0, 10)))].length;
  const hasData = cS.length > 0 || cJ.length > 0;
  let status = "green";
  if (!hasData) status = "new";
  else if (moodTrend === "falling" || negPct > 60) status = "red";
  else if (negPct > 40) status = "yellow";
  return { daysSince, lastActive, moodTrend, avgRecent: avgR, moods: moods.slice(0, 20).reverse(), negPct, posPct, neuPct, sessionsThisWeek, totalSessions: cS.length, totalJournal: cJ.length, status };
};

const Screen = ({ children }) => <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: C.bg }}>{children}</div>;
const Stat = ({ label, value, sub, color }) => (<div style={{ background: C.card, border: "1px solid " + C.border, borderRadius: 8, padding: 16 }}><div style={{ fontSize: 11, color: C.textSoft, marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div><div style={{ fontSize: 24, fontWeight: 700, color: color || C.white }}>{value}</div>{sub && <div style={{ fontSize: 11, color: C.textSoft, marginTop: 2 }}>{sub}</div>}</div>);
const Empty = ({ text }) => <div style={{ padding: 48, textAlign: "center", color: C.textSoft, fontSize: 14, background: C.card, border: "1px solid " + C.border, borderRadius: 10 }}>{text}</div>;
const SelfTalkBar = ({ posPct, neuPct, negPct, height = 8 }) => (<div><div style={{ display: "flex", height, borderRadius: height / 2, overflow: "hidden", marginBottom: 4 }}>{posPct > 0 && <div style={{ width: posPct + "%", background: C.green }} />}{neuPct > 0 && <div style={{ width: neuPct + "%", background: C.yellow }} />}{negPct > 0 && <div style={{ width: negPct + "%", background: "#EF4444" }} />}</div><div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: C.textSoft }}><span style={{ color: C.green }}>{posPct}% positiv</span><span style={{ color: C.yellow }}>{neuPct}% neutral</span><span style={{ color: "#EF4444" }}>{negPct}% negativ</span></div></div>);
const MoodChart = ({ moods, height = 60 }) => (<div style={{ display: "flex", alignItems: "flex-end", gap: 2, height }}>{moods.map((m, i) => (<div key={i} style={{ flex: 1, height: (m / 5) * (height - 12) + 12, background: m >= 4 ? C.green : m >= 3 ? C.yellow : "#EF4444", borderRadius: 3, opacity: 0.75 }} />))}</div>);
const Th = ({ children }) => <th style={{ padding: "10px 14px", textAlign: "left", fontSize: 11, fontWeight: 600, color: C.textSoft, letterSpacing: 0.5, textTransform: "uppercase", borderBottom: "1px solid " + C.border }}>{children}</th>;

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    const saved = localStorage.getItem("iv_admin_session");
    if (saved) {
      try {
        const s = JSON.parse(saved); sb.token = s.token;
        fetch(SUPABASE_URL + "/auth/v1/user", { headers: { "apikey": SUPABASE_ANON_KEY, "Authorization": "Bearer " + s.token } })
          .then(async r => {
            if (r.ok) { setUser(s.user); }
            else if (s.refreshToken) {
              const res = await fetch(SUPABASE_URL + "/auth/v1/token?grant_type=refresh_token", { method: "POST", headers: { "apikey": SUPABASE_ANON_KEY, "Content-Type": "application/json" }, body: JSON.stringify({ refresh_token: s.refreshToken }) });
              const data = await res.json();
              if (data.access_token) { sb.token = data.access_token; localStorage.setItem("iv_admin_session", JSON.stringify({ ...s, token: data.access_token, refreshToken: data.refresh_token || s.refreshToken })); setUser(s.user); }
              else { localStorage.removeItem("iv_admin_session"); sb.token = null; }
            } else { localStorage.removeItem("iv_admin_session"); sb.token = null; }
            setLoading(false);
          }).catch(() => { localStorage.removeItem("iv_admin_session"); sb.token = null; setLoading(false); });
      } catch { setLoading(false); }
    } else { setLoading(false); }
  }, []);
  const login = async (email, password) => {
    setError("");
    try {
      const data = await sb.auth(email, password);
      const profiles = await sb.query("iv_profiles", "&id=eq." + data.user.id);
      const profile = profiles[0];
      if (!profile || profile.role !== "coach") { setError("Nur Coach-Accounts haben Zugang."); sb.token = null; return; }
      setUser(profile);
      localStorage.setItem("iv_admin_session", JSON.stringify({ token: data.access_token, refreshToken: data.refresh_token, user: profile }));
    } catch (err) { setError(err.message); }
  };
  const logout = () => { sb.token = null; setUser(null); localStorage.removeItem("iv_admin_session"); };
  if (loading) return <Screen><p style={{ color: C.textSoft }}>Laden...</p></Screen>;
  return (
    <div style={{ fontFamily: "'Inter', sans-serif", background: C.bg, minHeight: "100vh", color: C.text }}>
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet" />
      <style>{"* { box-sizing: border-box; margin: 0; } input:focus, textarea:focus { outline: none; border-color: " + C.red + " !important; } ::-webkit-scrollbar { width: 6px; } ::-webkit-scrollbar-track { background: " + C.bg + "; } ::-webkit-scrollbar-thumb { background: " + C.border + "; border-radius: 3px; } table { border-spacing: 0; }"}</style>
      {!user ? <LoginScreen onLogin={login} error={error} /> : <Dashboard user={user} onLogout={logout} />}
    </div>
  );
}

function LoginScreen({ onLogin, error }) {
  const [email, setEmail] = useState(""); const [pw, setPw] = useState(""); const [busy, setBusy] = useState(false);
  const submit = async () => { setBusy(true); await onLogin(email, pw); setBusy(false); };
  return (
    <Screen>
      <div style={{ width: 380, background: C.card, border: "1px solid " + C.border, borderRadius: 12, padding: 36 }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ fontSize: 10, letterSpacing: 4, color: C.red, fontWeight: 700, marginBottom: 6 }}>INNER VOICE</div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: C.white }}>Coach Admin</h1>
          <p style={{ fontSize: 13, color: C.textSoft, marginTop: 6 }}>Nur Coach-Accounts</p>
        </div>
        <label style={{ fontSize: 12, fontWeight: 600, color: C.textSoft, display: "block", marginBottom: 6 }}>E-Mail</label>
        <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="coach@email.de" style={{ width: "100%", padding: 11, background: C.surface, border: "1px solid " + C.border, borderRadius: 6, color: C.text, fontSize: 14, marginBottom: 16, fontFamily: "inherit" }} />
        <label style={{ fontSize: 12, fontWeight: 600, color: C.textSoft, display: "block", marginBottom: 6 }}>Passwort</label>
        <input type="password" value={pw} onChange={e => setPw(e.target.value)} onKeyDown={e => e.key === "Enter" && submit()} placeholder="Passwort" style={{ width: "100%", padding: 11, background: C.surface, border: "1px solid " + C.border, borderRadius: 6, color: C.text, fontSize: 14, marginBottom: 20, fontFamily: "inherit" }} />
        {error && <p style={{ fontSize: 13, color: "#F87171", marginBottom: 12, textAlign: "center" }}>{error}</p>}
        <button onClick={submit} disabled={busy || !email || !pw} style={{ width: "100%", padding: 12, background: C.red, border: "none", borderRadius: 6, color: C.white, fontSize: 14, fontWeight: 600, cursor: "pointer", opacity: busy ? 0.5 : 1, fontFamily: "inherit" }}>{busy ? "Laden..." : "Anmelden"}</button>
        <div style={{ textAlign: "center", marginTop: 20, fontSize: 11, color: C.textSoft }}>v{APP_VERSION}</div>
      </div>
    </Screen>
  );
}

function Dashboard({ user, onLogout }) {
  const [page, setPage] = useState("overview");
  const [clients, setClients] = useState([]);
  const [allSessions, setAllSessions] = useState([]);
  const [allJournal, setAllJournal] = useState([]);
  const [allReframes, setAllReframes] = useState([]);
  const [selectedClient, setSelectedClient] = useState(null);
  const [clientDetail, setClientDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  useEffect(() => { loadAll(); }, []);
  const loadAll = async (silent = false) => {
    if (!silent) setLoading(true); else setRefreshing(true);
    try {
      const [p, s, j, r] = await Promise.all([sb.query("iv_profiles", ""), sb.query("iv_practice_sessions", "&order=created_at.desc"), sb.query("iv_journal", "&order=created_at.desc"), sb.query("iv_reframes", "&order=created_at.desc")]);
      setClients(p); setAllSessions(s); setAllJournal(j); setAllReframes(r);
    } catch (err) { console.error(err); }
    setLoading(false); setRefreshing(false);
  };
  const loadClientDetail = async (client) => {
    setSelectedClient(client); setPage("clientDetail");
    try {
      const uid = "&user_id=eq." + client.id;
      const [j, r, sc, sp, ss] = await Promise.all([sb.query("iv_journal", uid + "&order=created_at.desc"), sb.query("iv_reframes", uid + "&order=created_at.desc"), sb.query("iv_scenarios", uid + "&order=sort_order.asc"), sb.query("iv_scenario_phrases", uid), sb.query("iv_practice_sessions", uid + "&order=created_at.desc")]);
      setClientDetail({ journal: j, reframes: r, sessions: ss, scenarios: sc.map(s => ({ ...s, phrases: sp.filter(p => p.scenario_id === s.id) })) });
    } catch (err) { console.error(err); }
  };
  const getOv = (id) => getClientOverview(id, allSessions, allJournal);
  const NAV = [{ id: "overview", icon: "\u25C8", label: "\u00DCbersicht" }, { id: "clients", icon: "\u25C9", label: "Klienten" }];
  if (loading) return <Screen><p style={{ color: C.textSoft }}>Daten werden geladen...</p></Screen>;
  return (
    <div style={{ display: "flex", height: "100vh" }}>
      <aside style={{ width: 220, background: C.surface, borderRight: "1px solid " + C.border, display: "flex", flexDirection: "column", flexShrink: 0 }}>
        <div style={{ padding: "20px 16px", borderBottom: "1px solid " + C.border }}>
          <div style={{ fontSize: 10, letterSpacing: 3, color: C.red, fontWeight: 700, marginBottom: 4 }}>INNER VOICE</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.white }}>Coach Admin</div>
        </div>
        <nav style={{ flex: 1, padding: "12px 8px" }}>
          {NAV.map(n => (<button key={n.id} onClick={() => { setPage(n.id); setSelectedClient(null); setClientDetail(null); }} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "10px 12px", background: (page === n.id || (n.id === "clients" && page === "clientDetail")) ? C.card : "transparent", border: "none", borderRadius: 6, color: (page === n.id || (n.id === "clients" && page === "clientDetail")) ? C.white : C.textMid, fontSize: 13, fontWeight: 500, cursor: "pointer", marginBottom: 2, fontFamily: "inherit", textAlign: "left" }}><span style={{ fontSize: 16 }}>{n.icon}</span>{n.label}</button>))}
        </nav>
        <div style={{ padding: 16, borderTop: "1px solid " + C.border }}>
          <div style={{ fontSize: 12, color: C.textSoft, marginBottom: 6 }}>{user.display_name || user.email}</div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><button onClick={onLogout} style={{ background: "none", border: "none", color: C.red, fontSize: 12, cursor: "pointer", padding: 0, fontFamily: "inherit" }}>Abmelden</button><span style={{ fontSize: 10, color: C.textSoft }}>v{APP_VERSION}</span></div>
        </div>
      </aside>
      <main style={{ flex: 1, overflow: "auto", padding: 32 }}>
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
          <button onClick={() => loadAll(true)} disabled={refreshing} style={{ background: "none", border: "1px solid " + C.border, borderRadius: 6, color: refreshing ? C.textSoft : C.textMid, fontSize: 12, padding: "5px 12px", cursor: "pointer", fontFamily: "inherit" }}>{refreshing ? "Aktualisieren..." : "\u21BB Aktualisieren"}</button>
        </div>
        {page === "overview" && <OverviewPage clients={clients} allSessions={allSessions} allJournal={allJournal} allReframes={allReframes} getOv={getOv} onSelectClient={loadClientDetail} />}
        {page === "clients" && <ClientListPage clients={clients} getOv={getOv} onSelectClient={loadClientDetail} />}
        {page === "clientDetail" && selectedClient && <ClientDetailPage client={selectedClient} detail={clientDetail} allSessions={allSessions} allJournal={allJournal} getOv={getOv} onBack={() => { setPage("clients"); setSelectedClient(null); setClientDetail(null); }} />}
      </main>
    </div>
  );
}

function OverviewPage({ clients, allSessions, allJournal, allReframes, getOv, onSelectClient }) {
  const ovs = clients.map(c => ({ ...c, ov: getOv(c.id) }));
  const counts = { green: 0, yellow: 0, red: 0, new: 0 }; ovs.forEach(c => counts[c.ov.status]++);
  const mon = mondayOfWeek(new Date()), lmon = mondayOfWeek(new Date(), 1);
  const stw = allSessions.filter(s => new Date(s.created_at) >= mon).length;
  const slw = allSessions.filter(s => { const d = new Date(s.created_at); return d >= lmon && d < mon; }).length;
  const activeThisWeek = ovs.filter(c => c.ov.sessionsThisWeek > 0).length;
  const attention = ovs.filter(c => c.ov.status === "red" || c.ov.status === "yellow").sort((a, b) => a.ov.status === "red" ? -1 : 1);
  return (
    <div style={{ maxWidth: 1000 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, color: C.white, marginBottom: 4 }}>{"\u00DC"}bersicht</h1>
      <p style={{ fontSize: 14, color: C.textSoft, marginBottom: 24 }}>Dein Coaching auf einen Blick.</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 24 }}>
        <Stat label="Klienten" value={clients.length} />
        <Stat label="Aktiv diese Woche" value={activeThisWeek} color={C.green} sub={"von " + clients.length} />
        <Stat label="Sessions diese Woche" value={stw} color={C.blue} sub={"Letzte Woche: " + slw + (stw > slw ? " \u2197" : stw < slw ? " \u2198" : " \u2192")} />
        <Stat label="Journal-Eintr\u00E4ge" value={allJournal.length} color={C.yellow} sub={allReframes.length + " Reframes"} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 28 }}>
        {["green", "yellow", "red", "new"].map(s => (<div key={s} style={{ background: C.card, border: "1px solid " + C.border, borderRadius: 8, padding: 14, textAlign: "center" }}><div style={{ width: 12, height: 12, borderRadius: 6, background: statusColors[s], margin: "0 auto 6px", boxShadow: "0 0 8px " + statusColors[s] + "40" }} /><div style={{ fontSize: 22, fontWeight: 700, color: C.white }}>{counts[s]}</div><div style={{ fontSize: 11, color: C.textSoft }}>{statusLabels[s]}</div></div>))}
      </div>
      {attention.length > 0 && (<><h2 style={{ fontSize: 15, fontWeight: 600, color: C.white, marginBottom: 10 }}>{"\u26A0"} Brauchen Aufmerksamkeit</h2><div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 24 }}>{attention.map(c => (<button key={c.id} onClick={() => onSelectClient(c)} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", background: C.card, border: "1px solid " + C.border, borderRadius: 8, cursor: "pointer", textAlign: "left", fontFamily: "inherit", width: "100%" }}><div style={{ width: 10, height: 10, borderRadius: 5, background: statusColors[c.ov.status], flexShrink: 0 }} /><div style={{ flex: 1 }}><div style={{ fontSize: 14, fontWeight: 600, color: C.white }}>{c.display_name || c.email}</div></div><div style={{ fontSize: 12, color: C.textSoft, marginRight: 12 }}>{c.ov.moodTrend === "falling" ? "Stimmung sinkt" : c.ov.negPct > 40 ? c.ov.negPct + "% negativ" : ""}</div><div style={{ padding: "3px 10px", borderRadius: 10, background: statusColors[c.ov.status] + "20", color: statusColors[c.ov.status], fontSize: 11, fontWeight: 600 }}>{statusLabels[c.ov.status]}</div></button>))}</div></>)}
      <h2 style={{ fontSize: 15, fontWeight: 600, color: C.white, marginBottom: 10 }}>Letzte Journal-Eintr{"\u00E4"}ge</h2>
      <div style={{ background: C.card, border: "1px solid " + C.border, borderRadius: 10, overflow: "hidden" }}>
        {allJournal.slice(0, 8).map((j, i) => { const who = clients.find(c => c.id === j.user_id); return (<div key={j.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 16px", borderBottom: i < 7 ? "1px solid " + C.border : "none" }}><span style={{ fontSize: 16 }}>{MOODS.find(m => m.v === j.mood)?.e}</span><div style={{ flex: 1 }}><span style={{ fontSize: 13, fontWeight: 600, color: C.white }}>{who?.display_name || "?"}</span><span style={{ fontSize: 13, color: C.textMid, marginLeft: 8 }}>{(j.text || "").slice(0, 80)}{(j.text || "").length > 80 ? "..." : ""}</span></div><span style={{ fontSize: 12, color: (TYPES.find(t => t.v === j.self_talk_type) || {}).c, fontWeight: 500 }}>{(TYPES.find(t => t.v === j.self_talk_type) || {}).l}</span><span style={{ fontSize: 11, color: C.textSoft, whiteSpace: "nowrap" }}>{daysAgo(j.created_at)}</span></div>); })}
        {allJournal.length === 0 && <div style={{ padding: 24, textAlign: "center", color: C.textSoft }}>Noch keine Eintr{"\u00E4"}ge</div>}
      </div>
    </div>
  );
}

function ClientListPage({ clients, getOv, onSelectClient }) {
  const [search, setSearch] = useState(""); const [statusFilter, setStatusFilter] = useState("all");
  const [sortBy, setSortBy] = useState("status"); const [sortDir, setSortDir] = useState("asc");
  const withOv = clients.map(c => ({ ...c, ov: getOv(c.id) }));
  const filtered = withOv.filter(c => { const q = search.toLowerCase(); return (!q || (c.display_name || "").toLowerCase().includes(q) || (c.email || "").toLowerCase().includes(q)) && (statusFilter === "all" || c.ov.status === statusFilter); });
  const statusOrder = { red: 0, yellow: 1, new: 2, green: 3 };
  const sorted = [...filtered].sort((a, b) => { let cmp = 0; if (sortBy === "status") cmp = (statusOrder[a.ov.status] || 0) - (statusOrder[b.ov.status] || 0); else if (sortBy === "name") cmp = (a.display_name || a.email).localeCompare(b.display_name || b.email); else if (sortBy === "sessions") cmp = b.ov.totalSessions - a.ov.totalSessions; else if (sortBy === "journal") cmp = b.ov.totalJournal - a.ov.totalJournal; else if (sortBy === "mood") cmp = (b.ov.avgRecent || 0) - (a.ov.avgRecent || 0); return sortDir === "desc" ? -cmp : cmp; });
  const toggleSort = (col) => { if (sortBy === col) setSortDir(d => d === "asc" ? "desc" : "asc"); else { setSortBy(col); setSortDir("asc"); } };
  const SortTh = ({ col, children, w }) => <th onClick={() => toggleSort(col)} style={{ padding: "10px 14px", textAlign: "left", fontSize: 11, fontWeight: 600, color: sortBy === col ? C.white : C.textSoft, cursor: "pointer", userSelect: "none", letterSpacing: 0.5, textTransform: "uppercase", borderBottom: "1px solid " + C.border, width: w || "auto" }}>{children} {sortBy === col && (sortDir === "asc" ? "\u2191" : "\u2193")}</th>;
  const statusCounts = { all: withOv.length, green: 0, yellow: 0, red: 0, new: 0 }; withOv.forEach(c => statusCounts[c.ov.status]++);
  return (
    <div style={{ maxWidth: 1100 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}><div><h1 style={{ fontSize: 24, fontWeight: 700, color: C.white, marginBottom: 4 }}>Klienten</h1><p style={{ fontSize: 14, color: C.textSoft }}>{filtered.length} von {clients.length}</p></div><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Suchen..." style={{ padding: "9px 14px", width: 240, background: C.card, border: "1px solid " + C.border, borderRadius: 6, color: C.text, fontSize: 13, fontFamily: "inherit" }} /></div>
      <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
        {[{ id: "all", label: "Alle" }, { id: "red", label: "Eingreifen" }, { id: "yellow", label: "Beobachten" }, { id: "green", label: "Gut dabei" }, { id: "new", label: "Neu" }].map(f => (<button key={f.id} onClick={() => setStatusFilter(f.id)} style={{ padding: "6px 14px", borderRadius: 6, border: statusFilter === f.id ? "1px solid " + (f.id === "all" ? C.textMid : statusColors[f.id]) : "1px solid " + C.border, background: statusFilter === f.id ? (f.id === "all" ? C.textMid : statusColors[f.id]) + "15" : "transparent", color: statusFilter === f.id ? (f.id === "all" ? C.white : statusColors[f.id]) : C.textSoft, fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>{f.label} ({statusCounts[f.id]})</button>))}
      </div>
      {sorted.length === 0 ? <Empty text="Keine Klienten gefunden" /> : (
        <div style={{ background: C.card, border: "1px solid " + C.border, borderRadius: 10, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr style={{ background: C.surface }}><SortTh col="status" w={50}>Status</SortTh><SortTh col="name">Name</SortTh><Th>E-Mail</Th><Th>Letzte Aktivit{"\u00E4"}t</Th><SortTh col="sessions">Sessions</SortTh><SortTh col="journal">Journal</SortTh><SortTh col="mood">Stimmung</SortTh><Th>Self-Talk</Th></tr></thead>
            <tbody>{sorted.map(c => (<tr key={c.id} onClick={() => onSelectClient(c)} style={{ cursor: "pointer", borderBottom: "1px solid " + C.border }} onMouseEnter={e => e.currentTarget.style.background = C.surface} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
              <td style={{ padding: "12px 14px" }}><div style={{ width: 10, height: 10, borderRadius: 5, background: statusColors[c.ov.status], boxShadow: "0 0 6px " + statusColors[c.ov.status] + "40" }} /></td>
              <td style={{ padding: "12px 14px", fontWeight: 600, color: C.white, fontSize: 14 }}>{c.display_name || "\u2013"}</td>
              <td style={{ padding: "12px 14px", color: C.textMid, fontSize: 13 }}>{c.email}</td>
              <td style={{ padding: "12px 14px", color: C.textMid, fontSize: 13 }}>{c.ov.lastActive ? daysAgo(c.ov.lastActive) : "Nie"}</td>
              <td style={{ padding: "12px 14px", color: C.white, fontWeight: 600 }}>{c.ov.totalSessions}</td>
              <td style={{ padding: "12px 14px", color: C.white, fontWeight: 600 }}>{c.ov.totalJournal}</td>
              <td style={{ padding: "12px 14px" }}>{c.ov.avgRecent ? <span style={{ color: trendColors[c.ov.moodTrend], fontSize: 13 }}>{trendIcons[c.ov.moodTrend]} {"\u00D8"} {c.ov.avgRecent.toFixed(1)}</span> : <span style={{ color: C.textSoft }}>{"\u2013"}</span>}</td>
              <td style={{ padding: "12px 14px", minWidth: 120 }}>{(c.ov.posPct + c.ov.neuPct + c.ov.negPct) > 0 ? <div style={{ display: "flex", height: 6, borderRadius: 3, overflow: "hidden" }}>{c.ov.posPct > 0 && <div style={{ width: c.ov.posPct + "%", background: C.green }} />}{c.ov.neuPct > 0 && <div style={{ width: c.ov.neuPct + "%", background: C.yellow }} />}{c.ov.negPct > 0 && <div style={{ width: c.ov.negPct + "%", background: "#EF4444" }} />}</div> : <span style={{ color: C.textSoft, fontSize: 13 }}>{"\u2013"}</span>}</td>
            </tr>))}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ClientDetailPage({ client, detail, allSessions, allJournal, getOv, onBack }) {
  const [tab, setTab] = useState("overview");
  const [journalFilter, setJournalFilter] = useState("all");
  const [notes, setNotes] = useState(() => localStorage.getItem("iv_notes_" + client.id) || "");
  const [notesSaved, setNotesSaved] = useState(false);
  const ov = getOv(client.id);
  const saveNotes = () => { localStorage.setItem("iv_notes_" + client.id, notes); setNotesSaved(true); setTimeout(() => setNotesSaved(false), 1500); };
  const getWeeks = () => {
    if (!detail) return [];
    const weeks = []; const now = new Date();
    for (let w = 0; w < 6; w++) {
      const mon = mondayOfWeek(now, w); const sun = new Date(mon); sun.setDate(mon.getDate() + 7);
      const wS = detail.sessions.filter(s => { const d = new Date(s.created_at); return d >= mon && d < sun; });
      const wJ = detail.journal.filter(j => { const d = new Date(j.created_at); return d >= mon && d < sun; });
      const exerciseDays = [...new Set(wS.map(s => s.created_at.slice(0, 10)))].length;
      const moods = wJ.map(j => j.mood);
      const moodAvg = moods.length ? moods.reduce((a, b) => a + b, 0) / moods.length : null;
      const neg = wJ.filter(j => j.self_talk_type === "negative").length, pos = wJ.filter(j => j.self_talk_type === "positive").length, total = wJ.length;
      weeks.push({ label: w === 0 ? "Diese Woche" : w === 1 ? "Letzte Woche" : "Vor " + w + " Wo.", range: fmtDate(mon) + " \u2013 " + fmtDate(new Date(sun.getTime() - 86400000)), exerciseDays, sessions: wS.length, moodAvg, journalCount: total, posPct: total ? Math.round(pos / total * 100) : 0, negPct: total ? Math.round(neg / total * 100) : 0 });
    }
    return weeks;
  };
  const weeks = getWeeks();
  const TABS = [{ id: "overview", label: "\u00DCberblick" }, { id: "journal", label: "Journal (" + (detail?.journal?.length || 0) + ")" }, { id: "scenarios", label: "Szenarien (" + (detail?.scenarios?.length || 0) + ")" }, { id: "reframes", label: "Reframes (" + (detail?.reframes?.length || 0) + ")" }, { id: "sessions", label: "Sessions (" + (detail?.sessions?.length || 0) + ")" }, { id: "notes", label: "Notizen" }];
  return (
    <div style={{ maxWidth: 1100 }}>
      <button onClick={onBack} style={{ background: "none", border: "none", color: C.red, fontSize: 13, cursor: "pointer", marginBottom: 16, fontFamily: "inherit", padding: 0 }}>{"\u2190"} Alle Klienten</button>
      <div style={{ background: C.card, border: "1px solid " + C.border, borderRadius: 10, padding: 20, marginBottom: 20, borderLeft: "3px solid " + statusColors[ov.status] }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div><h1 style={{ fontSize: 22, fontWeight: 700, color: C.white, marginBottom: 4 }}>{client.display_name || client.email}</h1><p style={{ fontSize: 13, color: C.textSoft }}>{client.email} {"\u00B7"} Registriert {fmtDate(client.created_at)} {"\u00B7"} Letzte Aktivit{"\u00E4"}t: {ov.lastActive ? daysAgo(ov.lastActive) : "Nie"}</p></div>
          <div style={{ padding: "4px 14px", borderRadius: 12, background: statusColors[ov.status] + "20", color: statusColors[ov.status], fontSize: 12, fontWeight: 600 }}>{statusLabels[ov.status]}</div>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10, marginBottom: 20 }}>
        <Stat label="Sessions gesamt" value={ov.totalSessions} color={C.blue} />
        <Stat label="Diese Woche" value={ov.sessionsThisWeek + " Tage"} color={C.green} />
        <Stat label="Journal" value={ov.totalJournal} color={C.yellow} />
        <Stat label="Stimmung" value={ov.avgRecent ? "\u00D8 " + ov.avgRecent.toFixed(1) : "\u2013"} color={trendColors[ov.moodTrend]} sub={ov.avgRecent ? trendIcons[ov.moodTrend] + " " + (ov.moodTrend === "rising" ? "steigend" : ov.moodTrend === "falling" ? "sinkend" : "stabil") : ""} />
        <Stat label="Reframes" value={detail?.reframes?.length || 0} color={C.textMid} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 10, marginBottom: 20 }}>
        {ov.moods.length > 0 ? <div style={{ background: C.card, border: "1px solid " + C.border, borderRadius: 10, padding: 16 }}><div style={{ fontSize: 11, color: C.textSoft, fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 8 }}>Stimmungsverlauf ({ov.moods.length} Eintr{"\u00E4"}ge)</div><MoodChart moods={ov.moods} /></div> : <div style={{ background: C.card, border: "1px solid " + C.border, borderRadius: 10, padding: 16, display: "flex", alignItems: "center", justifyContent: "center", color: C.textSoft }}>Keine Stimmungsdaten</div>}
        <div style={{ background: C.card, border: "1px solid " + C.border, borderRadius: 10, padding: 16 }}><div style={{ fontSize: 11, color: C.textSoft, fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 8 }}>Self-Talk Verteilung</div>{(ov.posPct + ov.neuPct + ov.negPct) > 0 ? <SelfTalkBar posPct={ov.posPct} neuPct={ov.neuPct} negPct={ov.negPct} /> : <div style={{ color: C.textSoft, fontSize: 13 }}>Keine Daten</div>}</div>
      </div>
      <div style={{ display: "flex", gap: 2, marginBottom: 16, borderBottom: "1px solid " + C.border }}>{TABS.map(t => (<button key={t.id} onClick={() => setTab(t.id)} style={{ padding: "10px 16px", background: "none", border: "none", borderBottom: tab === t.id ? "2px solid " + C.red : "2px solid transparent", color: tab === t.id ? C.white : C.textSoft, fontSize: 13, fontWeight: tab === t.id ? 600 : 400, cursor: "pointer", fontFamily: "inherit" }}>{t.label}</button>))}</div>
      {!detail ? <div style={{ padding: 40, textAlign: "center", color: C.textSoft }}>Laden...</div> : (<>
        {tab === "overview" && (<div>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: C.white, marginBottom: 10 }}>Wochenverlauf</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 8, marginBottom: 20 }}>{weeks.map((w, i) => (<div key={i} style={{ background: C.card, border: "1px solid " + C.border, borderRadius: 8, padding: 12, borderTop: i === 0 ? "2px solid " + C.red : "none" }}><div style={{ fontSize: 11, fontWeight: 600, color: i === 0 ? C.white : C.textSoft, marginBottom: 2 }}>{w.label}</div><div style={{ fontSize: 9, color: C.textSoft, marginBottom: 8 }}>{w.range}</div><div style={{ fontSize: 18, fontWeight: 700, color: C.white, marginBottom: 2 }}>{w.exerciseDays}<span style={{ fontSize: 11, color: C.textSoft, fontWeight: 400 }}> Tage</span></div><div style={{ fontSize: 11, color: C.textSoft, marginBottom: 4 }}>{w.sessions} Sessions {"\u00B7"} {w.journalCount} Journal</div>{w.moodAvg !== null && <div style={{ fontSize: 11, color: C.textMid }}>Stimmung {"\u00D8"} {w.moodAvg.toFixed(1)}</div>}{w.journalCount > 0 && <div style={{ display: "flex", height: 4, borderRadius: 2, overflow: "hidden", marginTop: 4 }}>{w.posPct > 0 && <div style={{ width: w.posPct + "%", background: C.green }} />}{(100 - w.posPct - w.negPct) > 0 && <div style={{ width: (100 - w.posPct - w.negPct) + "%", background: C.yellow }} />}{w.negPct > 0 && <div style={{ width: w.negPct + "%", background: "#EF4444" }} />}</div>}</div>))}</div>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: C.white, marginBottom: 10 }}>Szenarien ({detail.scenarios.length})</h3>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 20 }}>{detail.scenarios.map(s => (<div key={s.id} style={{ padding: "6px 12px", background: C.card, border: "1px solid " + C.border, borderRadius: 6, fontSize: 12, color: C.textMid }}>{s.icon} {s.name} <span style={{ color: C.textSoft }}>({s.phrases.length})</span></div>))}{!detail.scenarios.length && <div style={{ color: C.textSoft, fontSize: 13 }}>Keine Szenarien</div>}</div>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: C.white, marginBottom: 10 }}>Letzte Journal-Eintr{"\u00E4"}ge</h3>
          {detail.journal.slice(0, 5).map(j => (<div key={j.id} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 0", borderBottom: "1px solid " + C.border }}><span style={{ fontSize: 18 }}>{MOODS.find(m => m.v === j.mood)?.e}</span><div style={{ flex: 1 }}><div style={{ fontSize: 13, color: C.text, lineHeight: 1.5 }}>{j.text}</div><div style={{ fontSize: 11, color: C.textSoft, marginTop: 2 }}>{fmtDateTime(j.created_at)} {"\u00B7"} <span style={{ color: (TYPES.find(t => t.v === j.self_talk_type) || {}).c }}>{(TYPES.find(t => t.v === j.self_talk_type) || {}).l}</span></div></div></div>))}
          {!detail.journal.length && <div style={{ color: C.textSoft, fontSize: 13, padding: "12px 0" }}>Keine Eintr{"\u00E4"}ge</div>}
        </div>)}
        {tab === "journal" && (<div>
          <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>{[{ id: "all", label: "Alle" }, ...TYPES.map(t => ({ id: t.v, label: t.l }))].map(f => (<button key={f.id} onClick={() => setJournalFilter(f.id)} style={{ padding: "5px 12px", borderRadius: 5, border: "1px solid " + (journalFilter === f.id ? C.red : C.border), background: journalFilter === f.id ? C.red + "15" : "transparent", color: journalFilter === f.id ? C.red : C.textSoft, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>{f.label}</button>))}</div>
          {(() => { const f = journalFilter === "all" ? detail.journal : detail.journal.filter(j => j.self_talk_type === journalFilter); if (!f.length) return <Empty text="Keine Eintr\u00E4ge" />; return (<div style={{ background: C.card, border: "1px solid " + C.border, borderRadius: 10, overflow: "hidden" }}><table style={{ width: "100%", borderCollapse: "collapse" }}><thead><tr style={{ background: C.surface }}><Th>Datum</Th><Th>Stimmung</Th><Th>Typ</Th><Th>Text</Th></tr></thead><tbody>{f.map(j => (<tr key={j.id} style={{ borderBottom: "1px solid " + C.border }}><td style={{ padding: "10px 14px", fontSize: 13, color: C.textMid, whiteSpace: "nowrap" }}>{fmtDateTime(j.created_at)}</td><td style={{ padding: "10px 14px", fontSize: 18 }}>{MOODS.find(m => m.v === j.mood)?.e}</td><td style={{ padding: "10px 14px" }}><span style={{ fontSize: 12, color: (TYPES.find(t => t.v === j.self_talk_type) || {}).c, fontWeight: 500 }}>{(TYPES.find(t => t.v === j.self_talk_type) || {}).l}</span></td><td style={{ padding: "10px 14px", fontSize: 13, color: C.text, lineHeight: 1.5, maxWidth: 500 }}>{j.text}</td></tr>))}</tbody></table></div>); })()}
        </div>)}
        {tab === "scenarios" && (detail.scenarios.length === 0 ? <Empty text="Keine Szenarien" /> : <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>{detail.scenarios.map(s => (<div key={s.id} style={{ background: C.card, border: "1px solid " + C.border, borderRadius: 10, padding: 16 }}><div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}><span style={{ fontSize: 22 }}>{s.icon}</span><div><div style={{ fontSize: 14, fontWeight: 600, color: C.white }}>{s.name}</div>{s.description && <div style={{ fontSize: 12, color: C.textSoft }}>{s.description}</div>}</div></div>{s.phrases.map(p => (<div key={p.id} style={{ padding: "6px 10px", background: C.surface, borderRadius: 6, marginBottom: 4, fontSize: 13, color: C.textMid, lineHeight: 1.5 }}>"{p.text}"</div>))}{!s.phrases.length && <div style={{ fontSize: 12, color: C.textSoft, fontStyle: "italic" }}>Keine S{"\u00E4"}tze</div>}</div>))}</div>)}
        {tab === "reframes" && (detail.reframes.length === 0 ? <Empty text="Keine Reframes" /> : <div style={{ background: C.card, border: "1px solid " + C.border, borderRadius: 10, overflow: "hidden" }}><table style={{ width: "100%", borderCollapse: "collapse" }}><thead><tr style={{ background: C.surface }}><Th>Datum</Th><Th>Negativer Gedanke</Th><Th>Positiver Reframe</Th></tr></thead><tbody>{detail.reframes.map(r => (<tr key={r.id} style={{ borderBottom: "1px solid " + C.border }}><td style={{ padding: "10px 14px", fontSize: 13, color: C.textMid, whiteSpace: "nowrap" }}>{fmtDate(r.created_at)}</td><td style={{ padding: "10px 14px", fontSize: 13, color: "#F87171", lineHeight: 1.5 }}>{r.negative_text}</td><td style={{ padding: "10px 14px", fontSize: 13, color: C.green, lineHeight: 1.5 }}>{r.positive_text}</td></tr>))}</tbody></table></div>)}
        {tab === "sessions" && (detail.sessions.length === 0 ? <Empty text="Keine Sessions" /> : <div style={{ background: C.card, border: "1px solid " + C.border, borderRadius: 10, overflow: "hidden" }}><table style={{ width: "100%", borderCollapse: "collapse" }}><thead><tr style={{ background: C.surface }}><Th>Datum</Th><Th>Typ</Th><Th>Szenario</Th><Th>Anzahl</Th></tr></thead><tbody>{detail.sessions.map(s => (<tr key={s.id} style={{ borderBottom: "1px solid " + C.border }}><td style={{ padding: "10px 14px", fontSize: 13, color: C.textMid, whiteSpace: "nowrap" }}>{fmtDateTime(s.created_at)}</td><td style={{ padding: "10px 14px", fontSize: 13, color: C.white }}>{s.session_type === "practice" ? "\u25B6 Praxis" : "\u27F2 Reframe-\u00DCbung"}</td><td style={{ padding: "10px 14px", fontSize: 13, color: C.textMid }}>{s.scenario_name || "\u2013"}</td><td style={{ padding: "10px 14px", fontSize: 13, color: C.white }}>{s.phrases_count} {s.session_type === "practice" ? "S\u00E4tze" : "Karten"}</td></tr>))}</tbody></table></div>)}
        {tab === "notes" && (<div style={{ background: C.card, border: "1px solid " + C.border, borderRadius: 10, padding: 20 }}><div style={{ fontSize: 11, fontWeight: 600, color: C.textSoft, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 10 }}>Private Notizen zu {client.display_name || client.email}</div><p style={{ fontSize: 12, color: C.textSoft, marginBottom: 12 }}>Nur f{"\u00FC"}r dich sichtbar. Wird lokal im Browser gespeichert.</p><textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notizen hier eingeben..." rows={10} style={{ width: "100%", background: C.surface, border: "1px solid " + C.border, borderRadius: 6, color: C.text, padding: 14, fontSize: 14, resize: "vertical", lineHeight: 1.6, fontFamily: "inherit" }} /><div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}><button onClick={saveNotes} style={{ padding: "8px 24px", background: C.red, border: "none", borderRadius: 6, color: C.white, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>{notesSaved ? "\u2713 Gespeichert" : "Speichern"}</button></div></div>)}
      </>)}
    </div>
  );
}
