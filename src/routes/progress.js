const express = require("express");
const router = express.Router();

//get upload progress
router.get("/get-upload-progress", async (req, res) => {
  const db = req.app.db;
  const { eventId, author } = req.query;

  db.collection(`progresscollection`)
    .find({ author, eventId })
    .project({
      eventId: 1,
      author: 1,
      path: 1,
      date: 1,
      uploaded: 1,
    })
    .toArray((error, result) => {
      res.json(result);
    });
});

module.exports = router;
