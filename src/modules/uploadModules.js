const AWS = require("aws-sdk");
const multer = require("multer");

// AWS config
const awsConfig = {
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION,
};

const s3 = new AWS.S3(awsConfig);

const uploadToS3 = (file) => {
  const params = {
    Bucket: process.env.AWS_BUCKET_NAME,
    Key: "test/" + Date.now() + "-" + file.originalname,
    Body: file.buffer,
    ContentType: file.mimetype,
  };
  return s3.upload(params).promise();
};

const multerUploader = multer({
  fileFilter: (req, file, done) => {
    if (
      file.mimetype === "image/png" ||
      file.mimetype === "image/jpeg" ||
      file.mimetype === "image/jpg"
    ) {
      done(null, true);
    } else {
      done(new Error("不支援的檔案格式"), false);
    }
  },
});

module.exports = { uploadToS3, multerUploader };
