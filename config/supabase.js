const { createClient } = require("@supabase/supabase-js");

const url = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !anonKey || !serviceRoleKey) {
  throw new Error("Supabase configuration is incomplete.");
}

// Use this client only for verifying user access tokens.
const authClient = createClient(url, anonKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});

// Server-only privileged client. Never expose this key to browsers.
const adminClient = createClient(url, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});

module.exports = { authClient, adminClient };
