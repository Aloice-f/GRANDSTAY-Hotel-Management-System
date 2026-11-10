require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const path = require("path");

const { requireAuth } = require("./middleware/auth");
const { requireRole } = require("./middleware/authorize");
const healthRoutes = require("./routes/health");

const app = express();
const PORT = Number(process.env.PORT || 3000);

if (!process.env.SUPABASE_URL ||
    !process.env.SUPABASE_ANON_KEY ||
    !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing Supabase environment variables. Check .env.example.");
  process.exit(1);
}

app.disable("x-powered-by");
app.use(helmet({
  // Static HTML pages may use local scripts/styles in later modules.
  contentSecurityPolicy: false
}));

const allowedOrigins = (process.env.APP_ORIGIN || "http://localhost:3000")
  .split(",").map(value => value.trim()).filter(Boolean);

app.use(cors({
  origin(origin, callback) {
    // Allow server-to-server and same-origin requests without an Origin header.
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error("Origin not allowed by CORS"));
  },
  credentials: false
}));

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false, limit: "1mb" }));

app.use("/api", rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: "draft-8",
  legacyHeaders: false
}));

app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.use("/api/health", healthRoutes);

// Protected example route. Actual module routes will be added incrementally.
app.get("/api/me", requireAuth, (req, res) => {
  res.json({
    success: true,
    user: {
      id: req.user.id,
      email: req.user.email,
      role: req.profile.role,
      hotel_id: req.profile.hotel_id
    }
  });
});

app.get("/api/admin-check", requireAuth, requireRole("super_admin"), (_req, res) => {
  res.json({ success: true, message: "Super administrator access verified." });
});

app.use((req, res) => {
  res.status(404).json({ success: false, error: "Endpoint not found." });
});

app.use((err, _req, res, _next) => {
  console.error(err);
  const status = Number(err.status || 500);
  res.status(status).json({
    success: false,
    error: status >= 500 ? "An unexpected server error occurred." : err.message
  });
});

app.listen(PORT, () => {
  console.log(`GRANDSTAY server running on http://localhost:${PORT}`);
});
