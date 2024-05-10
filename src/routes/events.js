const express = require("express");
const router = express.Router();

const UUID = require("uuid");
const dayjs = require("dayjs");

const { multerUploader } = require("../modules/uploadModules");

//查詢 events
router.get("/eventList", (req, res) => {
  const db = req.app.db;
  const { sort, isRecent } = req.query;
  db.collection("eventlistcollection")
    .find({
      ...(isRecent === "true" && {
        date: {
          //all past and future 30 days events
          $lte: dayjs().add(30, "day").format("YYYY-MM-DD"),
        },
      }),
    })
    .sort({ date: sort === "asc" ? 1 : -1 })
    .toArray((error, result) => {
      res.send(result);
    });
});

//查詢 event by id
router.get("/getBy/:eventId", async (req, res) => {
  const db = req.app.db;
  const eventId = req.params.eventId;

  await db
    .collection("eventlistcollection")
    .find({ eventId })
    .toArray((error, result) => {
      res.send(result[0] || {});
    });
});

//更新 event by id
router.put("/update/:eventId", (req, res) => {
  const db = req.app.db;
  const eventId = req.params.eventId;
  db.collection("eventlistcollection")
    .updateOne(
      { eventId },
      {
        $set: {
          ...req.body,
        },
      }
    )
    .then(() => res.json({ message: "更新成功" }))
    .catch((error) => {
      console.log("update-error", error);
      return res.json({ message: "更新失敗" });
    });
});

//刪除 event by id
router.delete("/delete/:eventId", (req, res) => {
  const db = req.app.db;
  const eventId = req.params.eventId;
  db.collection("eventlistcollection")
    .deleteOne({ eventId })
    .then(() => res.json({ message: "刪除成功" }))
    .catch((error) => {
      console.log("delete-error", error);
      return res.json({ message: "刪除失敗" });
    });
});

//取得活動下拉選單
router.get("/getEventOptions", (req, res) => {
  const db = req.app.db;
  db.collection("eventlistcollection")
    //find by date in past 7 days and future 1 days
    .find({
      date: {
        $gte: dayjs().subtract(7, "day").format("YYYY-MM-DD"),
        $lte: dayjs().add(1, "day").format("YYYY-MM-DD"),
      },
      isReviewed: true,
    })
    // .find({})
    .project({ eventName: 1, eventId: 1, date: 1 })
    .toArray((error, result) => {
      res.send(result);
    });
});

//新增 event
router.post("/add", multerUploader.single("file"), async (req, res) => {
  const db = req.app.db;
  const eventData = {
    eventId: "evt-" + UUID.v4().substring(0, 12),
    ...req.body,
    isShow: false,
    isCompleteUpload: false,
  };

  db.collection("eventlistcollection")
    .insertOne(eventData)
    .then(() => res.json({ message: "新增成功" }))
    .catch((error) => {
      console.log("add-error", error);
    });
});

//get getPhotographers by eventId
router.get("/getPhotographers/:eventId", async (req, res) => {
  const db = req.app.db;
  const eventId = req.params.eventId;
  const photographers = await db
    .collection(`uploadInfocollection`)
    .find({ eventId })
    .project({ author: 1, name: 1, email: 1, userId: 1 })
    .toArray();

  res.send(photographers);
});

module.exports = router;
