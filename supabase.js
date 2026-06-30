/* Conexión Supabase compartida (mismas credenciales que Sequence Builder) */
const SUPABASE_URL = "https://jiuhhnjpggdcjyjchxir.supabase.co";
const SUPABASE_KEY = "sb_publishable_tJVsAdsRgupt7cg2LOzWMg_vT6r0pFn";
const ADMIN_EMAILS = ["abmmediacontact@gmail.com", "alvarobautistaabmedia@gmail.com"];

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
window.sb = sb;
window.ADMIN_EMAILS = ADMIN_EMAILS;

async function sbGetSession() {
  const { data } = await sb.auth.getSession();
  return data.session;
}
async function sbSignIn(email, password) {
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}
async function sbSignOut() { await sb.auth.signOut(); }
function isAdmin(user) {
  if (!user) return false;
  return ADMIN_EMAILS.includes((user.email || "").toLowerCase());
}
async function sbIsAllowed(email) {
  if (!email) return false;
  if (ADMIN_EMAILS.includes(email.toLowerCase())) return true;
  const { data } = await sb.from("allowed_users")
    .select("active").eq("email", email.toLowerCase()).maybeSingle();
  return !!(data && data.active);
}

window.sbAuth = { sbGetSession, sbSignIn, sbSignOut, isAdmin, sbIsAllowed };
