const Express = require("express");
const cors = require("cors");
const multer = require("multer");
const UUID = require("uuid");

const Mongoclient = require("mongodb").MongoClient;
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

app.use(cors(corsOptions));

var CONNECTION_STRING = process.env.MONGO_CONNECTION_STRING;
var DATABASE_NAME = "productlistdb";
var database;

app.listen(PORT, () => {
  Mongoclient.connect(CONNECTION_STRING, (error, client) => {
    database = client.db(DATABASE_NAME);
    console.log("Connected to `" + DATABASE_NAME + "`!");
  });
});

//localhost:3000/api/products 可以看到 productlistcollection 所有資料
app.get(apiRoot + "/products/getAll", (request, response) => {
  database
    .collection("productlistcollection")
    .find({})
    .toArray((error, result) => {
      response.send(result);
    });
});

app.post("/api/products/add", multer().none(), (request, response) => {
  database
    .collection("productlistcollection")
    .count({}, function (error, numOfDocs) {
      database.collection("productlistcollection").insertOne({
        id: (numOfDocs + 1).toString(),
        name: request.body?.name,
      });
      console.log("add-error", error);
      response.json({ message: "新增成功" });
    });
});

app.delete("/api/products/delete/:id", (request, response) => {
  database.collection("productlistcollection").deleteOne(
    {
      id: request.params.id,
    },
    function (error, result) {
      console.log("delete-error", error);
      response.json({ message: "刪除成功" });
    }
  );
});

//data format

const imageData = {
  id: "eRFRFWEFEG13413r", //自動生成 uuid()
  url: "https://photo-place-buckets.s3.ap-northeast-1.amazonaws.com/test/12385/1630545644117-1698828609267-testDetect.png",
  watermarkedUrl:
    "https://photo-place-buckets.s3.ap-northeast-1.amazonaws.com/test/12385/1630545644117-1698828609267-testDetect.png",

  event_id: "1",
  price: 100,
  date: "2021-09-02T14:40:44.000Z",
  bibs: [12385, 6038],
};

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

//查詢圖片 by detected_Number
app.get("/api/products/getByDetectedNumber/:detectedNumber", (req, res) => {
  const detectedNumber = req.params.detectedNumber;
  database
    .collection(`productlistcollection/${detectedNumber}`)
    .find({})
    .toArray((error, result) => {
      res.send(result);
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

          const data = {
            id: UUID.v4(),
            url: originImageUrl,
            // bibs: detectedNumbers,
            watermarkedUrl,
            fileName,
            eventId,
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
              database.collection(`imagecollection/${eventId}`).updateOne(
                { path },
                {
                  $push: {
                    ...data,
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

  database
    .collection(`imagecollection/${eventId}`)
    .find({ path: bid })
    .project({ watermarkedUrl: 1, bibs: 1, id: 1, filename: 1 })
    .toArray((error, result) => {
      res.send(result);
    });
});

//查詢圖片 by event_id
app.get("/api/images/getByEventId/:eventId", (req, res) => {
  const eventId = req.params.eventId;

  database
    .collection(`imagecollection/${eventId}`)
    .find({})
    .toArray((error, result) => {
      res.send(result);
    });
});

//查詢 events by year
app.get("/api/events", (req, res) => {
  database
    .collection("eventlistcollection")
    .find({})
    .toArray((error, result) => {
      res.send(result);
    });
});

//取得活動下拉選單
app.get("/api/events/getEventOptions", (req, res) => {
  database
    .collection("eventlistcollection")
    .find({})
    .project({ eventName: 1, id: 1, date: 1 })
    .toArray((error, result) => {
      res.send(result);
    });
});

//新增 event
app.post("/api/events/add", multerUploader.single("file"), async (req, res) => {
  const eventData = {
    id: UUID.v4().substring(0, 8),
    eventName: req.body.eventName,
    date: req.body.date,
    coverImg: req.body.coverImg,
  };

  database
    .collection("eventlistcollection")
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
    console.log("filefile", file);

    uploadToS3(file).then((result) => {
      console.log("result", result);
      res.json(result);
    });
  }
);
