const UUID = require("uuid");
const dayjs = require("dayjs");

const express = require("express");
const router = express.Router();

router.get("/userList", async (req, res) => {
  const db = req.app.db;
  await db
    .collection("usercollection")
    .find({})
    .project({ token: 1, email: 1, name: 1, role: 1, userId: 1, createTime: 1 })
    .sort({ createTime: -1 })
    .toArray((error, result) => {
      res.send(result);
    });
});

router.post("/createUser", async (req, res) => {
  const db = req.app.db;
  const userId = req.body.userId || "user-" + UUID.v4().substring(0, 12);
  const user = {
    role: "user", //TODO: 預設為 user
    createTime: dayjs().utcOffset(8).format("YYYY-MM-DD HH:mm:ss"),
    ...req.body,
  };
  //check if user already exists
  const userExist = await db
    .collection("usercollection")
    .find({ userId: user.userId })
    .toArray();

  if (userExist.length > 0) {
    db.collection("usercollection").updateOne(
      { email: user.email },
      { $set: { token: user.token } }
    );
    return res.status(200).json({ userId });
  } else {
    db.collection("usercollection").insertOne(user);
    return res.status(200).json({ userId });
  }
});

module.exports = router;
