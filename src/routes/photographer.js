const express = require("express");
const router = express.Router();
const dotenv = require("dotenv");
dotenv.config({ path: `.env.${process.env.NODE_ENV}` });

const {
  getWatermarkedFeaturedImageUrl,
} = require("../modules/watermark/drawWatermark");
const { getImageInfoByEventId } = require("../modules/getImageModules");
const { REMOVE_IMAGE_STATUS } = require("../lib/constants");

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
router.post("/getUploadInfo", async (req, res) => {
  const db = req.app.db;
  const author = req.headers.authorization.split(" ")[1];

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
            emptyPathImageLength,
            reportedImageLength,
          } = await getImageInfoByEventId(db, eventId, author);

          item.allImageLength = allImageLength || 0;
          item.featuredLength = featuredLength || 0;
          item.removeImageLength = removeImageLength || 0;
          item.detectedImageLength = detectedImageLength || 0;
          item.emptyPathImageLength = emptyPathImageLength || 0;
          item.reportedImageLength = reportedImageLength || 0;

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
  const db = req.app.db;
  const watermark = await db
    .collection(`photographercollection`)
    .find({ author })
    .toArray();
  res.send(watermark);
});

//紀錄攝影師常用浮水印
router.post("/uploadWatermark", async (req, res) => {
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
router.post("/generateWatermark", async (req, res) => {
  const db = req.app.db;
  const { images, eventId, watermarkImg, position, opacity } = req.body;

  const promises = images.map(async (image) => {
    const imageInfo = await db
      .collection(`imagecollection/${eventId}`)
      .find({ "image.watermarkedUrl": image })
      .project({ "image.url": 1, "image.orientation": 1, "image.fileName": 1 })
      .toArray();

    const { url, fileName, orientation } = imageInfo[0].image;

    const { watermarkedUrl } = await getWatermarkedFeaturedImageUrl({
      bucketKey: decodeURIComponent(
        url.split(process.env.AWS_BUCKET_URL + "/")[1]
      ),
      watermarkedImageUrl: watermarkImg.split(
        process.env.AWS_BUCKET_URL + "/"
      )[1],
      position,
      fileName,
      orientation,
      opacity,
      path: "/" + eventId + "/featured-watermark/",
    });

    await db.collection(`imagecollection/${eventId}`).updateOne(
      { "image.watermarkedUrl": image },
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
router.post("/getFeaturedWatermarkImages", async (req, res) => {
  const db = req.app.db;
  const author = req.headers.authorization.split(" ")[1];
  const { eventId, imageList } = req.body;
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
          "image.watermarkedUrl": { $in: imageList },
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

//刪除精選照片浮水印
router.post("/deleteWatermark", async (req, res) => {
  const db = req.app.db;
  const { watermark } = req.body;
  const author = req.headers.authorization.split(" ")[1];

  await db
    .collection(`photographercollection`)
    .deleteOne({ watermarkImg: watermark, author })
    .then(() => {
      res.json({ message: "刪除成功" });
    });
});

router.post("/getSoldInfoByAuthor/:eventId", async (req, res) => {
  const db = req.app.db;
  const { eventId } = req.params;

  const author = req.headers.authorization.split(" ")[1];

  await db
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
    .toArray(async (error, result) => {
      //sorting by soldImage soldAt
      const soldImages = result[0]?.soldImages || [];
      if (soldImages.length === 0) {
        return res.send(result[0] || {});
      } else {
        const sortedSoldImages = soldImages.sort((a, b) => {
          return new Date(b.soldAt) - new Date(a.soldAt);
        });
        result[0].soldImages = sortedSoldImages || soldImages;
        return res.send(result[0] || {});
      }
    });
});

//photographer/* 用的，要有 :author 才能查詢
router.post("/getByAuthor", async (req, res) => {
  const db = req.app.db;
  const {
    eventId,
    authorQuery,
    lastModifiedSorting,
    detectLengthSorting,
    fileName,
    curPage,
    isEmptyPath,
  } = req.body;

  const author =
    req.headers.authorization.split(" ")[1] === process.env.ADMIN_PP_ID
      ? authorQuery
      : req.headers.authorization.split(" ")[1];

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
          ...(isEmptyPath && { path: { $size: 0 } }),
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
        //sorting by image pathCount and lastModified
        $sort: {
          ...(detectLengthSorting && {
            "image.pathCount": detectLengthSorting === "asc" ? 1 : -1,
          }),
          ...(lastModifiedSorting && {
            "image.lastModified": lastModifiedSorting === "asc" ? 1 : -1,
          }),
        },
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
  const isFeatured = status === REMOVE_IMAGE_STATUS.FEATURED;
  const isRemoved = status === REMOVE_IMAGE_STATUS.REMOVE;
  const isReported = status === REMOVE_IMAGE_STATUS.REPORTED;

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
          ...(isReported && { isReported: true }),
        },
      },
      {
        $project: {
          image: 1,
          ...(isFeatured && { isFeatured: 1 }),
          ...(isRemoved && { isRemoved: 1 }),
          ...(isReported && { isReported: 1, isRemoved: 1 }),
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
              isReported: "$isReported",
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

//set photographer display name
router.post("/setDisplayName", async (req, res) => {
  const db = req.app.db;
  const { author, displayName } = req.body;
  await db
    .collection(`photographercollection`)
    .updateOne({ author }, { $set: { displayName } });
  res.send({ message: "更新成功" });
});

//get photographer display name
router.get("/getDisplayName/:author", async (req, res) => {
  const db = req.app.db;
  const author = req.params.author;
  const displayName = await db
    .collection(`photographercollection`)
    .find({ author })
    .project({ displayName: 1 })
    .toArray();
  res.send(displayName[0]);
});

module.exports = router;
