const express = require("express");
const router = express.Router();

//查詢訂單 by orderBy
router.get("/getByUser/:orderBy", (req, res) => {
  const db = req.app.db;
  const orderBy = req.params.orderBy;

  db.collection("ordercollection")
    .find({ orderBy })
    .sort({ createAt: -1 })
    .toArray((error, result) => {
      res.send(result);
    });
});

//確認已付款 - 查詢圖片 by eventId & imageIds
router.get(
  "/getByEventIdAndImageIds/:orderId/:eventId/:imageIds",
  async (req, res) => {
    const db = req.app.db;
    const order = await db
      .collection("ordercollection")
      .find({ orderId: req.params.orderId })
      .toArray();
    const paidAt = order[0]?.paidAt;

    if (paidAt) {
      const eventId = req.params.eventId;
      const imageIds = req.params.imageIds;

      db.collection(`imagecollection/${eventId}`)
        .aggregate([
          {
            $unwind: "$image",
          },
          {
            $match: {
              "image.id": { $in: imageIds.split(",") },
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
  }
);

module.exports = router;
