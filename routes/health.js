const router = require("express").Router();

router.get("/", (_req, res) => {
  res.json({
    success: true,
    application: "GRANDSTAY HOTEL MANAGEMENT SYSTEM",
    status: "online",
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
