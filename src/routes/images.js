const express = require("express");
const router = express.Router();

const { uploadToS3, multerUploader } = require("../modules/uploadModules");
const {
  detectAndWatermarkQueue,
} = require("../modules/detectAndWatermarkQueue");

//查詢圖片 by 號碼布 & event_id
router.get("/getByPathAndEventId/:eventId", async (req, res) => {
  const db = req.app.db;
  const path = req.query.path || "";
  const author = req.query.author || "";
  const eventId = req.params.eventId;

  const countsPerPage = 24;
  const page = req.query.page - 1 || 0;

  await db
    .collection(`imagecollection/${eventId}`)
    .aggregate([
      {
        $unwind: "$image",
      },
      {
        $match: {
          ...(path === ""
            ? {}
            : {
                path: {
                  $elemMatch: { $regex: new RegExp(".*" + path + ".*") },
                },
              }),
          "image.author": author ? author : { $ne: "" },
          "image.watermarkedUrl": { $exists: true },
          //預設只顯示精選圖片，如果有 path(搜尋關鍵字) 就不管是不是精選
          ...(path ? {} : { isFeatured: true }),
          isRemoved: {
            $ne: true,
          },
        },
      },
      {
        $group: {
          _id: "$_id",
          image: {
            $push: {
              id: "$image.id",
              eventName: "$image.eventName",
              eventId: "$image.eventId",
              watermarkedUrl: "$image.watermarkedUrl",
              price: "$image.price",
              lastModified: "$image.lastModified",
              authorName: "$image.authorName",
              author: "$image.author",
              isFeatured: "$isFeatured",
            },
          },
        },
      },
      {
        $sort: { "image.lastModified": 1 },
      },
      {
        $facet: {
          paginatedResults: [
            { $skip: page * countsPerPage },
            { $limit: countsPerPage },
          ],
          totalCount: [
            {
              $count: "count",
            },
          ],
        },
      },
    ])
    .toArray((error, result) => {
      const images = result[0]?.paginatedResults
        ? result[0]?.paginatedResults.map((item) => item.image).flat()
        : [];

      const totalCount = result[0]?.totalCount[0]?.count || 0;
      res.send({ images, totalCount });
    });
});

//取得相同攝影師的[0,1]照片 lastModified - 5秒內的照片跟 5秒後的照片
router.post("/getByLastModified/:eventId", async (req, res) => {
  const db = req.app.db;
  const eventId = req.params.eventId;
  const { author, lastModified, lastModifiedEnd } = req.body;

  db.collection(`imagecollection/${eventId}`)
    .aggregate([
      {
        $unwind: "$image",
      },
      {
        $match: {
          "image.lastModified": {
            $gte: lastModified - 5000,
            $lte: lastModifiedEnd + 5000,
          },
          "image.author": author,
          isRemoved: {
            $ne: true,
          },
        },
      },
      {
        $group: {
          _id: "$_id",
          image: {
            $push: {
              id: "$image.id",
              eventName: "$image.eventName",
              eventId: "$image.eventId",
              watermarkedUrl: "$image.watermarkedUrl",
              price: "$image.price",
              lastModified: "$image.lastModified",
              authorName: "$image.authorName",
            },
          },
        },
      },
      {
        $sort: { "image.lastModified": 1 },
      },
      { $limit: 50 },
    ])
    .toArray((error, result) => {
      const images = result.map((item) => item.image).flat();
      res.send(images);
    });
});

//取得圖片 by ids
router.get("/getByIds/:eventId/:ids", (req, res) => {
  const db = req.app.db;
  const eventId = req.params.eventId;
  const ids = req.params.ids;

  db.collection(`imagecollection/${eventId}`)
    .aggregate([
      {
        $unwind: "$image",
      },
      {
        $match: {
          "image.id": { $in: ids.split(",") },
        },
      },
      {
        $group: {
          _id: "$_id",
          image: {
            $push: {
              id: "$image.id",
              watermarkedUrl: "$image.watermarkedUrl",
              eventId: "$image.eventId",
              price: "$image.price",
              eventName: "$image.eventName",
              key: "$image.id",
            },
          },
        },
      },
    ])
    .toArray((error, result) => {
      const images = result.map((item) => item.image).flat();
      res.send(images);
    });
});

//找到 image watermark url 為空的，並且 detectText and add watermark url，更新 db
router.post("/updateWatermarkUrlAndDetectText", async (req, res) => {
  const db = req.app.db;
  const { eventId, author, isAll } = req.body;

  const imageArray = await db
    .collection(`imagecollection/${eventId}`)
    .find({
      ...(isAll ? {} : { "image.author": author }),
      "image.watermarkedUrl": { $exists: false },
    })
    .toArray();

  await detectAndWatermarkQueue(db, eventId, imageArray).then(() => {
    res.send({ status: 200 });
  });
});

//純上傳圖片到 S3
router.post(
  "/singleImgS3Upload",
  multerUploader.single("file"),
  async (req, res) => {
    const file = req.file;
    const path = req.body.path || "/";
    uploadToS3(file, path).then((result) => res.json(result));
  }
);

//update first 50 images isFeatured = true , sort by _id
router.post("/updateIsFeatured", async (req, res) => {
  const db = req.app.db;
  const { eventId } = req.body;
  const imageArray = await db
    .collection(`imagecollection/${eventId}`)
    .find({})
    .sort({ _id: 1 })
    .limit(50)
    .toArray();

  const imageIds = imageArray.map((item) => item.image.id);

  await db.collection(`imagecollection/${eventId}`).updateMany(
    {
      "image.id": { $in: imageIds },
    },
    {
      $set: {
        isFeatured: true,
      },
    }
  );

  res.send({ status: 200 });
});

module.exports = router;
