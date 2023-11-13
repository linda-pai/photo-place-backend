const Express = require("express");
const cors = require("cors");
const multer = require("multer");
const UUID = require("uuid");
const emailSender = require("./src/modules/emailSender");
const session = require("express-session");

const userRouter = require("./src/routes/user");
const authRouter = require("./src/routes/auth");

const mongoUtil = require("./src/database/mongoUtil");
const dotenv = require("dotenv");
dotenv.config();

const { uploadToS3, multerUploader } = require("./src/modules/uploadModules");
const { getWatermarkedImageUrl } = require("./src/modules/drawWatermark");
const { uploadToS3andDetectText } = require("./src/modules/detectText");

const app = Express();
const PORT = 3001;
const apiRoot = "/api";

const bodyParser = require("body-parser");
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

const whitelist = ["http://localhost:3000", "http://localhost:3001"];
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
app.use("/auth", authRouter);

var db;

mongoUtil.connectToServer(function (err, client) {
  if (err) console.log(err);
  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    db = mongoUtil.getDb();
  });
});

//localhost:3000/api/products 可以看到 productlistcollection 所有資料
app.get(apiRoot + "/products/getAll", (request, response) => {
  db.collection("productlistcollection")
    .find({})
    .toArray((error, result) => {
      response.send(result);
    });
});

app.post("/api/products/add", multer().none(), (request, response) => {
  db.collection("productlistcollection").count({}, function (error, numOfDocs) {
    db.collection("productlistcollection").insertOne({
      id: (numOfDocs + 1).toString(),
      name: request.body?.name,
    });
    console.log("add-error", error);
    response.json({ message: "新增成功" });
  });
});

app.delete("/api/products/delete/:id", (request, response) => {
  db.collection("productlistcollection").deleteOne(
    {
      id: request.params.id,
    },
    function (error, result) {
      console.log("delete-error", error);
      response.json({ message: "刪除成功" });
    }
  );
});

//列表頁回傳 根據 event_id 回傳該 path 底下所有圖片
const listPageData = {
  listPageData: [
    {
      id: "eRFRFWEFEG13413r",
      event_id: "1",
      watermarkedUrl:
        "https://photo-place-buckets.s3.ap-northeast-1.amazonaws.com/test/1630545644117-1698828609267-testDetect.png",
      price: 100,
      date: "2021-09-02T14:40:44.000Z",
    },
  ],
  currentPage: 1,
  totalPage: 10,
  totalData: 100,
};

// mongoDB path
//{host}/images/{event_id}/{detected_Number}|common/image.jpg

//TODO:有 bug 有時候會連不到 db
app.post("/user/createUser", async (req, res) => {
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

  console.log("userExist", userExist);

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

app.get("/user/getUserInfo/:token", async (req, res) => {
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
  "/api/images/uploadAndDetectText",
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
          const author = req.body.author;

          const data = {
            id: "img-" + UUID.v4(),
            eventId,
            url: originImageUrl,
            watermarkedUrl,
            fileName,
            author,
            price: 150,
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
            console.log(error);
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
app.get("/api/images/getByBidAndEventId/:eventId/:bib", (req, res) => {
  const bid = req.params.bib;
  const eventId = req.params.eventId;

  db.collection(`imagecollection/${eventId}`)
    .find({ path: bid })
    .toArray((error, result) => {
      const images = result
        .map((item) => {
          item.images.map((image) => delete image.url);
          return item.images;
        })
        .flat();
      res.send(images);
    });
});

//查詢圖片 by event_id
app.get("/api/images/getByEventId/:eventId", (req, res) => {
  const eventId = req.params.eventId;

  db.collection(`imagecollection/${eventId}`)
    .find({})
    .toArray((error, result) => {
      const images = result
        .map((item) => {
          delete item.url;
          return item;
        })
        .flat();
      res.send(images);
    });
});

//確認已付款 - 查詢圖片 by eventId & verifyCode
// app.get("/api/images/getByEventId/:eventId/:verifyCode", (req, res) => {
//   const eventId = req.params.eventId;
//   const verifyCode = req.params.verifyCode;

//   db.collection(`imagecollection/${eventId}`)
//     .find({})
//     .toArray((error, result) => {
//       const images = result.map((item) => item.images).flat();
//       res.send(images);
//     });
// });

//查詢 events by year
app.get("/api/events", (req, res) => {
  db.collection("eventlistcollection")
    .find({})
    .toArray((error, result) => {
      res.send(result);
    });
});

//取得活動下拉選單
app.get("/api/events/getEventOptions", (req, res) => {
  db.collection("eventlistcollection")
    .find({})
    .project({ eventName: 1, id: 1, date: 1 })
    .toArray((error, result) => {
      res.send(result);
    });
});

//取得圖片 by ids
app.get("/api/images/getByIds/:eventId/:ids", (req, res) => {
  const eventId = req.params.eventId;
  const ids = req.params.ids;

  const testconnection = db.collection(`imagecollection/${eventId}`);

  testconnection
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
            },
          },
        },
      },
    ])
    .toArray((error, result) => res.send(result));
});

//新增 event
app.post("/api/events/add", multerUploader.single("file"), async (req, res) => {
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
});

//純上傳圖片到 S3
app.post(
  "/api/singleImgS3Upload",
  multerUploader.single("file"),
  async (req, res) => {
    const file = req.file;
    uploadToS3(file).then((result) => res.json(result));
  }
);

//建立訂單
app.post("/api/orders/add", (req, res) => {
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
        text: `親愛的 ${user[0].name} 您好，您的訂單已成立，請至以下網址付款：http://localhost:3000/order/${req.body.orderId}`,
      });
      res.json({ message: "新增成功" });
    })
    .catch((error) => {
      console.log("add-error", error);
      return res.json({ message: "新增失敗" });
    });
});

//查詢訂單 by orderId
app.get("/api/orders/:orderId", (req, res) => {
  const orderId = req.params.orderId;

  db.collection("ordercollection")
    .find({ id: orderId })
    .toArray((error, result) => {
      res.send(result);
    });
});

//查詢訂單 by orderBy
app.get("/api/orders/getByUser/:orderBy", (req, res) => {
  const orderBy = req.params.orderBy;

  db.collection("ordercollection")
    .find({ orderBy })
    .toArray((error, result) => {
      res.send(result);
    });
});

//付款 - 更新訂單 paidAt
app.put("/api/orders/update/:orderId", async (req, res) => {
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
        text: `親愛的 ${user[0].name} 您好，您的訂單已付款成功，請至以下網址下載：http://localhost:3000/order/${req.body.orderId}`,
      });
      res.json({ message: "更新成功" });
    })

    .catch((error) => {
      console.log("update-error", error);
      return res.json({ message: "更新失敗" });
    });
});

//訂單列表
app.get("/api/orders", (req, res) => {
  db.collection("ordercollection")
    .find({})
    .toArray((error, result) => {
      res.send(result);
    });
});
