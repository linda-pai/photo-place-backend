const AWS = require("aws-sdk");
const multer = require("multer");
const { sha256 } = require("js-sha256");

// AWS config
const awsConfig = {
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION,
  signatureVersion: "v4",
};

const s3 = new AWS.S3(awsConfig);

const uploadToS3 = async (file, customPath) => {
  const path = customPath || "/";
  return new Promise((resolve, reject) => {
    const key =
      `images${path}` +
      sha256(file.originalname + new Date().toString()) +
      "-" +
      file.originalname;
    const params = {
      Bucket: process.env.AWS_BUCKET_NAME,
      Key: key,
      Body: file.buffer,
      // ContentType: file.mimetype,
    };
    s3.upload(params, (error, data) => {
      if (error) {
        reject(error);
      }
      resolve({ ...data, key });
    });
  });
};

const getS3Object = async (key) => {
  return new Promise((resolve, reject) => {
    const params = {
      Bucket: process.env.AWS_BUCKET_NAME,
      Key: key,
    };
    s3.getObject(params, (error, data) => {
      if (error) {
        reject(error);
      }
      resolve(data);
    });
  });
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

const getSignedUploadURL = async (fileName, customPath) => {
  const path = customPath || "/";
  const key =
    `images${path}` + sha256(fileName + new Date().toString()) + "-" + fileName;

  let signedUrl = await s3.getSignedUrlPromise("putObject", {
    Bucket: process.env.AWS_BUCKET_NAME,
    Key: key,
    Expires: 120,
    ContentType: "image/*",
  });

  return {
    signedUrl,
    key,
  };
};

const getSignedMultipartUploadURL = async (params) => {
  let signedUrl = await s3.getSignedUrlPromise("uploadPart", params);

  return {
    signedUrl,
  };
};

const createMultipartUpload = async (params) => {
  const uploadId = await s3.createMultipartUpload(params).promise();

  return {
    uploadId: uploadId.UploadId,
    key: uploadId.Key,
  };
};

const completeMultipartUpload = async (params) => {
  return await s3.completeMultipartUpload(params).promise();
};

module.exports = {
  uploadToS3,
  getS3Object,
  multerUploader,
  getSignedUploadURL,
  getSignedMultipartUploadURL,
  createMultipartUpload,
  completeMultipartUpload,
};
