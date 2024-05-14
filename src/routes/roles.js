//待解決前端 refresh 會清空context的問題

const express = require("express");
const router = express.Router();

router.get("/rolesList", async (req, res) => {
  const db = req.app.db;
  const roles = await db.collection("rolescollection").find().toArray();
  res.send(roles[0]);
});

module.exports = router;
