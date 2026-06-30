/* =========================================================================
 *  Storie Insights · ABMedia
 *  Lee métricas de IG Stories via Meta Graph API y las cruza con
 *  las secuencias creadas en Sequence Builder.
 * ========================================================================= */

const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

const state = {
  user: null, isAdmin: false, view: "dashboard",
  connections: [], insights: [], sequences: []
};

const FUNCTIONS_BASE = "https://jiuhhnjpggdcjyjchxir.supabase.co/functions/v1";

/* -------------------------- Auth -------------------------- */
async function bootSession(user) {
  state.user = user;
  state.isAdmin = sbAuth.isAdmin(user);

  if (!state.isAdmin) {
    const ok = await sbAuth.sbIsAllowed(user.email);
    if (!ok) {
      $("#loginScreen").classList.add("hidden");
      $("#appRoot").classList.add("hidden");
      $("#notAllowed").classList.remove("hidden");
      $("#notAllowedEmail").textContent = user.email || "";
      return;
    }
  }
  $("#loginScreen").classList.add("hidden");
  $("#notAllowed").classList.add("hidden");
  $("#appRoot").classList.remove("hidden");
  $("#userEmail").textContent = user.email || "";
  $("#adminTab").classList.toggle("hidden", !state.isAdmin);

  await loadConnections();
  await loadInsights();
  await loadSequences();
  setView("dashboard");
}
function showLogin() {
  $("#appRoot").classList.add("hidden");
  $("#notAllowed").classList.add("hidden");
  $("#loginScreen").classList.remove("hidden");
}

function bindLogin() {
  const err = $("#loginError");
  $("#loginBtn").addEventListener("click", async () => {
    err.textContent = "";
    const email = $("#loginEmail").value.trim();
    const pass = $("#loginPass").value;
    if (!email || !pass) { err.textContent = "Email y contraseña requeridos."; return; }
    try { await sbAuth.sbSignIn(email, pass); }
    catch (e) { err.textContent = e.message || "Error al iniciar sesión."; }
  });
  $("#logoutBtn").addEventListener("click", async () => { await sbAuth.sbSignOut(); });
  $("#notAllowedLogout").addEventListener("click", async () => { await sbAuth.sbSignOut(); });
}

/* -------------------------- Datos -------------------------- */
async function loadConnections() {
  const { data, error } = await sb.from("ig_connections").select("*").order("connected_at", { ascending: false });
  if (error) { console.warn(error); return; }
  state.connections = data || [];
}
async function loadInsights() {
  const { data, error } = await sb.from("ig_story_insights").select("*")
    .order("story_ts", { ascending: false }).limit(500);
  if (error) { console.warn(error); return; }
  state.insights = data || [];
}
async function loadSequences() {
  // Lee secuencias del usuario desde la misma BD (Sequence Builder)
  const { data, error } = await sb.from("sequences").select("id,title,category,style,slides").limit(500);
  if (error) { console.warn(error); return; }
  state.sequences = data || [];
}

/* -------------------------- Vistas -------------------------- */
function setView(v) {
  state.view = v;
  $$(".nav-item").forEach(n => n.classList.toggle("active", n.dataset.view === v));
  ["dashboard", "sequences", "today", "history", "connections", "admin"].forEach(x => {
    const el = $("#view-" + x);
    if (el) el.classList.toggle("hidden", x !== v);
  });
  renderView();
}
function renderView() {
  if (state.view === "dashboard") renderDashboard();
  else if (state.view === "sequences") renderSequences();
  else if (state.view === "today") renderToday();
  else if (state.view === "history") renderHistory();
  else if (state.view === "connections") renderConnections();
  else if (state.view === "admin") renderAdmin();
}

/* -------------------------- DASHBOARD -------------------------- */
function renderDashboard() {
  const hasConn = state.connections.length > 0;
  $("#noConn").classList.toggle("hidden", hasConn);
  $("#dashContent").classList.toggle("hidden", !hasConn);
  if (!hasConn) return;

  // Últimos 7 días
  const now = Date.now();
  const recent = state.insights.filter(i => (now - new Date(i.story_ts).getTime()) < 7 * 86400000);
  const totalReach = recent.reduce((a, b) => a + (b.reach || 0), 0);
  const totalReplies = recent.reduce((a, b) => a + (b.replies || 0), 0);
  const avgCompletion = recent.length
    ? Math.round(recent.reduce((a, b) => {
        const imp = b.impressions || 1;
        return a + ((1 - (b.exits || 0) / imp) * 100);
      }, 0) / recent.length)
    : 0;

  $("#kpiStories").textContent = recent.length;
  $("#kpiReach").textContent = formatNum(totalReach);
  $("#kpiCompletion").textContent = avgCompletion + "%";
  $("#kpiReplies").textContent = totalReplies;

  // Por categoría — agrupando insights por categoría de la secuencia
  const byCat = { personal: [], venta: [], puente: [] };
  recent.forEach(i => {
    const seq = state.sequences.find(s => s.id === i.sequence_id);
    const cat = seq?.category;
    if (cat && byCat[cat]) byCat[cat].push(i);
  });
  const catNames = { personal: "Personal", venta: "Venta", puente: "Puente" };
  $("#catBreakdown").innerHTML = Object.entries(byCat).map(([k, arr]) => {
    const reach = arr.reduce((a, b) => a + (b.reach || 0), 0);
    const replies = arr.reduce((a, b) => a + (b.replies || 0), 0);
    return `<div class="cat-stat">
      <div class="name">${catNames[k]}</div>
      <div class="rows">
        <div class="row">Stories <strong>${arr.length}</strong></div>
        <div class="row">Alcance <strong>${formatNum(reach)}</strong></div>
        <div class="row">DMs <strong>${replies}</strong></div>
      </div>
    </div>`;
  }).join("");

  // Top secuencias por completion
  const seqAgg = aggregateBySequence();
  const top = [...seqAgg.values()]
    .filter(x => x.stories >= 1)
    .sort((a, b) => b.completion - a.completion)
    .slice(0, 5);
  $("#topSeqs").innerHTML = top.length
    ? top.map((x, i) => `<div class="seq-row">
        <div><div class="title">${escapeHtml(x.title)}</div><div class="cat">${catNames[x.category] || x.category}</div></div>
        <div class="metric"><b>${x.completion}%</b><small>completion</small></div>
        <div class="metric"><b>${formatNum(x.reach)}</b><small>alcance</small></div>
        <div class="metric"><b>${x.replies}</b><small>DMs</small></div>
        <div class="rank">#${i + 1}</div>
      </div>`).join("")
    : `<p class="empty-state es-sub">Cuando empieces a publicar, aquí verás tu ranking.</p>`;

  renderAiInsights(recent, seqAgg);
}

function aggregateBySequence() {
  const m = new Map();
  state.insights.forEach(i => {
    if (!i.sequence_id) return;
    const seq = state.sequences.find(s => s.id === i.sequence_id);
    if (!seq) return;
    const key = i.sequence_id;
    if (!m.has(key)) m.set(key, { id: key, title: seq.title, category: seq.category,
      stories: 0, reach: 0, replies: 0, completion: 0, _completionSum: 0 });
    const o = m.get(key);
    o.stories++;
    o.reach += i.reach || 0;
    o.replies += i.replies || 0;
    const imp = i.impressions || 1;
    o._completionSum += (1 - (i.exits || 0) / imp) * 100;
  });
  m.forEach(o => { o.completion = Math.round(o._completionSum / o.stories); });
  return m;
}

function renderAiInsights(recent, seqAgg) {
  const ins = [];
  if (recent.length) {
    const top = [...seqAgg.values()].sort((a, b) => b.completion - a.completion)[0];
    if (top) ins.push({ ic: "Mejor framework", t: `Tu secuencia <strong>${escapeHtml(top.title)}</strong> tiene un completion del ${top.completion}%. Replícala con variaciones.` });
    const avg = recent.reduce((a, b) => a + (b.reach || 0), 0) / recent.length;
    ins.push({ ic: "Alcance medio", t: `Promedio de <strong>${formatNum(Math.round(avg))}</strong> personas alcanzadas por story esta semana.` });
    const replies = recent.reduce((a, b) => a + (b.replies || 0), 0);
    if (replies < recent.length * 2) ins.push({ ic: "Pocos DMs", t: "Estás generando pocos DMs. Prueba añadir más CTAs directos (\"responde X\", encuestas, preguntas)." });
  } else {
    ins.push({ ic: "Sin datos", t: "Publica tus primeras stories y sincroniza para ver insights." });
  }
  $("#aiInsights").innerHTML = ins.map(i => `<div class="insight"><div class="ic">${i.ic}</div><p>${i.t}</p></div>`).join("");
}

/* -------------------------- POR SECUENCIA -------------------------- */
function renderSequences() {
  const agg = aggregateBySequence();
  const items = [...agg.values()].sort((a, b) => b.reach - a.reach);
  const grid = $("#seqMetrics");
  if (!items.length) {
    grid.innerHTML = `<p class="empty-state es-sub">Cuando publiques stories de tus secuencias, aparecerán aquí.</p>`;
    return;
  }
  const catNames = { personal: "Personal", venta: "Venta", puente: "Puente" };
  grid.innerHTML = items.map(x => `
    <div class="seq-row">
      <div><div class="title">${escapeHtml(x.title)}</div><div class="cat">${catNames[x.category] || x.category}</div></div>
      <div class="metric"><b>${x.stories}</b><small>publicadas</small></div>
      <div class="metric"><b>${formatNum(x.reach)}</b><small>alcance</small></div>
      <div class="metric"><b>${x.completion}%</b><small>completion</small></div>
      <div class="metric"><b>${x.replies}</b><small>DMs</small></div>
    </div>`).join("");
}

/* -------------------------- HOY (24h) -------------------------- */
function renderToday() {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const today = state.insights.filter(i => new Date(i.story_ts).getTime() >= cutoff)
    .sort((a, b) => new Date(b.story_ts) - new Date(a.story_ts));
  $("#todayCount").textContent = `${today.length} stories`;
  const list = $("#todayList");
  if (!today.length) {
    list.innerHTML = `<p class="empty-state es-sub">No has publicado stories en las últimas 24h o aún no se han sincronizado.</p>`;
    return;
  }
  list.innerHTML = today.map(i => {
    const imp = i.impressions || 1;
    const compl = Math.round((1 - (i.exits || 0) / imp) * 100);
    return `<div class="story-card">
      ${i.permalink ? `<a href="${i.permalink}" target="_blank"><img class="story-thumb" src="${i.permalink}" alt="story" onerror="this.style.display='none'"/></a>` : `<div class="story-thumb"></div>`}
      <div class="story-meta">
        <div class="time">${new Date(i.story_ts).toLocaleString("es-ES")}</div>
        <div class="stats">
          <div class="stat"><b>${formatNum(i.reach || 0)}</b>alcance</div>
          <div class="stat"><b>${i.replies || 0}</b>DMs</div>
          <div class="stat"><b>${i.taps_forward || 0}</b>adelante</div>
          <div class="stat"><b>${i.exits || 0}</b>salidas</div>
        </div>
        <div class="completion-bar"><div class="fill" style="width:${compl}%"></div></div>
        <div class="stat">${compl}% completion</div>
      </div>
    </div>`;
  }).join("");
}

/* -------------------------- HISTÓRICO -------------------------- */
function renderHistory() {
  const days = parseInt($("#histRange").value, 10);
  const cutoff = Date.now() - days * 86400000;
  const data = state.insights.filter(i => new Date(i.story_ts).getTime() >= cutoff);

  // Bucketize por día
  const buckets = new Map();
  data.forEach(i => {
    const d = new Date(i.story_ts);
    const k = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
    if (!buckets.has(k)) buckets.set(k, { reach: 0, replies: 0, completionSum: 0, stories: 0 });
    const b = buckets.get(k);
    b.reach += i.reach || 0;
    b.replies += i.replies || 0;
    const imp = i.impressions || 1;
    b.completionSum += (1 - (i.exits || 0) / imp) * 100;
    b.stories++;
  });
  const series = [...buckets.entries()].sort().slice(-days);

  renderBars("#chartReach", series.map(([k, b]) => ({ v: b.reach, label: k })));
  renderBars("#chartCompletion", series.map(([k, b]) => ({ v: b.stories ? Math.round(b.completionSum / b.stories) : 0, label: k, suffix: "%" })));
  renderBars("#chartReplies", series.map(([k, b]) => ({ v: b.replies, label: k })));

  // Por framework (categoría)
  const byCat = { personal: 0, venta: 0, puente: 0 };
  data.forEach(i => {
    const seq = state.sequences.find(s => s.id === i.sequence_id);
    if (seq && byCat[seq.category] !== undefined) byCat[seq.category] += i.reach || 0;
  });
  const catNames = { personal: "Personal", venta: "Venta", puente: "Puente" };
  renderBars("#chartFrameworks", Object.entries(byCat).map(([k, v]) => ({ v, label: catNames[k] })));
}
function renderBars(sel, items) {
  const box = $(sel); if (!box) return;
  if (!items.length || items.every(x => !x.v)) {
    box.innerHTML = `<div style="color: var(--faint); font-size: 12px; margin: auto;">Sin datos</div>`;
    return;
  }
  const max = Math.max(...items.map(x => x.v));
  box.innerHTML = items.map(x => `
    <div class="chart-bar" style="height:${max ? (x.v/max)*100 : 0}%" data-v="${x.label}: ${formatNum(x.v)}${x.suffix||''}"></div>
  `).join("");
}

/* -------------------------- CONEXIONES -------------------------- */
function renderConnections() {
  const list = $("#connList");
  if (!state.connections.length) {
    list.innerHTML = `<p class="empty-state es-sub">Aún no has conectado ninguna cuenta. Pulsa el botón de arriba.</p>`;
    return;
  }
  list.innerHTML = state.connections.map(c => `
    <div class="conn-card">
      <div class="ig">
        <div class="ig-icon">IG</div>
        <div>
          <div class="username">@${escapeHtml(c.ig_username || "—")}</div>
          <div class="since">Conectada ${new Date(c.connected_at).toLocaleDateString("es-ES")}</div>
        </div>
      </div>
      <div class="since">Última sincronización: ${c.last_synced ? new Date(c.last_synced).toLocaleString("es-ES") : "nunca"}</div>
      <div class="actions">
        <button class="btn btn-ghost xs" data-act="sync" data-id="${c.id}">🔄 Sincronizar ahora</button>
        <button class="btn btn-ghost xs danger" data-act="disconnect" data-id="${c.id}">Desconectar</button>
      </div>
    </div>`).join("");
  list.querySelectorAll('[data-act="disconnect"]').forEach(b => b.addEventListener("click", async () => {
    if (!confirm("¿Desconectar esta cuenta? Las métricas históricas se mantienen.")) return;
    await sb.from("ig_connections").delete().eq("id", b.dataset.id);
    await loadConnections(); renderConnections();
  }));
  list.querySelectorAll('[data-act="sync"]').forEach(b => b.addEventListener("click", () => syncConnection(b.dataset.id)));
}

/* -------------------------- ADMIN -------------------------- */
async function renderAdmin() {
  const grid = $("#adminGrid");
  grid.innerHTML = `<p class="empty-state es-sub">Cargando…</p>`;
  // El admin RLS le permite ver TODO
  const { data: conns } = await sb.from("ig_connections").select("*");
  const { data: ins } = await sb.from("ig_story_insights").select("owner,reach,replies");
  const byOwner = {};
  (ins || []).forEach(i => {
    if (!byOwner[i.owner]) byOwner[i.owner] = { reach: 0, replies: 0, stories: 0 };
    byOwner[i.owner].reach += i.reach || 0;
    byOwner[i.owner].replies += i.replies || 0;
    byOwner[i.owner].stories++;
  });
  if (!conns || !conns.length) { grid.innerHTML = `<p class="empty-state es-sub">Ningún cliente ha conectado IG todavía.</p>`; return; }
  grid.innerHTML = conns.map(c => {
    const s = byOwner[c.owner] || { reach: 0, replies: 0, stories: 0 };
    return `<div class="conn-card">
      <div class="ig"><div class="ig-icon">IG</div>
        <div>
          <div class="username">@${escapeHtml(c.ig_username || "—")}</div>
          <div class="since">Cliente: ${c.owner.slice(0, 8)}…</div>
        </div></div>
      <div class="rows">
        <div class="row">Stories medidas: <strong>${s.stories}</strong></div>
        <div class="row">Alcance total: <strong>${formatNum(s.reach)}</strong></div>
        <div class="row">DMs: <strong>${s.replies}</strong></div>
      </div>
    </div>`;
  }).join("");
}

/* -------------------------- OAuth IG -------------------------- */
async function startConnect() {
  try {
    const { data } = await sb.auth.getSession();
    const token = data?.session?.access_token;
    if (!token) { alert("Sesión expirada"); return; }
    const r = await fetch(`${FUNCTIONS_BASE}/ig-oauth-start`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const j = await r.json();
    if (j.url) location.href = j.url;
    else alert("Error iniciando OAuth: " + (j.error || "desconocido"));
  } catch (e) {
    alert("La función de Meta OAuth todavía no está configurada. Estamos esperando la App Review de Meta.\n\nMientras tanto puedes probarlo en modo developer si añades tu cuenta como tester en la app de Meta.");
  }
}
async function syncConnection(connId) {
  try {
    const { data } = await sb.auth.getSession();
    const token = data?.session?.access_token;
    const r = await fetch(`${FUNCTIONS_BASE}/ig-sync-stories?conn=${connId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const j = await r.json();
    alert(j.message || `Sincronizadas ${j.synced || 0} stories.`);
    await loadInsights(); await loadConnections(); renderView();
  } catch (e) {
    alert("Sincronización aún no disponible (App Review pendiente).");
  }
}

/* -------------------------- Util -------------------------- */
function formatNum(n) {
  n = n || 0;
  if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
  if (n >= 1000) return (n / 1000).toFixed(1) + "K";
  return String(n);
}
function escapeHtml(s) {
  return (s || "").replace(/[&<>"']/g, m => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
}

/* -------------------------- Init -------------------------- */
function bind() {
  $$(".nav-item").forEach(n => n.addEventListener("click", () => setView(n.dataset.view)));
  $("#syncBtn")?.addEventListener("click", () => {
    if (state.connections[0]) syncConnection(state.connections[0].id);
    else setView("connections");
  });
  $("#connectIgBtn")?.addEventListener("click", startConnect);
  $("#connectIgBtn2")?.addEventListener("click", startConnect);
  $("#histRange")?.addEventListener("change", renderHistory);
}

let _booted = null;
async function bootOnce(user) {
  if (_booted === user.id) return;
  _booted = user.id;
  await bootSession(user);
}

async function init() {
  bind(); bindLogin();
  sb.auth.onAuthStateChange(async (event, session) => {
    if (session && session.user) await bootOnce(session.user);
    else { state.user = null; _booted = null; showLogin(); }
  });
  const s = await sbAuth.sbGetSession();
  if (s) await bootOnce(s.user);
  else showLogin();

  // Handle OAuth callback redirect
  const params = new URLSearchParams(location.search);
  if (params.get("connected") === "1") {
    setTimeout(() => alert("✅ Instagram conectado. Sincronizando…"), 500);
    history.replaceState({}, "", location.pathname);
  } else if (params.get("error")) {
    alert("❌ Error conectando: " + params.get("error"));
    history.replaceState({}, "", location.pathname);
  }
}
document.addEventListener("DOMContentLoaded", init);
