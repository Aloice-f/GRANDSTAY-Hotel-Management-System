// Browser-side Supabase client uses ONLY the publishable/anon key.
const SUPABASE_URL = "https://jdfoinyuarvcpryqrnuy.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable__4otGzozGEWk4US2oWyKEw_JZ6GMBxW";

const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const $ = (id) => document.getElementById(id);
const authPanel = $("authPanel"), appPanel = $("appPanel");
let currentProfile = null;

function message(text, target = "authMessage") { $(target).textContent = text || ""; }
function showLogin() {
  $("loginForm").hidden = false; $("registerForm").hidden = true;
  $("loginTab").classList.add("active"); $("registerTab").classList.remove("active");
}
function showRegister() {
  $("loginForm").hidden = true; $("registerForm").hidden = false;
  $("registerTab").classList.add("active"); $("loginTab").classList.remove("active");
}
$("loginTab").addEventListener("click", showLogin);
$("registerTab").addEventListener("click", showRegister);

async function api(path, options = {}) {
  const { data: { session } } = await client.auth.getSession();
  const response = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      ...(options.headers || {})
    }
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "Request failed.");
  return body;
}

$("loginForm").addEventListener("submit", async (event) => {
  event.preventDefault(); message("Signing in...");
  const { error } = await client.auth.signInWithPassword({
    email: $("loginEmail").value.trim(),
    password: $("loginPassword").value
  });
  if (error) return message(error.message);
  await refreshSession();
});

$("registerForm").addEventListener("submit", async (event) => {
  event.preventDefault(); message("Creating account...");
  const { data, error } = await client.auth.signUp({
    email: $("registerEmail").value.trim(),
    password: $("registerPassword").value,
    options: { data: { full_name: $("registerName").value.trim() } }
  });
  if (error) return message(error.message);
  if (data.session) await refreshSession();
  else message("Registration received. Check your email to confirm your account.");
});

$("forgotPassword").addEventListener("click", async () => {
  const email = $("loginEmail").value.trim();
  if (!email) return message("Enter your email address first.");
  const { error } = await client.auth.resetPasswordForEmail(email, {
    redirectTo: `${location.origin}/`
  });
  message(error ? error.message : "If the account exists, a password reset email has been sent.");
});

$("logoutButton").addEventListener("click", async () => {
  await client.auth.signOut();
  currentProfile = null;
  appPanel.hidden = true; authPanel.hidden = false; showLogin();
});

async function refreshSession() {
  try {
    const data = await api("/api/me");
    currentProfile = data.profile;
    authPanel.hidden = true; appPanel.hidden = false;
    $("welcomeTitle").textContent = `Welcome, ${data.profile.full_name || data.user.email}`;
    $("welcomeInfo").textContent = data.user.email;
    $("roleName").textContent = data.profile.role.replaceAll("_", " ").toUpperCase();
    const dashboard = await api("/api/dashboard");
    $("modules").innerHTML = "";
    dashboard.availableModules.forEach((name) => {
      const div = document.createElement("div");
      div.className = "module";
      div.textContent = name.replaceAll("-", " ").replaceAll("_", " ").replace(/\b\w/g, c => c.toUpperCase());
      $("modules").appendChild(div);
    });
    $("inviteSection").hidden = !["super_admin", "hotel_manager"].includes(currentProfile.role);
    $("staffRole").querySelector('option[value="hotel_manager"]').disabled = currentProfile.role !== "super_admin";
  } catch (error) {
    message(error.message);
    authPanel.hidden = false; appPanel.hidden = true;
  }
}

$("inviteForm").addEventListener("submit", async (event) => {
  event.preventDefault(); message("Sending invitation...", "inviteMessage");
  try {
    const result = await api("/api/staff/invite", {
      method: "POST",
      body: JSON.stringify({
        full_name: $("staffName").value.trim(),
        email: $("staffEmail").value.trim(),
        role: $("staffRole").value
      })
    });
    message(result.message, "inviteMessage");
    $("inviteForm").reset();
  } catch (error) { message(error.message, "inviteMessage"); }
});

client.auth.onAuthStateChange((_event, session) => {
  if (session) setTimeout(refreshSession, 0);
});
(async () => {
  if (SUPABASE_URL.includes("PASTE_") || SUPABASE_ANON_KEY.includes("PASTE_")) {
    message("Setup required: add your Supabase Project URL and publishable key in public/js/app.js.");
    return;
  }
  const { data: { session } } = await client.auth.getSession();
  if (session) await refreshSession();
})();
