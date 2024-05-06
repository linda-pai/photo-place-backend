const express = require("express");
const router = express.Router();

router.get("/rolesList", async (req, res) => {
  const db = req.app.db;
  const roles = await db.collection("rolescollection").find().toArray();
  res.send(roles[0]);
});

module.exports = router;
