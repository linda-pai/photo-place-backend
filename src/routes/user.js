const UUID = require("uuid");
const dayjs = require("dayjs");

const express = require("express");
const router = express.Router();

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

//登記活動上傳完成通知資訊
router.post("/notifyRecord", async (req, res) => {
  //確認是否已經有相同的 email &notifyUrl
  const db = req.app.db;
  const { eventId, email, notifyUrl } = req.body;
  const notifyRecord = await db
    .collection(`notifycollection`)
    .find({ eventId, email, notifyUrl })
    .toArray();

  if (notifyRecord.length > 0) {
    return res.send({ status: 200, msg: "已經有登記過囉～" });
  } else {
    await db.collection(`notifycollection`).insertOne({
      notifyId: "notify-" + UUID.v4().substring(0, 12),
      creatAt: dayjs().utcOffset(8).format("YYYY-MM-DD HH:mm:ss"),
      ...req.body,
    });
    res.send({ status: 200, msg: "登記成功" });
  }
});

module.exports = router;
