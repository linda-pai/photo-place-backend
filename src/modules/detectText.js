const AWS = require("aws-sdk");
require("dotenv").config();
// AWS config
const awsConfig = {
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION,
};

AWS.config.update({ region: process.env.AWS_REGION });

const fileName = "test/1698805959430-testDetect.png";

const client = new AWS.Rekognition();
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
  } else {
    console.log(`Detected Text for: ${fileName}`);
    // console.log(response);
    // response.TextDetections.forEach((label) => {
    //   console.log(`Detected Text: ${label.DetectedText}`),
    //     console.log(`Type: ${label.Type}`),
    //     console.log(`ID: ${label.Id}`),
    //     console.log(`Confidence: ${label.Confidence}`),
    //     console.log(`Polygon: `);
    //   console.log(label.Geometry.Polygon);
    // });

    response.TextDetections.map((label) =>
      label.Confidence > 90 &&
      label.Type === "LINE" &&
      Number(label.DetectedText)
        ? console.log(label.DetectedText, label.Confidence)
        : null
    );
  }
});
