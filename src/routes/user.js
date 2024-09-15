const UUID = require("uuid");
const dayjs = require("dayjs");

const express = require("express");
const router = express.Router();

const emailSender = require("../modules/emailSender");
const { REPORT_TYPE_TRANS } = require("../lib/constants");

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

router.post("/reportImage", async (req, res) => {
  const db = req.app.db;
  const { eventId, imageId } = req.body;

  const reportInfo = {
    reportId: "report-" + UUID.v4().substring(0, 12),
    reportAt: dayjs().utcOffset(8).format("YYYY-MM-DD HH:mm:ss"),
    ...req.body,
  };

  //1.移除圖片並標記為已檢舉
  await db.collection(`imagecollection/${eventId}`).updateOne(
    { "image.id": imageId },
    {
      $set: {
        isReported: true,
        isRemoved: true,
        reportInfo,
      },
    }
  );

  //2.新增檢舉紀錄
  await db.collection(`reportcollection`).insertOne(reportInfo);

  //3.email 通知管理員
  await emailSender({
    email: process.env.MAILER_FROM_USER,
    subject: "圖片檢舉通知",
    html: `
      <h1>圖片檢舉通知</h1>
      <p>圖片已被檢舉，請至後台查看</p>
      <p>檢舉ID：${reportInfo.reportId}</p>
      <p>檢舉人：${reportInfo.reporterId}</p>
      <p>檢舉原因：${REPORT_TYPE_TRANS[reportInfo.reportType]}</p>
      <p>檢舉圖片ID：${reportInfo.imageId}</p>
      <p>檢舉圖片URL：${reportInfo.watermarkedUrl}</p>
      <p>檢舉圖片活動ID：${reportInfo.eventId}</p>
      <p>檢舉圖片活動：${reportInfo.eventName}</p>

    `,
  });

  res.send({ status: "success", msg: "檢舉成功" });
});

module.exports = router;
