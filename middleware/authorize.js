function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.profile) {
      return res.status(401).json({ success: false, error: "Authentication required." });
    }
    if (!allowedRoles.includes(req.profile.role)) {
      return res.status(403).json({ success: false, error: "You do not have permission to perform this action." });
    }
    next();
  };
}

module.exports = { requireRole };
