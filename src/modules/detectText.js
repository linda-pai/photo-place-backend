const AWS = require("aws-sdk");
const { uploadToS3 } = require("./uploadModules");
require("dotenv").config();

AWS.config.update({ region: process.env.AWS_REGION });

const client = new AWS.Rekognition();

const getDetectedNumbers = async (fileName) => {
  return new Promise((resolve, reject) => {
    const params = {
      Image: {
        S3Object: {
          Bucket: process.env.AWS_BUCKET_NAME,
          Name: fileName,
        },
      },
    };
    client.detectText(params, function (err, response) {
      if (err) {
        console.log(err, err.stack); // handle error if an error occurred
        resolve([]);
      } else {
        console.log(`Detected Text for: ${fileName}`);
        try {
          let detectedNumbers = [];
          response.TextDetections.map((label) =>
            label.Confidence > 90 &&
            label.Type === "LINE" &&
            Number(label.DetectedText)
              ? detectedNumbers.push({
                  DetectedText: label.DetectedText,
                  Confidence: label.Confidence,
                })
              : null
          );
          resolve(detectedNumbers || []);
        } catch (error) {
          console.log(error);
          resolve([]);
        }
      }
    });
  });
};

const uploadToS3andDetectText = (file) => {
  return new Promise(async (resolve, reject) => {
    try {
      const result = await uploadToS3(file);
      const detectedNumbers = await getDetectedNumbers(result.key);

      resolve({
        originImageUrl: result.Location,
        detectedNumbers,
        fileName: result.key,
      });
    } catch (error) {
      reject(error);
    }
  });
};

module.exports = { uploadToS3andDetectText };
