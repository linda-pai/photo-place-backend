const express = require("express");
const router = express.Router();

const {
  getWatermarkedFeaturedImageUrl,
} = require("../modules/watermark/drawWatermark");
const { getImageInfoByEventId } = require("../modules/getImageModules");

const getDetectedImageLength = async (db, eventId, author) => {
  const detectedImageLength = await db
    .collection(`imagecollection/${eventId}`)
    .countDocuments({
      "image.author": author,
      "image.watermarkedUrl": { $exists: true },
    });
  return detectedImageLength;
};

//查詢上傳資訊 by author
router.get("/getUploadInfo/:author", async (req, res) => {
  const db = req.app.db;
  const author = req.params.author;

  await db
    .collection(`uploadInfocollection`)
    .find({ author })
    .sort({ createAt: -1 })
    .toArray(async (error, result) => {
      const newResult = await Promise.all(
        result.map(async (item) => {
          const eventId = item.eventId;

          const {
            allImageLength,
            featuredLength,
            removeImageLength,
            detectedImageLength,
          } = await getImageInfoByEventId(db, eventId, author);

          item.allImageLength = allImageLength || 0;
          item.featuredLength = featuredLength || 0;
          item.removeImageLength = removeImageLength || 0;
          item.detectedImageLength = detectedImageLength || 0;

          return item;
        })
      );
      res.send(newResult);
    });
});

//get watermarkUrl 不等於空的圖片數量
router.get("/getDetectedImageLength/:eventId/:author", async (req, res) => {
  const db = req.app.db;
  const { eventId, author } = req.params;

  const detectedImageLength = await getDetectedImageLength(db, eventId, author);

  res.send({ detectedImageLength });
});

//取得攝影師常用浮水印
router.get("/getWatermark/:author", async (req, res) => {
  const author = req.params.author;
  const watermark = await db
    .collection(`photographercollection`)
    .find({ author })
    .toArray();
  res.send(watermark);
});

//紀錄攝影師常用浮水印
router.post("/watermark", async (req, res) => {
  //watermarkImg 寫入 author
  const db = req.app.db;
  const { watermarkImg, author } = req.body;
  await db.collection(`photographercollection`).insertOne({
    author,
    watermarkImg: watermarkImg,
  });
  res.json({ message: "更新成功" });
});

//精選照片添加浮水印
router.post("/addFeaturedImageWatermark", async (req, res) => {
  const db = req.app.db;
  const { images, watermarkImg, position } = req.body;

  const promises = images.map(async (image) => {
    const { watermarkedUrl } = await getWatermarkedFeaturedImageUrl({
      bucketKey: image.url.split(process.env.AWS_BUCKET_URL + "/")[1],
      watermarkedImageUrl: watermarkImg.split(
        process.env.AWS_BUCKET_URL + "/"
      )[1],
      position: position,
      path: "/" + image.eventId + "/featured-watermark/",
      fileName: image.fileName,
    });

    await db.collection(`imagecollection/${image.eventId}`).updateOne(
      { "image.id": image.id },
      {
        $set: {
          "image.featuredWatermarkedUrl": watermarkedUrl,
        },
      }
    );

    return {
      id: image.id,
      watermarkedUrl,
    };
  });

  Promise.all(promises).then((result) => {
    res.send({ message: "更新成功", result });
  });
});

//精選照片取得添加浮水印的網址
router.get("/getFeaturedWatermarkImages/:eventId/:author", async (req, res) => {
  const db = req.app.db;
  const { author, eventId } = req.params;
  db.collection(`imagecollection/${eventId}`)
    .aggregate([
      {
        $unwind: "$image",
      },
      {
        $match: {
          "image.author": author,
          isFeatured: true,
          "image.featuredWatermarkedUrl": { $exists: true },
        },
      },
    ])
    .project({
      "image.featuredWatermarkedUrl": 1,
      "image.id": 1,
      "image.fileName": 1,
    })
    .toArray((error, result) => {
      const images = result
        .map((item) => {
          return {
            ...item.image,
            url: item.image.featuredWatermarkedUrl,
          };
        })
        .flat();
      res.send(images);
    });
});

router.get("/getSoldInfoByAuthor/:eventId/:author", async (req, res) => {
  const db = req.app.db;
  const { eventId, author } = req.params;

  const soldInfo = await db
    .collection(`uploadInfocollection`)
    .find({ eventId, author })
    .project({
      orderId: 1,
      soldImages: 1,
      eventName: 1,
      eventId: 1,
      name: 1,
      date: 1,
    })
    .toArray();

  res.send(soldInfo[0] || {});
});

//photographer/* 用的，要有 :author 才能查詢
router.post("/getByAuthor", async (req, res) => {
  const db = req.app.db;
  const { eventId, author, sortBy, fileName, curPage } = req.body;
  const countsPerPage = 24;
  const page = curPage - 1 || 0;

  const detectedImageLength = await getDetectedImageLength(db, eventId, author);
  //handle Unterminated character class
  const formattedFileName = fileName?.replace(
    /[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g,
    "\\$&"
  );

  await db
    .collection(`imagecollection/${eventId}`)
    .aggregate([
      {
        $unwind: "$image",
      },
      {
        $match: {
          "image.author": author,
          ...(fileName && {
            "image.fileName": {
              $regex: new RegExp(".*" + formattedFileName + ".*"),
            },
          }),
        },
      },
      {
        $project: {
          path: 1,
          pathCount: { $size: "$path" },
          image: 1,
          isFeatured: 1,
          isRemoved: 1,
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
              fileName: "$image.fileName",
              path: "$path",
              pathCount: "$pathCount",
              isFeatured: "$isFeatured",
              isRemoved: "$isRemoved",
              orientation: {
                $ifNull: ["$image.orientation", "vertical"],
              },
            },
          },
        },
      },
      {
        $sort: { [`image.${sortBy}`]: 1 },
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
        .map((item) => item.image)
        .flat();
      const totalCount = result[0]?.totalCount[0]?.count || 0;
      res.send({ images, totalCount, detectedImageLength });
    });
});

router.post("/updateBibs", async (req, res) => {
  const db = req.app.db;
  const { eventId, imageId, bibs } = req.body;
  await db
    .collection(`imagecollection/${eventId}`)
    .updateOne({ "image.id": imageId }, { $set: { path: bibs } });

  res.send({ status: 200 });
});

//設定 image 為精選或移除
router.post("/setStatus/:eventId/:imageId/:author", async (req, res) => {
  const db = req.app.db;
  const { eventId, imageId, author } = req.params;
  const isFeatured = req.body?.isFeatured;
  const isRemoved = req.body?.isRemoved;

  //精選照片上限400張
  if (isFeatured) {
    const featuredImageLength = await db
      .collection(`imagecollection/${eventId}`)
      .countDocuments({ "image.author": author, isFeatured: true });

    if (featuredImageLength >= 400) {
      return res.send({ status: "fail", message: "精選照片上限400張" });
    }
  }

  await db.collection(`imagecollection/${eventId}`).updateOne(
    { "image.id": imageId, "image.author": author },
    {
      $set: {
        ...(isFeatured !== undefined && { isFeatured: isFeatured }),
        ...(isRemoved !== undefined && { isRemoved: isRemoved }),
      },
    }
  );

  res.send({ status: "success" });
});

router.get("/getByStatus/:eventId/:author", async (req, res) => {
  const db = req.app.db;
  const { eventId, author } = req.params;
  const status = req.query.status;
  const isFeatured = status === "featured";
  const isRemoved = status === "removed";

  const page = req.query.page - 1 || 0;
  const countsPerPage = 24;

  await db
    .collection(`imagecollection/${eventId}`)
    .aggregate([
      {
        $unwind: "$image",
      },
      {
        $match: {
          "image.author": author,
          ...(isFeatured && { isFeatured: true }),
          ...(isRemoved && { isRemoved: true }),
        },
      },
      {
        $project: {
          image: 1,
          ...(isFeatured && { isFeatured: 1 }),
          ...(isRemoved && { isRemoved: 1 }),
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
              fileName: "$image.fileName",
              path: "$path",
              pathCount: "$pathCount",
              isFeatured: "$isFeatured",
              isRemoved: "$isRemoved",
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
    .toArray((error, result) => {
      const images = result[0]?.paginatedResults
        .map((item) => item.image)
        .flat();
      const totalCount = result[0]?.totalCount[0]?.count || 0;
      res.send({ images, totalCount });
    });
});

module.exports = router;
