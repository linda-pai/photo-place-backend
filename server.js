const Express = require("express");
const cors = require("cors");
const UUID = require("uuid");
const emailSender = require("./src/modules/emailSender");
const session = require("cookie-session");
const dayjs = require("dayjs");
const { removeDuplicate } = require("./src/utils/removeDuplicate");

const userRouter = require("./src/routes/user");

const mongoUtil = require("./src/database/mongoUtil");
const dotenv = require("dotenv");
dotenv.config({ path: `.env.${process.env.NODE_ENV}` });

const { uploadToS3, multerUploader } = require("./src/modules/uploadModules");
const { getWatermarkedImageUrl } = require("./src/modules/drawWatermark");
const { uploadToS3andDetectText } = require("./src/modules/detectText");

const app = Express();
const PORT = 3001;
const apiRoot = "/api";

const bodyParser = require("body-parser");
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

const whitelist = [`${process.env.CLIENT_DOMAIN}`];
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
  const userId = "usr-" + UUID.v4().substring(0, 12);
  const user = {
    userId,
    role: "user", //TODO: 預設為 user
    ...req.body,
  };
  //check if user already exists
  const userExist = await db
    .collection("usercollection")
    .find({ email: user.email })
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

    TODO: try {
      return Promise.all([
        uploadToS3andDetectText(req.file), //1. 上傳圖片到S3   -> 辨識號碼               (拿到 originImageUrl & 辨識號碼)
        getWatermarkedImageUrl(req.file), //2. 產生浮水印圖片 -> 上傳浮水印圖片到S3        (拿到 watermarkedImageUrl)
      ])
        .then((response) => {
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
          // 1. 檢查是否有該 path 2. 沒有 -> 新增到 "common" 這個 path 3. 有 -> push
          try {
            const paths =
              detectedNumbers.length > 0
                ? detectedNumbers
                : [{ DetectedText: "common" }];
            paths.map(({ DetectedText }) => {
              const path = DetectedText;
              db.collection(`imagecollection/${eventId}`).updateOne(
                { path },
                {
                  $push: {
                    images: data,
                  },
                },
                { upsert: true }
              );
            });
          } catch (error) {
            console.log("DetectedText-err", error);
            res.json({ message: "新增失敗" });
          }

          res.status(200).json({
            message: "上傳成功",
            data,
          });
        })
        .catch((err) => {
          console.log("err", err);
          res.json({ message: "新增失敗" });
        });
    } catch (error) {
      console.log(error);
      res.json({ message: "新增失敗" });
    }
  }
);
//查詢圖片 by 號碼布 & event_id
app.get(`${apiRoot}/images/getByBidAndEventId/:eventId/:bib`, (req, res) => {
  const bid = Number(req.params.bib);
  const eventId = req.params.eventId;

  db.collection(`imagecollection/${eventId}`)
    .find({ path: new RegExp(".*" + bid + ".*") })
    .toArray((error, result) => {
      const images = result
        .map((item) => {
          item.images.map((image) => {
            delete image.url;
            delete image.fileName;
            return image;
          });
          return item.images;
        })
        .flat();

      const output = removeDuplicate(images);

      res.send(output);
    });
});

//查詢圖片 by event_id
app.get(`${apiRoot}/images/getByEventId/:eventId`, (req, res) => {
  const eventId = req.params.eventId;

  db.collection(`imagecollection/${eventId}`)
    //remove duplicate by images.id
    .find({})
    //.skip(10) //TODO: 這邊要改成分頁
    .limit(100)
    .toArray((error, result) => {
      const newObj = result.map((item) => {
        const images = item.images.map((image) => {
          delete image.url;
          return image;
        });
        return { path: item.path, images };
      });

      const flattenData = newObj.map((item) => item.images).flat();

      const output = removeDuplicate(flattenData);

      res.send(output);
    });
});

//check if is paid

//確認已付款 - 查詢圖片 by eventId & imageId
app.get(
  `${apiRoot}/images/download/:orderId/:eventId/:imageId`,
  async (req, res) => {
    const order = await db
      .collection("ordercollection")
      .find({ orderId: req.params.orderId })
      .toArray();
    const paidAt = order[0]?.paidAt;

    if (paidAt) {
      const eventId = req.params.eventId;
      const imageId = req.params.imageId;

      db.collection(`imagecollection/${eventId}`)
        .find({})
        .project({ images: 1 })
        .toArray((error, result) => {
          const images = result
            .map((item) => {
              return item.images;
            })
            .flat();
          const image = images.find((item) => item.id === imageId);
          res.send(image);
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

//取得活動下拉選單
app.get(`${apiRoot}/events/getEventOptions`, (req, res) => {
  db.collection("eventlistcollection")
    .find({})
    .project({ eventName: 1, id: 1, date: 1 })
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
        $unwind: "$images",
      },
      {
        $match: {
          "images.id": { $in: ids.split(",") },
        },
      },
      {
        $group: {
          _id: "$_id",
          images: {
            $push: {
              id: "$images.id",
              watermarkedUrl: "$images.watermarkedUrl",
              eventId: "$images.eventId",
              price: "$images.price",
              eventName: "$images.eventName",
            },
          },
        },
      },
    ])
    .toArray((error, result) => {
      const images = result.map((item) => item.images).flat();
      const output = removeDuplicate(images);
      res.send(output);
    });
});

//新增 event
app.post(
  `${apiRoot}/events/add`,
  multerUploader.single("file"),
  async (req, res) => {
    const eventData = {
      id: "evt-" + UUID.v4().substring(0, 12),
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
    uploadToS3(file).then((result) => res.json(result));
  }
);

//建立訂單
app.post(`${apiRoot}/orders/add`, (req, res) => {
  const orderData = {
    orderId: "ord-" + UUID.v4().substring(0, 12),
    ...req.body,
    createAt: new Date(),
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
      await emailSender({
        email: user[0].email,
        subject: "攝影小隊 - 訂單成立通知",
        html: `
        <div>
        <img src=${
          process.env.AWS_BUCKET_URL
        }/images/a8dabef6edd01faf5089db252278d27cb55fe1317075cc503eec03481940e213-photo-pacer-logo.png width="50%">
        <div style={{ margin:0 auto }}>
        <h2> Hi ${user[0].name}，您的訂單已成立，</h2> 
        <p> 請於 7 天內完成付款，逾期將自動取消訂單歐～</p>
        <p> 至以下網址查看訂單明細：${process.env.CLIENT_DOMAIN}/user/orders</p>
        <p> ----------------------------------------------------------------</p> 
        <p>訂單編號：${orderData.orderId} </p> 
        <p>訂單金額：TWD ${orderData.totalAmount}</p>  
        <p>訂單時間：${dayjs(orderData.createAt).format(
          "YYYY-MM-DD HH:mm:ss"
        )} </p> 
        <p>----------------------------------------------------------------</p> 
        <p>感謝您的購買，祝您有美好的一天！</p> 
        <p>如有任何問題歡迎聯繫我們！ ⬇️⬇️</p>
        <p>聯絡信箱： photopacer@gmail.com</p>
        <p>官方Line：@photopacer</p>
        <p>📷 PHOTO PACER 攝影小隊 </p> 
        </div>
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
          paidAt: new Date(),
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
      await emailSender({
        email: user[0].email,
        subject: "攝影小隊 - 訂單付款成功通知",
        html: `
        <div>
        <img src=${process.env.AWS_BUCKET_URL}/images/a8dabef6edd01faf5089db252278d27cb55fe1317075cc503eec03481940e213-photo-pacer-logo.png width="50%">
        <h2> Hi ${user[0].name}，您的訂單已付款成功，</h2> 
        <p> 請至以下網址下載照片：${process.env.CLIENT_DOMAIN}/user/orders</p>
        <p> ----------------------------------------------------------------</p> 
        <p>感謝您的購買，祝您有美好的一天！</p> 
        <p>⬇️⬇️ 如有任何問題歡迎聯繫我們！ ⬇️⬇️</p>
        <p>聯絡信箱： photopacer@gmail.com</p>
        <p>官方Line：@photopacer</p>
        <p>📷 PHOTO PACER 攝影小隊 </p> 
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

//訂單列表
app.get(`${apiRoot}/orders`, (req, res) => {
  db.collection("ordercollection")
    .find({})
    .sort({ createAt: -1 })
    .toArray((error, result) => {
      res.send(result);
    });
});
