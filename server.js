const Express = require("express");
const cors = require("cors");
const dayjs = require("dayjs");
// const fs = require("fs");

const userRouter = require("./src/routes/user");
const imageRouter = require("./src/routes/images");
const uploadRouter = require("./src/routes/upload");
const photographerRouter = require("./src/routes/photographer");
const eventRouter = require("./src/routes/events");
const cmsRouter = require("./src/routes/cms");
const newebpayRouter = require("./src/routes/newebpay");
const linepayRouter = require("./src/routes/linepay");
const orderRouter = require("./src/routes/orders");
// const roleRouter = require("./src/routes/roles");
const authChecker = require("./src/middleware/authChecker");
const adminChecker = require("./src/middleware/adminChecker");

const mongoUtil = require("./src/database/mongoUtil");
const dotenv = require("dotenv");
dotenv.config({ path: `.env.${process.env.NODE_ENV}` });

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

app.use(cors(corsOptions));
app.use(`${apiRoot}/user`, userRouter);
app.use(`${apiRoot}/images`, imageRouter);
app.use(`${apiRoot}/upload`, uploadRouter);
app.use(`${apiRoot}/events`, eventRouter);
app.use(`${apiRoot}/newebpay`, newebpayRouter);
app.use(`${apiRoot}/linepay`, linepayRouter);
app.use(`${apiRoot}/cms`, adminChecker, cmsRouter);
app.use(`${apiRoot}/orders`, authChecker, orderRouter);
app.use(`${apiRoot}/photographer`, authChecker, photographerRouter);
// app.use(`${apiRoot}/roles`, authChecker, roleRouter);

var db;

mongoUtil.connectToServer(function (err, client) {
  if (err) console.log(err);
  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    db = mongoUtil.getDb();
    app.db = db;
  });
});

//把 isReleased 的照片更新為 true by eventId，目前沒用到
// app.put(`${apiRoot}/images/releaseByEventId/:eventId`, (req, res) => {
//   const eventId = req.params.eventId;

//   db.collection(`imagecollection/${eventId}`).updateMany(
//     { isReleased: false },
//     {
//       $set: {
//         isReleased: true,
//       },
//     }
//   );
//   res.json({ message: "更新成功", status: 200 });
// });

//rename event isReviewd to isReviewed
// app.put(`${apiRoot}/events/renameIsReviewd`, (req, res) => {
//   db.collection("eventlistcollection")
//     .updateMany(
//       {
//         "date-time": { $exists: true },
//       },
//       {
//         $rename: {
//           "date-time": "dateTime",
//         },
//       }
//     )
//     .then(() => res.json({ message: "更新成功" }))
//     .catch((error) => {
//       console.log("update-error", error);
//       return res.json({ message: "更新失敗" });
//     });
// });

//從json 批次新增 event
// app.post(`${apiRoot}/events/addMany`, async (req, res) => {
//   //from json
//   const events = eventJson;
//   const eventData = events.map((event) => ({
//     eventId: "evt-" + UUID.v4().substring(0, 12),
//     ...event,
//     isShow: false,
//     isCompleteUpload: false,
//     isReviewed: true,
//   }));

//   //update eventJson
//   fs.writeFileSync("data.json", JSON.stringify(eventData));

//   db.collection("eventlistcollection")
//     .insertMany(eventData)
//     .then(() => res.json({ message: "新增成功" }))
//     .catch((error) => {
//       console.log("add-error", error);
//     });
// });
