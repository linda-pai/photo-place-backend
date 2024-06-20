const express = require("express");
const router = express.Router();

//查詢訂單 by orderBy
router.post("/getByUser", (req, res) => {
  const db = req.app.db;
  const orderBy = req.headers.authorization.split(" ")[1];

  db.collection("ordercollection")
    .find({ orderBy })
    .sort({ createAt: -1 })
    .toArray((error, result) => {
      res.send(result);
    });
});

//確認已付款 - 查詢圖片 by eventId & imageIds
router.post("/getByEventIdAndImageIds", async (req, res) => {
  const orderBy = req.headers.authorization.split(" ")[1];

  const { orderId, eventId, imageIdList } = req.body;

  const db = req.app.db;
  const order = await db
    .collection("ordercollection")
    .find({ orderId, orderBy })
    .toArray();
  const paidAt = order[0]?.paidAt;

  if (paidAt) {
    db.collection(`imagecollection/${eventId}`)
      .aggregate([
        {
          $unwind: "$image",
        },
        {
          $match: {
            "image.id": { $in: imageIdList },
          },
        },
        {
          $group: {
            _id: "$_id",
            image: {
              $push: {
                fileName: "$image.fileName",
                url: "$image.url",
                id: "$image.id",
                eventName: "$image.eventName",
              },
            },
          },
        },
      ])
      .toArray((error, result) => {
        const images = result.map((item) => item.image).flat();
        res.send(images);
      });
  } else {
    res.status(403).json({ error: "尚未付款" });
  }
});

module.exports = router;
