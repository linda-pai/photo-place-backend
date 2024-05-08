const express = require("express");
const router = express.Router();
const dayjs = require("dayjs");

const { sendOrderSuccessEmail } = require("../modules/order/orderModules");

//訂單列表
router.get("/orderList", async (req, res) => {
  const db = req.app.db;
  await db
    .collection("ordercollection")
    .find({})
    .sort({ createAt: -1 })
    .toArray((error, result) => {
      res.send(result);
    });
});

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

//付款 - 更新訂單
router.put("/update/:orderId", async (req, res) => {
  const db = req.app.db;
  db.collection("ordercollection")
    .updateOne(
      { orderId: req.params.orderId },
      {
        $set: {
          ...req.body,
          ...(req.body.paidAt === null && {
            paidAt: dayjs().utcOffset(8).format("YYYY-MM-DD HH:mm:ss"),
          }),
        },
      }
    )
    .then(async () => {
      await sendOrderSuccessEmail(db, req.params.orderId);

      res.json({ message: "更新成功" });
    })
    .catch((error) => {
      console.log("update-error", error);
      return res.json({ message: "更新失敗" });
    });
});

//刪除訂單
router.post("/delete/:orderId", (req, res) => {
  const db = req.app.db;
  db.collection("ordercollection")
    .deleteOne({ orderId: req.params.orderId })
    .then(() => res.json({ message: "刪除成功" }))
    .catch((error) => {
      console.log("delete-error", error);
      return res.json({ message: "刪除失敗" });
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
