const { authClient, adminClient } = require("../config/supabase");

async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const match = header.match(/^Bearer\s+(.+)$/i);
    if (!match) {
      return res.status(401).json({ success: false, error: "Authentication required." });
    }

    const { data: authData, error: authError } =
      await authClient.auth.getUser(match[1]);

    if (authError || !authData?.user) {
      return res.status(401).json({ success: false, error: "Invalid or expired session." });
    }

    const { data: profile, error: profileError } = await adminClient
      .from("profiles")
      .select("id, full_name, role, hotel_id, is_active")
      .eq("id", authData.user.id)
      .maybeSingle();

    if (profileError) throw profileError;
    if (!profile || !profile.is_active) {
      return res.status(403).json({ success: false, error: "User profile is inactive or unavailable." });
    }

    req.user = authData.user;
    req.profile = profile;
    req.accessToken = match[1];
    next();
  } catch (error) {
    next(error);
  }
}

module.exports = { requireAuth };
