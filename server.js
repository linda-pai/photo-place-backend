const Express = require("express");
const cors = require("cors");
const UUID = require("uuid");
const emailSender = require("./src/modules/emailSender");
const session = require("cookie-session");
const dayjs = require("dayjs");

const userRouter = require("./src/routes/user");

const mongoUtil = require("./src/database/mongoUtil");
const dotenv = require("dotenv");
dotenv.config({ path: `.env.${process.env.NODE_ENV}` });

const { uploadToS3, multerUploader } = require("./src/modules/uploadModules");
const { getWatermarkedImageUrl } = require("./src/modules/drawWatermark");
const {
  getWatermarkedImageUrlFromRemote,
} = require("./src/modules/drawWatermarkFromRemote");

const { uploadToS3andDetectText } = require("./src/modules/detectText");

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

// mongoDB path
//{host}/images/{event_id}/{detected_Number}|common/image.jpg

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

//上傳圖片
app.post(
  `${apiRoot}/images/uploadAndDetectText`,
  multerUploader.single("file"),
  async (req, res) => {
    //取得 lastModified from req.file
    if (!req.file) return res.json({ error: "沒有檔案" });
    TODO: try {
      return Promise.all([
        uploadToS3andDetectText(req.file, "/" + req.body.eventId + "/"), //1. 上傳圖片到S3   -> 辨識號碼               (拿到 originImageUrl & 辨識號碼)
        getWatermarkedImageUrl(req.file, "/" + req.body.eventId + "/"), //2. 產生浮水印圖片 -> 上傳浮水印圖片到S3        (拿到 watermarkedImageUrl)
      ])
        .then(async (response) => {
          const { originImageUrl, detectedNumbers, fileName } = response[0];
          const { watermarkedUrl } = response[1];
          const eventId = req.body.eventId;

          const data = {
            id: "img-" + UUID.v4(),
            url: originImageUrl,
            watermarkedUrl,
            fileName,
            price: 109,
            ...req.body,
          };
          //依照 eventId 傳到不同的 collection
          //path: detectedNumbers or common
          try {
            const paths =
              detectedNumbers.length > 0
                ? detectedNumbers
                : [{ DetectedText: "common" }];

            const pathList = paths.map(({ DetectedText }) => DetectedText);

            const imageObj = {
              path: pathList,
              image: data,
              author: req.body.author,
              uploadId: req.body.uploadId,
            };

            await db
              .collection(`imagecollection/${eventId}`)
              .insertOne(imageObj);
          } catch (error) {
            console.log("DetectedText-err", error);
            res.json({ error: "新增失敗" });
          }

          res.status(200).json({
            message: "上傳成功",
            data,
            progress: 100,
          });
        })
        .catch((err) => {
          console.log("err", err);
          res.json({ error: "新增失敗" });
        });
    } catch (error) {
      console.log(error);
      res.json({ error: "新增失敗" });
    }
  }
);

//update 圖片 watermarkedUrl by imageId
app.put(`${apiRoot}/images/updateWatermarkedUrl/:eventId`, (req, res) => {
  const eventId = req.params.eventId;

  const updateWatermarkedUrl = async (eventId) => {
    const images = await db
      .collection(`imagecollection/${eventId}`)
      .find({})
      .limit(20)
      .skip(1600)
      .toArray();

    const flattenData = images.map((item) => item.image).flat();
    console.log("flattenData.length", flattenData.length);

    for (var x = 0, ln = flattenData.length; x < ln; x++) {
      setTimeout(
        function (y) {
          uploadSinglePhoto(y);
        },
        x * 1500,
        x
      );
    }

    const uploadSinglePhoto = async (x) => {
      const watermarkedImage = await getWatermarkedImageUrlFromRemote(
        flattenData[x].url,
        "/" + eventId + "/"
      );

      db.collection(`imagecollection/${eventId}`).updateOne(
        { "image.id": flattenData[x].id },
        {
          $set: {
            "image.$.watermarkedUrl": watermarkedImage.watermarkedUrl,
          },
        }
      );

      console.log(
        "success!!!watermarkedImage \n",
        watermarkedImage.watermarkedUrl
      );
    };
  };

  updateWatermarkedUrl(eventId);
});

//紀錄上傳資訊
app.post(`${apiRoot}/images/writeUploadInfo`, (req, res) => {
  const TimeStamp = dayjs().utcOffset(8).format("YYYYMMDDHHmmss");
  const data = {
    ...req.body,
    createAt: TimeStamp,
    paidAt: null,
  };

  const author = req.body.author;
  if (!author) return res.json({ message: "新增失敗" });

  db.collection(`uploadIntocollection`)
    .insertOne(data)
    .then(() => res.json({ message: "新增成功" }))
    .catch((error) => {
      console.log("add-error", error);
      return res.json({ message: "新增失敗" });
    });
});

//查詢上傳資訊 by author
app.get(`${apiRoot}/images/getUploadInfo/:author`, (req, res) => {
  const author = req.params.author;

  db.collection(`uploadIntocollection`)
    .find({ author })
    .toArray((error, result) => {
      res.send(result);
    });
});

//查詢圖片 by 號碼布 & event_id
app.get(`${apiRoot}/images/getByPathAndEventId/:eventId/:bib`, (req, res) => {
  const bid = req.params.bib;
  const eventId = req.params.eventId;

  const countsPerPage = 100;
  const page = req.query.page - 1 || 0;

  db.collection(`imagecollection/${eventId}`)
    .aggregate([
      {
        $unwind: "$image",
      },
      {
        $match: {
          path:
            bid === "all"
              ? {
                  $elemMatch: { $regex: new RegExp(".*") },
                  $ne: "common",
                }
              : {
                  $elemMatch: { $regex: new RegExp(".*" + bid + ".*") },
                },
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
              eventId: "$image.eventId",
              watermarkedUrl: "$image.watermarkedUrl",
            },
          },
        },
      },
    ])
    .sort({ _id: 1 })
    .skip(page * countsPerPage)
    .limit(countsPerPage)
    .toArray((error, result) => {
      const images = result.map((item) => item.image).flat();
      res.send(images);
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

//建立訂單
app.post(`${apiRoot}/orders/add`, (req, res) => {
  const orderData = {
    ...req.body,
    createAt: dayjs().utcOffset(8).format("YYYY-MM-DD HH:mm:ss"),
    paidAt: null,
  };

  db.collection("ordercollection")
    .insertOne(orderData)
    .then(async () => {
      const user = await db
        .collection("usercollection")
        .find({ userId: req.body.orderBy })
        .project({ token: 1, email: 1, name: 1, userId: 1 })
        .toArray();
      //寄信
      if (user[0]?.email)
        await emailSender({
          email: user[0]?.email,
          subject: "攝影小隊 - 訂單成立通知",
          html: `
        <div>
        
          <div style={{ margin:0 auto }}>
            <h2> Hi ${user[0].name}，您的訂單已成立，</h2> 
            <p> 請於 7 天內完成付款，逾期將自動取消訂單歐～</p>
            <p> 至以下網址查看訂單明細：${
              process.env.CLIENT_DOMAIN
            }/user/orders</p>
            <p> ----------------------------------------------------------------</p> 
            <p>訂單編號：${orderData.orderId} </p> 
            <p>訂單金額：TWD ${orderData.totalAmount}</p>  
            <p>訂單時間：${dayjs(orderData.createAt)
              .utcOffset(8)
              .format("YYYY-MM-DD HH:mm:ss")} </p> 
            <p>----------------------------------------------------------------</p> 
            <p>感謝您的購買，祝您有美好的一天！</p> 
            <p>如有任何問題歡迎聯繫我們！ ⬇️⬇️</p>
            <p>📷 PHOTO PACER 攝影小隊 </p> 
            <p>聯絡信箱： photopacer@gmail.com</p>
            <div>
              <p>官方Line：@774uebxu</p>
              <img src=${
                process.env.AWS_BUCKET_URL
              }/images/common/725ab7f17a21d4b310407e9312be8e12f2037bfdca3b559c83344e6151c1ad71-S_gainfriends_2dbarcodes_GW.png width="65px"/>
            </div>
          </div>
          <img src=${
            process.env.AWS_BUCKET_URL
          }/images/common/e76d8b95013eff5cc00520fcd8233755c4d17450bf04d2d0a4111beda623f5a3-photo-pacer-high-resolution-logo+(3).png width="25%"/>
        </div>
        `,
        });
      res.json({ message: "新增成功" });
    })
    .catch((error) => {
      console.log("add-error", error);
      return res.json({ message: "新增失敗" });
    });
});

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

//付款 - 更新訂單 paidAt
app.put(`${apiRoot}/orders/update/:orderId`, async (req, res) => {
  db.collection("ordercollection")
    .updateOne(
      { orderId: req.params.orderId },
      {
        $set: {
          paidAt: dayjs().utcOffset(8).format("YYYY-MM-DD HH:mm:ss"),
        },
      }
    )
    .then(async () => {
      const user = await db
        .collection("usercollection")
        .find({ userId: req.body.orderBy })
        .project({ token: 1, email: 1, name: 1, userId: 1 })
        .toArray();

      //寄信
      if (user[0]?.email)
        await emailSender({
          email: user[0]?.email,
          subject: "攝影小隊 - 訂單付款成功通知",
          html: `
        <div>
          <div style={{ margin:0 auto }}>
            <h2> Hi ${user[0].name}，您的訂單已付款成功，</h2> 
            <p> 請至以下網址下載照片：${process.env.CLIENT_DOMAIN}/user/orders</p>
            <p> ----------------------------------------------------------------</p> 
            <p>感謝您的購買，祝您有美好的一天！</p> 
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
