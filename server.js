var Express = require("express");
var Mongoclient = require("mongodb").MongoClient;
var cors = require("cors");
const multer = require("multer");
const fs = require("fs");
const config = require("config");

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

var CONNECTION_STRING = config.get("mongodbConfig.connection");
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

app.post("/api/products/uploadImage", multer().none(), (request, response) => {
  const storage = multer.diskStorage({
    destination: function (req, file, cb) {
      cb(null, "public");
    },
    filename: function (req, file, cb) {
      cb(null, file.filename + "-" + Date.now());
    },
  });
  const upload = multer({ storage: storage });

  let newPath = `public/images/uploads/${req.file.originalname}`;
  fs.rename(req.file.path, newPath, () => {
    request.json({ result: "image uploaded successful" });
  });
});
