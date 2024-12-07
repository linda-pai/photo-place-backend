const express = require("express");
const router = express.Router();

const UUID = require("uuid");
const dayjs = require("dayjs");
const { getDetectedByKey } = require("../modules/detectText");
const {
  getWatermarkedImageUrl,
} = require("../modules/watermark/drawWatermark");

const {
  getSignedMultipartUploadURL,
  createMultipartUpload,
  completeMultipartUpload,
} = require("../modules/uploadModules");
const {
  writeUploadInfo,
  updateUploadInfo,
} = require("../modules/progress/progressModules");

//1. detectText  2. drawWatermark  3. uploadToS3 by bucketKey
router.post("/addWatermark", async (req, res) => {
  const db = req.app.db;
  const {
    key,
    eventId,
    eventName,
    author,
    authorName,
    price,
    fileName,
    lastModified,
  } = req.body;

  const detectedNumbers = await getDetectedByKey(key);
  const watermarkedImage = await getWatermarkedImageUrl(
    key,
    "/" + eventId + "/",
    fileName
  );

  return Promise.all([detectedNumbers, watermarkedImage]).then(
    async (response) => {
      const { watermarkedUrl } = response[1];

      const data = {
        id: "img-" + UUID.v4(),
        url: process.env.AWS_BUCKET_URL + "/" + key,
        watermarkedUrl,
        fileName,
        price,
        eventId,
        eventName,
        author,
        authorName,
        lastModified,
      };

      try {
        const paths = detectedNumbers.length > 0 ? detectedNumbers : [];

        const pathList = paths.map(({ DetectedText }) => DetectedText);

        const imageObj = {
          path: pathList,
          image: data,
        };

        await db.collection(`imagecollection/${eventId}`).insertOne(imageObj);
      } catch (error) {
        console.log("DetectedText-err", error);
        res.json({ error: "新增失敗" });
      }

      res.status(200).json({
        message: "上傳成功",
        data,
        progress: 100,
      });
    }
  );
});

//紀錄上傳資訊
router.post("/writeUploadInfo", async (req, res) => {
  const db = req.app.db;
  const TimeStamp = dayjs().utcOffset(8).format("YYYYMMDDHHmmss");

  const { eventId, author } = req.body;

  if (!author) return res.json({ message: "新增失敗" });
  const eventDate = await db
    .collection(`eventlistcollection`)
    .find({ eventId })
    .toArray();

  const data = {
    ...req.body,
    date: eventDate[0]?.date,
    createAt: TimeStamp,
    chargeAt: null,
  };

  //if author and eventId is not exist in uploadInfocollection
  db.collection(`uploadInfocollection`)
    .find({ author, eventId })
    .toArray((error, result) => {
      if (result.length === 0) {
        db.collection(`uploadInfocollection`).insertOne(data);
      } else {
        //update images and lastEditTime
        db.collection(`uploadInfocollection`).updateOne(
          { author, eventId },
          {
            $set: {
              lastEditTime: TimeStamp,
            },
          }
        );
      }
      res.json({ message: "新增成功" });
    });
});

router.post("/start-upload", async (req, res, next) => {
  try {
    const { path, fileName } = req.body;

    //TODO: //先問是否有相同檔案
    // const isExist = await db
    //   .collection(`imagecollection/${eventId}`)
    //   .find({ "image.fileName": fileName })
    //   .toArray();

    // if (isExist.length > 0) {
    //   return res.send({ status: 200, msg: "已經有相同檔案囉～" });
    // }

    let uploadData = await createMultipartUpload(path, fileName);
    res.send(uploadData);
  } catch (err) {
    console.log("start-upload", err);
    res.send({ error: err });
  }
});

router.get("/get-upload-url", async (req, res, next) => {
  const { partNumber, uploadId, key } = req.query;
  try {
    const url_expiration = process.env.AWS_URL_EXPIRATION || 1200;

    let params = {
      Bucket: process.env.AWS_BUCKET_NAME,
      Key: key,
      UploadId: uploadId,
      PartNumber: Number(partNumber),
      Expires: parseInt(url_expiration),
    };

    const { signedUrl } = await getSignedMultipartUploadURL(params);

    res.send({ preSignedURL: signedUrl, key });
  } catch (err) {
    console.log("get-upload-url", err);
  }
});

router.post("/complete-upload", async (req, res, next) => {
  const db = req.app.db;
  try {
    const { uploadData, parts, uploadId } = req.body;
    const { key, eventId } = uploadData;

    let params = {
      Bucket: process.env.AWS_BUCKET_NAME,
      Key: key,
      MultipartUpload: {
        Parts: parts,
      },
      UploadId: uploadId,
    };
    let completeUploadPromised = await completeMultipartUpload(params);

    if (completeUploadPromised.Location) {
      //紀錄到 db
      const data = {
        id: "img-" + UUID.v4(),
        url: completeUploadPromised.Location,
        ...uploadData,
      };

      //delete key
      delete data.key;

      await db.collection(`imagecollection/${eventId}`).insertOne({
        path: [],
        image: data,
        isFeatured: false,
        isRemoved: false,
      });
    }

    await updateUploadInfo(db, uploadData);
    res.send({ data: completeUploadPromised });
  } catch (err) {
    console.log("complete-upload", err);
    res.send({ error: err });
  }
});

//write uploaded info progress
router.post("/write-upload-progress", async (req, res) => {
  const db = req.app.db;
  await writeUploadInfo(res, db, req.body);
});

//remove uploaded info progress
router.post("/remove-upload-progress", async (req, res) => {
  const db = req.app.db;
  const { eventId, author, fileList } = req.body;
  const { path } = fileList;

  db.collection(`progresscollection`)
    .deleteOne({ eventId, author, path })
    .then(() => res.json({ message: "刪除成功" }));
});

module.exports = router;
