require("dotenv").config();

const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

const app = express();
const PORT = process.env.PORT || 3000;

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_ANON_KEY in .env");
  process.exit(1);
}

const supabasePublic = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

const supabaseAdmin = process.env.SUPABASE_SERVICE_ROLE_KEY
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false }
    })
  : null;

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: true }));
app.use(express.json({ limit: "1mb" }));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: 200 }));
app.use(express.static(path.join(__dirname, "public")));

async function requireUser(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Sign in required." });

  const { data, error } = await supabasePublic.auth.getUser(token);
  if (error || !data.user) return res.status(401).json({ error: "Invalid or expired session." });

  const { data: profile, error: profileError } = await supabaseAdminOrPublic()
    .from("profiles").select("id, full_name, role, is_active").eq("id", data.user.id).single();

  if (profileError || !profile || !profile.is_active) {
    return res.status(403).json({ error: "Account profile is unavailable or disabled." });
  }
  req.user = data.user;
  req.profile = profile;
  req.accessToken = token;
  next();
}

function supabaseAdminOrPublic() {
  // Profile lookup uses the caller's JWT so database RLS remains in force.
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${currentToken}` } },
    auth: { persistSession: false, autoRefreshToken: false }
  });
}
let currentToken = "";

app.use((req, res, next) => {
  currentToken = (req.headers.authorization || "").replace(/^Bearer /, "");
  next();
});

function allowRoles(...roles) {
  return (req, res, next) => {
    if (!req.profile || !roles.includes(req.profile.role)) {
      return res.status(403).json({ error: "You do not have permission to perform this action." });
    }
    next();
  };
}

app.get("/api/health", (req, res) => res.json({ status: "ok", app: "GRANDSTAY" }));

app.get("/api/me", requireUser, (req, res) => {
  res.json({ user: { id: req.user.id, email: req.user.email }, profile: req.profile });
});

// Only an existing super administrator or manager can invite staff.
// Public signup never accepts a role; new public accounts are customers only.
app.post("/api/staff/invite", requireUser, allowRoles("super_admin", "hotel_manager"), async (req, res) => {
  if (!supabaseAdmin) return res.status(503).json({ error: "Server service key is not configured." });

  const { email, full_name, role } = req.body || {};
  const allowed = ["hotel_manager", "receptionist", "accountant", "housekeeping"];
  if (!email || !full_name || !allowed.includes(role)) {
    return res.status(400).json({ error: "Provide email, full_name and an allowed staff role." });
  }
  if (req.profile.role === "hotel_manager" && role === "hotel_manager") {
    return res.status(403).json({ error: "Only a super administrator can create another manager." });
  }

  const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
    data: { full_name }
  });
  if (error) return res.status(400).json({ error: error.message });

  const { error: updateError } = await supabaseAdmin
    .from("profiles").update({ full_name, role, is_active: true }).eq("id", data.user.id);

  if (updateError) return res.status(500).json({ error: "User invited but role assignment failed. Contact administrator." });
  res.status(201).json({ message: "Staff invitation sent.", user_id: data.user.id });
});

app.get("/api/dashboard", requireUser, (req, res) => {
  res.json({
    message: "Welcome to GRANDSTAY.",
    role: req.profile.role,
    availableModules: {
      super_admin: ["dashboard", "rooms", "bookings", "guests", "payments", "housekeeping", "staff", "reports", "settings"],
      hotel_manager: ["dashboard", "rooms", "bookings", "guests", "payments", "housekeeping", "staff", "reports"],
      receptionist: ["dashboard", "rooms", "bookings", "guests", "check-in", "check-out"],
      accountant: ["dashboard", "payments", "invoices", "reports"],
      housekeeping: ["dashboard", "housekeeping", "rooms"],
      customer: ["my-bookings", "my-profile"]
    }[req.profile.role] || []
  });
});

app.get("*", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

app.listen(PORT, () => console.log(`GRANDSTAY running at http://localhost:${PORT}`));
