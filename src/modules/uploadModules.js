const {
  S3Client,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
} = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

const multer = require("multer");
const { sha256 } = require("js-sha256");
const dotenv = require("dotenv");
dotenv.config({ path: `.env.${process.env.NODE_ENV}` });

// AWS config
const s3Configuration = {
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
  region: process.env.AWS_REGION,
};
const client = new S3Client(s3Configuration);

const uploadToS3 = async (file, customPath) => {
  const path = customPath || "/";
  return new Promise(async (resolve, reject) => {
    const key =
      `images${process.env.AWS_BUCKET_PREFIX}${path}` +
      sha256(file.originalname + new Date().toString()) +
      "-" +
      file.originalname;
    const params = {
      Bucket: process.env.AWS_BUCKET_NAME,
      Key: key,
      Body: file.buffer,
      // ContentType: file.mimetype,
    };
    const command = new PutObjectCommand(params);
    const response = await client.send(command);

    resolve({
      ...response,
      key,
      Location: `${process.env.AWS_BUCKET_URL}/${key}`,
    });
  });
};

const getS3Object = async (key) => {
  return new Promise(async (resolve, reject) => {
    // Create a helper function to convert a ReadableStream to a buffer.
    const streamToBuffer = (stream) =>
      new Promise((resolve, reject) => {
        const chunks = [];
        stream.on("data", (chunk) => chunks.push(chunk));
        stream.on("error", reject);
        stream.on("end", () => resolve(Buffer.concat(chunks)));
      });

    const params = {
      Bucket: process.env.AWS_BUCKET_NAME,
      Key: key,
    };
    const command = new GetObjectCommand(params);
    const response = await client.send(command);
    const buffer = await streamToBuffer(response.Body);
    resolve({ ...response, Body: buffer });
  });
};

const deleteS3Object = async (key) => {
  return new Promise(async (resolve, reject) => {
    const params = {
      Bucket: process.env.AWS_BUCKET_NAME,
      Key: key,
    };
    const command = new DeleteObjectCommand(params);
    const response = await client.send(command);
    resolve({ ...response, key });
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

const getSignedMultipartUploadURL = async (params) => {
  const command = new UploadPartCommand(params);
  const signedUrl = await getSignedUrl(client, command, {
    expiresIn: 60 * 15,
  });

  return {
    signedUrl,
  };
};

const createMultipartUpload = async (path, fileName) => {
  const key =
    `images${process.env.AWS_BUCKET_PREFIX}${path}` +
    sha256(fileName + new Date().toString()) +
    "-" +
    fileName;

  let params = {
    Bucket: process.env.AWS_BUCKET_NAME,
    Key: key,
    ContentType: "image/*",
  };

  const command = new CreateMultipartUploadCommand(params);
  const uploadId = await client.send(command);
  return {
    uploadId: uploadId.UploadId,
    key: uploadId.Key,
  };
};

const completeMultipartUpload = async (params) => {
  const command = new CompleteMultipartUploadCommand(params);
  return await client.send(command);
};

module.exports = {
  uploadToS3,
  getS3Object,
  deleteS3Object,
  multerUploader,
  getSignedMultipartUploadURL,
  createMultipartUpload,
  completeMultipartUpload,
};
