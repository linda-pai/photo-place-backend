const express = require("express");
const router = express.Router();
const { generateGif } = require("../modules/gifModules");

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

//產生GIF
router.post("/generateGif", async (req, res) => {
  const { eventId, imageIds, fileName } = req.body;
  const db = req.app.db;

  const images = await db
    .collection(`imagecollection/${eventId}`)
    .aggregate([
      {
        $unwind: "$image",
      },
      {
        $match: {
          "image.id": { $in: imageIds },
          isSold: true,
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
              orientation: {
                $ifNull: ["$image.orientation", "vertical"],
              },
            },
          },
        },
      },
      {
        $sort: { "image.fileName": 1 },
      },
    ])
    .toArray();

  const imageList = images.map((item) => item.image).flat();
  if (imageList.length === 0)
    return res.send({ status: "error", message: "無法產生GIF" });

  const gif = await generateGif(imageList, fileName);
  res.send({ status: "success", gif });
});

router.post("/eventListByUserOrder", async (req, res) => {
  const db = req.app.db;

  const orderBy = req.headers.authorization.split(" ")[1];
  await db
    .collection("ordercollection")
    .find({ orderBy, paidAt: { $exists: true, $ne: null } })
    .toArray((error, result) => {
      const images = result.map((item) =>
        item.items.map((image) => {
          return {
            eventId: image.eventId,
            imageId: image.id,
          };
        })
      );
      const imagesList = images.flat();

      const events = result.map((item) =>
        item.items.map((event) => {
          return {
            eventId: event.eventId,
            eventName: event.eventName,
          };
        })
      );
      const eventList = events.flat();
      //remove duplicate
      const uniqueEventList = eventList.filter(
        (item, index) =>
          index ===
          eventList.findIndex(
            (t) => t.eventId === item.eventId && t.eventName === item.eventName
          )
      );

      res.send({
        status: "success",
        events: uniqueEventList,
        images: imagesList,
      });
    });
});

module.exports = router;
