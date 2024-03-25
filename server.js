const Express = require("express");
const cors = require("cors");
const UUID = require("uuid");
const emailSender = require("./src/modules/emailSender");
const session = require("cookie-session");
const dayjs = require("dayjs");
const linePay = require("./src/modules/linePay/linePay");
const linePayConfirm = require("./src/modules/linePay/linePayConfirm");

const newebPay = require("./src/modules/newebpay/newebPay");
const createSesDecrypt = require("./src/modules/newebpay/createSesDecrypt");
const createShaEncrypt = require("./src/modules/newebpay/createShaEncrypt");

const paymentConst = require("./src/lib/constants");

const userRouter = require("./src/routes/user");

const mongoUtil = require("./src/database/mongoUtil");
const dotenv = require("dotenv");
dotenv.config({ path: `.env.${process.env.NODE_ENV}` });

const {
  uploadToS3,
  multerUploader,
  getSignedUploadURL,
  getSignedMultipartUploadURL,
  createMultipartUpload,
  completeMultipartUpload,
} = require("./src/modules/uploadModules");
const { getWatermarkedImageUrl } = require("./src/modules/drawWatermark");

const {
  uploadToS3andDetectText,
  getDetectedByKey,
} = require("./src/modules/detectText");

var utc = require("dayjs/plugin/utc");
dayjs.extend(utc);

const app = Express();
const PORT = 3001;
const apiRoot = "/api";

const bodyParser = require("body-parser");
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

const whitelist = [
  `${process.env.CLIENT_DOMAIN}`,
  `${process.env.CLIENT_WWW_DOMAIN}`,
];
const corsOptions = {
  origin: (origin, callback) => {
    if (whitelist.indexOf(origin) !== -1 || !origin) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  oprtionsSuccessStatus: 200,
};

app.use(
  session({
    secret: "keyboard cat",
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false }, //TODO: 研究：正式環境要改成 true
  })
);

app.use(cors(corsOptions));
app.use("/user", userRouter);

var db;

mongoUtil.connectToServer(function (err, client) {
  if (err) console.log(err);
  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    db = mongoUtil.getDb();
  });
});

//TODO:有 bug 有時候會連不到 db
app.post(`${apiRoot}/user/createUser`, async (req, res) => {
  const userId = req.body.userId || "user-" + UUID.v4().substring(0, 12);
  const user = {
    role: "user", //TODO: 預設為 user
    createTime: dayjs().utcOffset(8).format("YYYY-MM-DD HH:mm:ss"),
    ...req.body,
  };
  //check if user already exists
  const userExist = await db
    .collection("usercollection")
    .find({ userId: user.userId })
    .toArray();

  if (userExist.length > 0) {
    db.collection("usercollection").updateOne(
      { email: user.email },
      { $set: { token: user.token } }
    );
    return res.status(200).json({ userId });
  } else {
    db.collection("usercollection").insertOne(user);
    return res.status(200).json({ userId });
  }
});

app.get(`${apiRoot}/user/getUserInfo/:token`, async (req, res) => {
  await db
    .collection("usercollection")
    .find({ token: req.params.token })
    .project({ token: 1, email: 1, name: 1, role: 1 })
    .toArray((error, result) => {
      const user = result[0];
      res.send(user);
    });
});

//取得上傳圖片的簽名網址
app.post(`${apiRoot}/images/getSignedUploadURL`, async (req, res) => {
  const { signedUrl, key } = await getSignedUploadURL(
    req.body.fileName,
    "/" + req.body.eventId + "/"
  );
  res.send({ signedUrl, key });
});

//1. detectText  2. drawWatermark  3. uploadToS3 by bucketKey
app.post(`${apiRoot}/images/addWatermark`, async (req, res) => {
  const { key, eventId, eventName, author, price, fileName, lastModified } =
    req.body;

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
        lastModified,
      };

      try {
        const paths = detectedNumbers.length > 0 ? detectedNumbers : [];

        const pathList = paths.map(({ DetectedText }) => DetectedText);

        const imageObj = {
          path: pathList,
          image: data,
          author,
          isReleased: false,
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
app.post(`${apiRoot}/images/writeUploadInfo`, (req, res) => {
  const TimeStamp = dayjs().utcOffset(8).format("YYYYMMDDHHmmss");
  const data = {
    ...req.body,
    createAt: TimeStamp,
    chargeAt: null,
  };

  const { eventId, author } = req.body;
  if (!author) return res.json({ message: "新增失敗" });

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

//更新上傳資訊的 images
app.post(`${apiRoot}/images/updateUploadInfo`, (req, res) => {
  const TimeStamp = dayjs().utcOffset(8).format("YYYYMMDDHHmmss");
  const { eventId, author, images } = req.body;

  db.collection(`uploadInfocollection`).updateOne(
    { author, eventId },
    {
      $set: {
        images,
        lastEditTime: TimeStamp,
      },
    }
  );
  res.json({ message: "更新成功" });
});

//查詢上傳資訊 by author
app.get(`${apiRoot}/images/getUploadInfo/:author`, (req, res) => {
  const author = req.params.author;

  db.collection(`uploadInfocollection`)
    .find({ author })
    .sort({ createAt: -1 })
    .toArray((error, result) => {
      res.send(result);
    });
});

app.get(
  `${apiRoot}/images/getUploadImgDetail/:eventId/:author`,
  async (req, res) => {
    const eventId = req.params.eventId;
    const author = req.params.author;

    const isReleasedLength = await db
      .collection(`imagecollection/${eventId}`)
      .countDocuments({
        author,
        isReleased: true,
      });

    const unReleasedLength = await db
      .collection(`imagecollection/${eventId}`)
      .countDocuments({
        author,
        isReleased: false,
      });

    res.send({ isReleasedLength, unReleasedLength });
  }
);

app.put(`${apiRoot}/images/releaseByEventId/:eventId`, (req, res) => {
  const eventId = req.params.eventId;

  db.collection(`imagecollection/${eventId}`).updateMany(
    { isReleased: false },
    {
      $set: {
        isReleased: true,
      },
    }
  );
  res.json({ message: "更新成功", status: 200 });
});

//查詢圖片 by 號碼布 & event_id
app.get(`${apiRoot}/images/getByPathAndEventId/:eventId`, async (req, res) => {
  const path = req.query.path || "";
  const eventId = req.params.eventId;

  const countsPerPage = 15;
  const page = req.query.page - 1 || 0;

  await db
    .collection(`imagecollection/${eventId}`)
    .aggregate([
      {
        $unwind: "$image",
      },
      {
        $match: {
          path:
            path === "unIdentify"
              ? {
                  $size: 0,
                }
              : {
                  $elemMatch: { $regex: new RegExp(".*" + path + ".*") },
                  $ne: [],
                },
          isReleased: true,
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

//取得所有圖片 count
app.get(`${apiRoot}/images/getCount/:eventId`, async (req, res) => {
  const eventId = req.params.eventId;
  const count = await db
    .collection(`imagecollection/${eventId}`)
    .countDocuments();

  res.send({ count });
});

//確認已付款 - 查詢圖片 by eventId & imageIds
app.get(
  `${apiRoot}/images/getByEventIdAndImageIds/:orderId/:eventId/:imageIds`,
  async (req, res) => {
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

//查詢 events
app.get(`${apiRoot}/events`, (req, res) => {
  db.collection("eventlistcollection")
    .find({})
    .sort({ date: -1 })
    .toArray((error, result) => {
      res.send(result);
    });
});

//查詢 event by id
app.get(`${apiRoot}/events/getBy/:eventId`, (req, res) => {
  const eventId = req.params.eventId;
  db.collection("eventlistcollection")
    .find({ eventId })
    .toArray((error, result) => {
      res.send(result[0]);
    });
});

//更新 event by id
app.put(`${apiRoot}/events/update/:eventId`, (req, res) => {
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
app.delete(`${apiRoot}/events/delete/:eventId`, (req, res) => {
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
app.get(`${apiRoot}/events/getEventOptions`, (req, res) => {
  db.collection("eventlistcollection")
    .find({})
    .project({ eventName: 1, eventId: 1, date: 1 })
    .toArray((error, result) => {
      res.send(result);
    });
});

//取得圖片 by ids
app.get(`${apiRoot}/images/getByIds/:eventId/:ids`, (req, res) => {
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

//新增 event
app.post(
  `${apiRoot}/events/add`,
  multerUploader.single("file"),
  async (req, res) => {
    const eventData = {
      eventId: "evt-" + UUID.v4().substring(0, 12),
      ...req.body,
      isShow: false, //TODO: 預設不顯示
      isCompleteUpload: false, //TODO: 預設不顯示
    };

    db.collection("eventlistcollection")
      .insertOne(eventData)
      .then(() => res.json({ message: "新增成功" }))
      .catch((error) => {
        console.log("add-error", error);
      });
  }
);

//純上傳圖片到 S3
app.post(
  `${apiRoot}/singleImgS3Upload`,
  multerUploader.single("file"),
  async (req, res) => {
    const file = req.file;
    const path = req.body.path || "/";
    uploadToS3(file, path).then((result) => res.json(result));
  }
);

//查詢訂單 by orderId
app.get(`${apiRoot}/orders/:orderId`, (req, res) => {
  const orderId = req.params.orderId;

  db.collection("ordercollection")
    .find({ id: orderId })
    .toArray((error, result) => {
      res.send(result);
    });
});

//查詢訂單 by orderBy
app.get(`${apiRoot}/orders/getByUser/:orderBy`, (req, res) => {
  const orderBy = req.params.orderBy;

  db.collection("ordercollection")
    .find({ orderBy })
    .sort({ createAt: -1 })
    .toArray((error, result) => {
      res.send(result);
    });
});

const sendOrderSuccessEmail = async (orderId) => {
  db.collection("ordercollection")
    .findOne({ orderId })
    .then(async (result) => {
      const { orderBy } = result;

      const user = await db
        .collection("usercollection")
        .find({ userId: orderBy })
        .project({ token: 1, email: 1, name: 1, userId: 1 })
        .toArray();
      //寄信
      try {
        if (user[0]?.email)
          await emailSender({
            email: user[0]?.email,
            subject: `${process.env.EMAIL_PREFIX} PHOTO PACER 攝影小隊 - 訂單付款成功通知`,
            html: `
            <div>
              <div style={{ margin:0 auto }}>
                <h2> Hi ${user[0].name}，您的訂單已付款成功，</h2> 
                <p>即可到訂單查詢頁下載照片：${process.env.CLIENT_DOMAIN}/user/orders</p>
                <p>感謝您的購買，期待下次我們賽道再相見！</p> 
                <p>⬇️⬇️ 如有任何問題歡迎聯繫我們！ ⬇️⬇️</p>
                <p>📷 PHOTO PACER 攝影小隊 </p> 
                <p>聯絡信箱： photopacer@gmail.com</p>
                <div>
                  <p>官方Line：@774uebxu</p>
                  <img src=${process.env.AWS_BUCKET_URL}/images/common/725ab7f17a21d4b310407e9312be8e12f2037bfdca3b559c83344e6151c1ad71-S_gainfriends_2dbarcodes_GW.png width="65px"/>
                </div>
              </div>
              <img src=${process.env.AWS_BUCKET_URL}/images/common/e76d8b95013eff5cc00520fcd8233755c4d17450bf04d2d0a4111beda623f5a3-photo-pacer-high-resolution-logo+(3).png width="25%"/>
            </div>
          `,
          });
      } catch (error) {
        "sendOrderSuccessEmail-error", error;
      }
    });
};

const sendSoldEmail = async (author, soldCount) => {
  const user = await db
    .collection("usercollection")
    .find({ userId: author })
    .project({ token: 1, email: 1, name: 1, userId: 1 })
    .toArray();
  //寄信
  try {
    if (user[0]?.email)
      await emailSender({
        email: user[0]?.email,
        subject: `${process.env.EMAIL_PREFIX} PHOTO PACER 攝影小隊 - 照片售出通知🎉🎉🎉`,
        html: `
            <div>
              <div style={{ margin:0 auto }}>
                <h2> Hi ${user[0].name}，您的照片已售出 ${soldCount}張照片，</h2> 
                <p>查看更多細節 - 上傳紀錄頁：${process.env.CLIENT_DOMAIN}/photographer/uploadDetail</p>
                <p>很高興有機會幫助您賣出照片，期待您下次更多優秀作品！</p>
                <p>⬇️⬇️ 如有任何問題歡迎聯繫我們！ ⬇️⬇️</p>
                <p>📷 PHOTO PACER 攝影小隊 </p> 
                <p>聯絡信箱： photopacer@gmail.com</p>
                <div>
                  <p>官方Line：@774uebxu</p>
                  <img src=${process.env.AWS_BUCKET_URL}/images/common/725ab7f17a21d4b310407e9312be8e12f2037bfdca3b559c83344e6151c1ad71-S_gainfriends_2dbarcodes_GW.png width="65px"/>
                </div>
              </div>
              <img src=${process.env.AWS_BUCKET_URL}/images/common/e76d8b95013eff5cc00520fcd8233755c4d17450bf04d2d0a4111beda623f5a3-photo-pacer-high-resolution-logo+(3).png width="25%"/>
            </div>
            `,
      });
  } catch (error) {
    "sendSoldEmail-error", error;
  }
};

//付款 - 更新訂單
app.put(`${apiRoot}/orders/update/:orderId`, async (req, res) => {
  db.collection("ordercollection")
    .updateOne(
      { orderId: req.params.orderId },
      {
        $set: {
          ...req.body,
        },
      }
    )
    .then(async () => {
      if (req.body.paidAt) {
        await sendOrderSuccessEmail(req.params.orderId);
      }
      res.json({ message: "更新成功" });
    })
    .catch((error) => {
      console.log("update-error", error);
      return res.json({ message: "更新失敗" });
    });
});

//刪除訂單
app.post(`${apiRoot}/orders/delete/:orderId`, (req, res) => {
  db.collection("ordercollection")
    .deleteOne({ orderId: req.params.orderId })
    .then(() => res.json({ message: "刪除成功" }))
    .catch((error) => {
      console.log("delete-error", error);
      return res.json({ message: "刪除失敗" });
    });
});

//訂單列表
app.get(`${apiRoot}/orders`, (req, res) => {
  db.collection("ordercollection")
    .find({})
    .sort({ createAt: -1 })
    .toArray((error, result) => {
      res.send(result);
    });
});

//line pay request
app.post(`${apiRoot}/linepay/request`, async (req, res) => {
  const { orderId, amount, items, isMobile, orderBy } = req.body;

  //確認是否已經付款
  const isPaid = await db
    .collection("ordercollection")
    .find({
      orderId: orderId,
      //paidAt不等於null
      paidAt: { $ne: null },
    })
    .toArray();

  if (isPaid.length > 0) {
    return res.send({ status: "paid", result: isPaid });
  }

  const refinedProducts = items.map((item) => ({
    id: item.id,
    name: item.eventName + " " + item.id,
    imageUrl: item.watermarkedUrl,
    quantity: 1,
    price: item.price,
  }));

  createOrder({
    orderId,
    totalAmount: amount,
    items,
    orderBy,
    paymentMethod: paymentConst.LINE_PAY,
  });

  const linePayRequest = await linePay(
    orderId,
    amount,
    refinedProducts,
    isMobile
  );
  res.send({ status: "success", result: linePayRequest });
});

const updateOrderPaidAt = async (orderId, transactionId, paymentMethod) => {
  db.collection("ordercollection").updateOne(
    {
      orderId,
    },
    {
      $set: {
        paidAt: dayjs().utcOffset(8).format("YYYY-MM-DD HH:mm:ss"),
        transactionId,
        paymentMethod,
      },
    }
  );
};

const updateUploadInfoSellInfo = async (orderId) => {
  const order = await db
    .collection("ordercollection")
    .find({ orderId })
    .toArray();

  const eventIdList = order[0].items.map((item) => item.eventId);
  //remove dulplicate eventId
  const eventIdListUnique = [...new Set(eventIdList)];
  const imagesList = order[0].items.map((item) => item.id);

  eventIdListUnique.forEach(async (eventId) => {
    const images = await db
      .collection(`imagecollection/${eventId}`)
      .find({ "image.id": { $in: imagesList } })
      .toArray();

    //把 images 分類 by author and uploadId
    const imagesByAuthor = images.reduce((acc, item) => {
      const author = item.author;
      const uploadId = item.uploadId;
      if (!acc[author]) {
        acc[author] = {};
      }
      if (!acc[author][uploadId]) {
        acc[author][uploadId] = [];
      }
      acc[author][uploadId].push(item);
      return acc;
    }, {});

    const imagesByAuthorList = Object.keys(imagesByAuthor);

    imagesByAuthorList.forEach(async (author) => {
      const uploadIdList = Object.keys(imagesByAuthor[author]);

      uploadIdList.forEach(async (uploadId) => {
        const images = imagesByAuthor[author][uploadId];
        await db.collection(`uploadInfocollection`).updateOne(
          { uploadId },
          {
            $set: {
              sellInfo: images.map((item) => {
                const { id, watermarkedUrl, price, eventId } = item.image;
                return {
                  orderId,
                  paymentMethod: order[0].paymentMethod,
                  price,
                  eventId,
                  id,
                  watermarkedUrl,
                };
              }),
            },
          }
        );
      });

      await sendSoldEmail(author, images.length);
    });
  });
};

//linePay confirm
app.post(`${apiRoot}/linepay/confirm`, async (req, res) => {
  const { orderId, transactionId } = req.body;

  //查詢訂單金額
  const order = await db
    .collection("ordercollection")
    .find({ orderId })
    .toArray();

  const amount = order[0].totalAmount;

  const linePayResult = await linePayConfirm(transactionId, amount);

  try {
    if (linePayResult.returnCode === "0000") {
      await updateOrderPaidAt(orderId, transactionId, paymentConst.LINE_PAY);
      await updateUploadInfoSellInfo(orderId);

      await sendOrderSuccessEmail(orderId);

      res.send({ status: "success", result: linePayResult });
    }
  } catch (error) {
    res.send({ status: "fail", result: linePayResult });
  }
});

//建立訂單
const createOrder = async (data) => {
  const { orderId, MerchantOrderNo } = data;
  //確認訂單是否已經存在
  const isExist = await db
    .collection("ordercollection")
    .find({ orderId })
    .toArray();

  if (isExist.length > 0) {
    //update MerchantOrderNo
    MerchantOrderNo &&
      db.collection("ordercollection").updateOne(
        { orderId },
        {
          $set: {
            MerchantOrderNo,
          },
        }
      );
    return;
  }

  const orderData = {
    ...data,
    createAt: dayjs().utcOffset(8).format("YYYY-MM-DD HH:mm:ss"),
    paidAt: null,
  };

  db.collection("ordercollection")
    .insertOne(orderData)
    .then(async () => {
      const user = await db
        .collection("usercollection")
        .find({ userId: data.orderBy })
        .project({ token: 1, email: 1, name: 1, userId: 1 })
        .toArray();
      //寄信
      if (user[0]?.email)
        await emailSender({
          email: user[0]?.email,
          subject: `${process.env.EMAIL_PREFIX} PHOTO PACER 攝影小隊 - 訂單成立通知`,
          html: `
      <div>
        <div style={{ margin:0 auto }}>
          <h2> Hi ${user[0].name}，您的訂單已成立，</h2> 
          <p> 請於 7 天內完成付款，逾期將自動取消訂單歐～</p>
          <p> 至以下網址查看訂單明細：${process.env.CLIENT_DOMAIN}/user/orders</p>
          <p>訂單編號：${orderData.orderId} </p> 
          <p>訂單金額：TWD ${orderData.totalAmount}</p>  
          <p>感謝您的購買，祝您有美好的一天！</p> 
          <p>如有任何問題歡迎聯繫我們！ ⬇️⬇️</p>
          <p>📷 PHOTO PACER 攝影小隊 </p> 
          <p>聯絡信箱： photopacer@gmail.com</p>
          <div>
            <p>官方Line：@774uebxu</p>
            <img src=${process.env.AWS_BUCKET_URL}/images/common/725ab7f17a21d4b310407e9312be8e12f2037bfdca3b559c83344e6151c1ad71-S_gainfriends_2dbarcodes_GW.png width="65px"/>
          </div>
        </div>
        <img src=${process.env.AWS_BUCKET_URL}/images/common/e76d8b95013eff5cc00520fcd8233755c4d17450bf04d2d0a4111beda623f5a3-photo-pacer-high-resolution-logo+(3).png width="25%"/>
      </div>
      `,
        });
      return orderData;
    })
    .catch((error) => {
      console.log("add-error", error);
      return;
    });
};

app.post(`${apiRoot}/newebpay/request`, async (req, res) => {
  const data = req.body;
  //確認是否已經付款
  const isPaid = await db
    .collection("ordercollection")
    .find({
      orderId: data.orderId,
      //paidAt不等於null
      paidAt: { $ne: null },
    })
    .toArray();

  if (isPaid.length > 0) {
    return res.send({ status: "paid", result: isPaid });
  }
  const encryptOrder = await newebPay(data);

  createOrder({
    ...data,
    ...encryptOrder,
    paymentMethod: paymentConst.NEWEB_PAY,
  });

  res.send({
    status: "success",
    result: encryptOrder,
    url: process.env.NEWEBPAY_PGW_URL,
  });
});

app.post(`${apiRoot}/newebpay/decrypt`, async (req, res) => {
  const data = createSesDecrypt(req.body.TradeInfo);
  if (data.Status === "SUCCESS") {
    res.send({ status: "success", ...data });
  } else {
    res.send({ status: "fail", ...data });
  }
});

app.post(`${apiRoot}/newebpay/notify`, async (req, res) => {
  // 解密交易內容
  const response = req.body;
  const data = createSesDecrypt(response.TradeInfo);
  // 使用 HASH 再次 SHA 加密字串，確保比對一致（確保不正確的請求觸發交易成功）
  const thisShaEncrypt = createShaEncrypt(res.TradeInfo);
  if (!thisShaEncrypt === res.TradeSha) {
    console.log("付款失敗：TradeSha 不一致");
    return res.end();
  }

  //查詢訂單資訊
  if (data.Status === "SUCCESS") {
    const { MerchantOrderNo, TradeNo } = data.Result;
    const order = await db
      .collection("ordercollection")
      .find({ MerchantOrderNo: Number(MerchantOrderNo) })
      .toArray();

    const orderId = order?.[0]?.orderId;
    if (!orderId) return res.end();
    await updateOrderPaidAt(orderId, TradeNo, paymentConst.NEWEB_PAY);
    await updateUploadInfoSellInfo(orderId);

    await sendOrderSuccessEmail(orderId);

    res.send({ status: "success", ...data });
  }

  return res.end();
});

//登記活動上傳完成通知資訊
app.post(`${apiRoot}/imagesUploadComplete/notifyRecord`, async (req, res) => {
  //確認是否已經有相同的 email &notifyUrl
  const { eventId, email, notifyUrl } = req.body;
  const notifyRecord = await db
    .collection(`notifycollection`)
    .find({ eventId, email, notifyUrl })
    .toArray();

  if (notifyRecord.length > 0) {
    return res.send({ status: 200, msg: "已經有登記過囉～" });
  } else {
    await db.collection(`notifycollection`).insertOne({
      notifyId: "notify-" + UUID.v4().substring(0, 12),
      creatAt: dayjs().utcOffset(8).format("YYYY-MM-DD HH:mm:ss"),
      ...req.body,
    });
    res.send({ status: 200, msg: "登記成功" });
  }
});

//取得活動上傳完成通知資訊
app.get(
  `${apiRoot}/imagesUploadComplete/notifyRecord/:eventId`,
  async (req, res) => {
    const eventId = req.params.eventId;

    const notifyRecord = await db
      .collection(`notifycollection`)
      .find({ eventId })
      .toArray();

    res.send(notifyRecord);
  }
);

//個別觸發上傳圖片完成通知
app.post(`${apiRoot}/imagesUploadComplete/sendEmail`, async (req, res) => {
  const { eventId, notifyId } = req.body;
  const notifyRecord = await db
    .collection(`notifycollection`)
    .find({ eventId, notifyId })
    .toArray();

  const { email, eventName, notifyUrl } = notifyRecord[0];

  try {
    await ImagesUploadEmailNotify(email, eventName, notifyUrl);
    await updateNotifyRecord(notifyId, eventId);

    res.send({ status: 200 });
  } catch (error) {
    console.log("ImagesUploadEmailNotify-error", error);
    res.send({ status: 500 });
  }
});

//一鍵觸發上傳圖片完成通知
app.post(
  `${apiRoot}/imagesUploadComplete/sendAllEmail/:eventId`,
  async (req, res) => {
    const eventId = req.params.eventId;

    const notifyRecord = await db
      .collection(`notifycollection`)
      .find({ eventId })
      .toArray();

    notifyRecord.forEach(async (item) => {
      const { email, eventName, notifyUrl } = item;

      try {
        await ImagesUploadEmailNotify(email, eventName, notifyUrl);
        await updateNotifyRecord(item.notifyId, eventId);
      } catch (error) {
        console.log("ImagesUploadEmailNotify-error", error);
      }
    });

    res.send({ status: "success" });
  }
);

//update notifyRecord
const updateNotifyRecord = async (notifyId, eventId) => {
  await db.collection(`notifycollection`).updateOne(
    { notifyId, eventId },
    {
      $set: {
        status: "sent",
        notifyAt: dayjs().utcOffset(8).format("YYYY-MM-DD HH:mm:ss"),
      },
    }
  );
};

//上傳圖片完成通知
const ImagesUploadEmailNotify = async (email, eventName, notifyUrl) => {
  try {
    await emailSender({
      email,
      subject: `${process.env.EMAIL_PREFIX} PHOTO PACER 攝影小隊 - 照片上傳完成通知: ${eventName}`,
      html: `
      <div>
        <div style={{ margin:0 auto }}>
          <h2>${eventName} 的照片已上傳完成，</h2>
          <p>即可到 ${notifyUrl} 搜尋號碼布，尋找您的照片囉！</p>
          <p>感謝您使用本平台，祝您有美好的一天！我們下次賽道再相見！</p>
          <p>⬇️⬇️ 如有任何問題歡迎聯繫我們！ ⬇️⬇️</p>
          <p>📷 PHOTO PACER 攝影小隊 </p> 
          <p>聯絡信箱： photopacer@gmail.com</p>
          <div>
            <p>官方Line：@774uebxu</p>
            <img src=${process.env.AWS_BUCKET_URL}/images/common/725ab7f17a21d4b310407e9312be8e12f2037bfdca3b559c83344e6151c1ad71-S_gainfriends_2dbarcodes_GW.png width="65px"/>
          </div>
        </div>
        <img src=${process.env.AWS_BUCKET_URL}/images/common/e76d8b95013eff5cc00520fcd8233755c4d17450bf04d2d0a4111beda623f5a3-photo-pacer-high-resolution-logo+(3).png width="25%"/>
      </div>
    `,
    });

    return { status: "200" };
  } catch (error) {
    console.log("ImagesUploadEmailNotify-error", error);
    return { status: "500" };
  }
};

//multipart upload

app.get("/start-upload", async (req, res, next) => {
  try {
    const path = req.query.path;
    const fileName = req.query.fileName;

    let uploadData = await createMultipartUpload(path, fileName);
    res.send(uploadData);
  } catch (err) {
    console.log("start-upload", err);
  }
});

app.get("/get-upload-url", async (req, res, next) => {
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

app.post("/complete-upload", async (req, res, next) => {
  try {
    const { key, parts, uploadId } = req.body;
    let params = {
      Bucket: process.env.AWS_BUCKET_NAME,
      Key: key,
      MultipartUpload: {
        Parts: parts,
      },
      UploadId: uploadId,
    };
    let completeUploadPromised = await completeMultipartUpload(params);
    res.send({ data: completeUploadPromised });
  } catch (err) {
    console.log("complete-upload", err);
    res.send({ error: err });
  }
});

//photographer/* 用的，要有 :author 才能查詢
app.get(
  `${apiRoot}/images/getByAuthor/:eventId/:author/:sortBy`,
  async (req, res) => {
    const { eventId, author, sortBy } = req.params;
    const countsPerPage = 15;
    const page = req.query.page - 1 || 0;
    await db
      .collection(`imagecollection/${eventId}`)
      .aggregate([
        {
          $unwind: "$image",
        },
        {
          $match: {
            author,
            isReleased: req.query.isReleased === "false" ? false : true,
          },
        },
        {
          $project: {
            path: 1,
            pathCount: { $size: "$path" },
            image: 1,
            isReleased: 1,
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
                isReleased: "$isReleased",
                path: "$path",
                pathCount: "$pathCount",
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
        res.send({ images, totalCount });
      });
  }
);

app.post(`${apiRoot}/images/updateBibs`, async (req, res) => {
  const { eventId, imageId, bibs } = req.body;
  await db
    .collection(`imagecollection/${eventId}`)
    .updateOne({ "image.id": imageId }, { $set: { path: bibs } });

  res.send({ status: 200 });
});
