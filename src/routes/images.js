const express = require("express");
const router = express.Router();
const dayjs = require("dayjs");
const utc = require("dayjs/plugin/utc");
const timezone = require("dayjs/plugin/timezone");

const { uploadToS3, multerUploader } = require("../modules/uploadModules");
const {
  detectAndWatermarkQueue,
} = require("../modules/detectAndWatermarkQueue");
const {
  getAuthorNameById,
} = require("../modules/photographer/photographerModules");
const { IMAGE_STATUS } = require("../lib/constants");

//查詢圖片 by 號碼布 & event_id
router.get("/getByPathAndEventId/:eventId", async (req, res) => {
  dayjs.extend(utc);
  dayjs.extend(timezone);

  const db = req.app.db;
  const eventId = req.params.eventId;
  const {
    path = "",
    author = "",
    lastModified = "",
    category = "",
    page = 1,
  } = req.query;

  const countsPerPage = 12;
  const lastModifiedArray = lastModified.split(",");

  // 建立時間範圍查詢條件
  const lastModifiedCondition = {
    $or: [
      {
        "image.lastModified": {
          $gte: lastModifiedArray[0]
            ? dayjs(lastModifiedArray[0]).tz("Asia/Taipei", true).valueOf()
            : 0,
          $lte: lastModifiedArray[1]
            ? dayjs(lastModifiedArray[1]).tz("Asia/Taipei", true).valueOf()
            : dayjs().tz("Asia/Taipei", true).add(1, "day").valueOf(),
        },
      },
      { "image.lastModified": { $exists: false } },
    ],
  };

  // 根據 category 動態生成查詢條件
  const matchCategoryCondition = () => {
    switch (category) {
      case IMAGE_STATUS.UNIDENTIFYED:
        return { path: { $size: 0 } };
      case IMAGE_STATUS.IDENTIFYED:
        return { isFeatured: true };
      case IMAGE_STATUS.ALL:
        return path
          ? { path: { $elemMatch: { $regex: new RegExp(path, "i") } } }
          : {};
      default:
        return {};
    }
  };

  try {
    const pipeline = [
      { $unwind: "$image" },
      {
        $match: {
          ...lastModifiedCondition,
          ...matchCategoryCondition(),
          "image.author": author || { $ne: "" },
          "image.watermarkedUrl": { $exists: true },
          isRemoved: { $ne: true },
        },
      },
      {
        $facet: {
          paginatedResults: [
            {
              $group: {
                _id: "$_id",
                image: {
                  $push: {
                    id: "$image.id",
                    watermarkedUrl: "$image.watermarkedUrl",
                    price: "$image.price",
                    lastModified: "$image.lastModified",
                    author: "$image.author",
                    orientation: {
                      $ifNull: ["$image.orientation", "vertical"],
                    },
                  },
                },
              },
            },
            { $sort: { "image.lastModified": 1 } },
            { $skip: (page - 1) * countsPerPage },
            { $limit: countsPerPage },
          ],
          totalCount: [
            {
              $group: {
                _id: null,
                count: { $sum: 1 },
              },
            },
          ],
        },
      },
    ];

    const result = await db
      .collection(`imagecollection/${eventId}`)
      .aggregate(pipeline)
      .toArray();

    const paginatedResults =
      result?.[0]?.paginatedResults?.flatMap((item) => item.image) || [];
    const totalCount = result?.[0]?.totalCount?.[0]?.count || 0;

    // 格式化圖像資料
    const formattedImages = await Promise.all(
      paginatedResults.map(async (item) => {
        const authorData = await getAuthorNameById(db, item.author);
        return {
          ...item,
          authorName: authorData?.displayName || "",
        };
      })
    );

    res.send({ images: formattedImages, totalCount });
  } catch (error) {
    console.error("Error fetching images:", error);
    res.status(500).send({ error: "An error occurred while fetching images." });
  }
});
//取得相同攝影師的[0,1]照片 lastModified - 5秒內的照片跟 5秒後的照片
router.post("/getByLastModified/:eventId", async (req, res) => {
  const db = req.app.db;
  const eventId = req.params.eventId;
  const { intervalGroup } = req.body;

  const countsPerPage = 12;
  const page = req.query.page - 1 || 0;

  try {
    const result = await db
      .collection(`imagecollection/${eventId}`)
      .aggregate([
        {
          $unwind: "$image",
        },
        {
          $match: {
            $or: intervalGroup.map((item) => ({
              "image.lastModified": {
                $gte: item.start - 5000,
                $lte: item.end + 5000,
              },
              "image.author": item.author,
              isRemoved: {
                $ne: true,
              },
            })),
          },
        },
        {
          $group: {
            _id: "$_id",
            image: {
              $push: {
                id: "$image.id",
                watermarkedUrl: "$image.watermarkedUrl",
                price: "$image.price",
                lastModified: "$image.lastModified",
                author: "$image.author",
                orientation: {
                  $ifNull: ["$image.orientation", "vertical"],
                },
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
      .toArray();

    const images = result?.[0]?.paginatedResults
      ? result[0].paginatedResults.flatMap((item) => item.image)
      : [];

    const formattedImages = await Promise.all(
      images.map(async (item) => {
        const authorData = await getAuthorNameById(db, item.author);
        return {
          ...item,
          authorName: authorData?.displayName || "",
        };
      })
    );

    const totalCount = result?.[0]?.totalCount?.[0]?.count || 0;
    res.send({ images: formattedImages, totalCount });
  } catch (error) {
    console.error("Error fetching images:", error);
    res.status(500).send({ error: "An error occurred while fetching images." });
  }
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
              orientation: {
                $ifNull: ["$image.orientation", "vertical"],
              },
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

  await detectAndWatermarkQueue(db, eventId, imageArray).then(async () => {
    //update isCompleteUpload
    db.collection("eventlistcollection").updateOne(
      {
        eventId,
      },
      {
        $set: {
          isCompleteUpload: true,
        },
      }
    );

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

module.exports = router;
