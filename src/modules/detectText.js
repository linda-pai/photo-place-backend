const {
  RekognitionClient,
  DetectTextCommand,
} = require("@aws-sdk/client-rekognition");
const { uploadToS3 } = require("./uploadModules");
const dotenv = require("dotenv");
dotenv.config({ path: `.env.${process.env.NODE_ENV}` });

const client = new RekognitionClient({
  region: process.env.AWS_REGION,
});

const getDetectedNumbers = async (detectKey) => {
  return new Promise(async (resolve, reject) => {
    const params = {
      Image: {
        S3Object: {
          Bucket: process.env.AWS_BUCKET_NAME,
          Name: detectKey,
        },
      },
    };
    const command = new DetectTextCommand(params);
    const response = await client.send(command);

    if (response.TextDetections) {
      const checkTextLengthAndIsNumber = (text, minimun) =>
        text.length >= minimun && !isNaN(text);
      try {
        let detectedNumbers = [];
        response.TextDetections.map((label) =>
          label.Confidence > 75 &&
          Number(checkTextLengthAndIsNumber(label.DetectedText, 3))
            ? detectedNumbers.push({
                DetectedText: label.DetectedText,
                Confidence: label.Confidence,
              })
            : null
        );
        const removeDuplicate = detectedNumbers.filter(
          (v, i, a) =>
            a.findIndex((t) => t.DetectedText === v.DetectedText) === i
        );
        resolve(removeDuplicate || []);
      } catch (error) {
        console.log(error);
        resolve([]);
      }
    } else {
      resolve([]);
    }
  });
};

const uploadToS3andDetectText = (file, path) => {
  return new Promise(async (resolve, reject) => {
    try {
      const result = await uploadToS3(file, path);
      await getDetectedNumbers(result.key).then((detectedNumbers) => {
        resolve({
          originImageUrl: result.Location,
          detectedNumbers,
          fileName: file.originalname || result.key,
        });
      });
    } catch (error) {
      reject(error);
    }
  });
};

const getDetectedByKey = async (detectKey) => {
  return new Promise(async (resolve, reject) => {
    try {
      const detectedNumbers = await getDetectedNumbers(detectKey);
      resolve(detectedNumbers);
    } catch (error) {
      reject(error);
    }
  });
};

module.exports = { uploadToS3andDetectText, getDetectedByKey };
