
require("dotenv").config();

const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

const app = express();
const PORT = process.env.PORT || 3000;

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error("ERROR: Supabase URL or publishable key is missing in .env");
  process.exit(1);
}

// Public Supabase client
const supabasePublic = createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  }
);

// Server-only administrator client
const supabaseAdmin = SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    })
  : null;

// Middleware
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: true }));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 200
}));

app.use(express.static(path.join(__dirname, "public")));

// Create a Supabase client using the current user's token.
// This avoids sharing authentication tokens between requests.
function getUserSupabaseClient(token) {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`
      }
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
}

// Authentication middleware
async function requireUser(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ")
      ? header.slice(7)
      : null;

    if (!token) {
      return res.status(401).json({
        error: "Sign in required."
      });
    }

    const { data, error } = await supabasePublic.auth.getUser(token);

    if (error || !data.user) {
      return res.status(401).json({
        error: "Invalid or expired session."
      });
    }

    const userClient = getUserSupabaseClient(token);

    const { data: profile, error: profileError } = await userClient
      .from("profiles")
      .select("id, full_name, role, is_active")
      .eq("id", data.user.id)
      .single();

    if (profileError || !profile || !profile.is_active) {
      return res.status(403).json({
        error: "Account profile is unavailable or disabled."
      });
    }

    req.user = data.user;
    req.profile = profile;
    req.accessToken = token;

    next();

  } catch (error) {
    console.error("Authentication error:", error.message);

    return res.status(500).json({
      error: "Authentication failed."
    });
  }
}

// Role permissions
function allowRoles(...roles) {
  return (req, res, next) => {
    if (!req.profile || !roles.includes(req.profile.role)) {
      return res.status(403).json({
        error: "You do not have permission to perform this action."
      });
    }

    next();
  };
}

// Health check
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    app: "GRANDSTAY"
  });
});

// Current logged-in user
app.get("/api/me", requireUser, (req, res) => {
  res.json({
    user: {
      id: req.user.id,
      email: req.user.email
    },
    profile: req.profile
  });
});

// Staff invitation
app.post(
  "/api/staff/invite",
  requireUser,
  allowRoles("super_admin", "hotel_manager"),
  async (req, res) => {
    try {
      if (!supabaseAdmin) {
        return res.status(503).json({
          error: "Server service key is not configured."
        });
      }

      const { email, full_name, role } = req.body || {};

      const allowedRoles = [
        "hotel_manager",
        "receptionist",
        "accountant",
        "housekeeping"
      ];

      if (!email || !full_name || !allowedRoles.includes(role)) {
        return res.status(400).json({
          error: "Provide email, full_name and a valid staff role."
        });
      }

      if (
        req.profile.role === "hotel_manager" &&
        role === "hotel_manager"
      ) {
        return res.status(403).json({
          error: "Only a super administrator can create another manager."
        });
      }

      const { data, error } =
        await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
          data: { full_name }
        });

      if (error) {
        return res.status(400).json({
          error: error.message
        });
      }

      const { error: updateError } = await supabaseAdmin
        .from("profiles")
        .update({
          full_name,
          role,
          is_active: true
        })
        .eq("id", data.user.id);

      if (updateError) {
        console.error("Staff role assignment error:", updateError.message);

        return res.status(500).json({
          error: "User invited but role assignment failed. Contact administrator."
        });
      }

      res.status(201).json({
        message: "Staff invitation sent.",
        user_id: data.user.id
      });

    } catch (error) {
      console.error("Staff invitation error:", error.message);

      res.status(500).json({
        error: "Could not invite staff member."
      });
    }
  }
);

// Role-based dashboard
app.get("/api/dashboard", requireUser, (req, res) => {
  const modules = {
    super_admin: [
      "dashboard", "rooms", "bookings", "guests",
      "payments", "housekeeping", "staff", "reports", "settings"
    ],

    hotel_manager: [
      "dashboard", "rooms", "bookings", "guests",
      "payments", "housekeeping", "staff", "reports"
    ],

    receptionist: [
      "dashboard", "rooms", "bookings", "guests",
      "check-in", "check-out"
    ],

    accountant: [
      "dashboard", "payments", "invoices", "reports"
    ],

    housekeeping: [
      "dashboard", "housekeeping", "rooms"
    ],

    customer: [
      "my-bookings", "my-profile"
    ]
  };

  res.json({
    message: "Welcome to GRANDSTAY.",
    role: req.profile.role,
    availableModules: modules[req.profile.role] || []
  });
});

// API routes that do not exist should return JSON 404.
app.use("/api", (req, res) => {
  res.status(404).json({
    error: "API endpoint not found."
  });
});

// Express 5 compatible website fallback.
// This serves index.html for the root and other website pages.
app.get("/{*splat}", (req, res) => {
  res.sendFile(
    path.join(__dirname, "public", "index.html")
  );
});

// Error handler
app.use((err, req, res, next) => {
  console.error("Server error:", err.message);

  res.status(500).json({
    error: "An unexpected server error occurred."
  });
});

// Start server
app.listen(PORT, () => {
  console.log("--------------------------------");
  console.log("GRANDSTAY HOTEL MANAGEMENT");
  console.log("--------------------------------");
  console.log(`Server: http://localhost:${PORT}`);
  console.log("Supabase URL loaded:", !!SUPABASE_URL);
  console.log("Supabase key loaded:", !!SUPABASE_ANON_KEY);
  console.log("Service role configured:", !!SERVICE_ROLE_KEY);
  console.log("--------------------------------");
});
