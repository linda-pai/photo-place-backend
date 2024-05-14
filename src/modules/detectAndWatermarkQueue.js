const { getWatermarkedImageUrl } = require("./watermark/drawWatermark");
const { getDetectedByKey } = require("./detectText");

//multipart upload
const detectAndWatermark = async (db, eventId, imageItem) => {
  const { id, url, fileName } = imageItem.image;
  const key = decodeURIComponent(
    url?.split(process.env.AWS_BUCKET_URL + "/")[1]
  ).replace(/\+/g, " ");

  const detectedNumbers = await getDetectedByKey(key);
  const watermarkedResult = await getWatermarkedImageUrl(
    key,
    "/" + eventId + "/",
    fileName
  );
  Promise.all([detectedNumbers, watermarkedResult]).then(
    async ([detectedNumbers, watermarkedResult]) => {
      const { watermarkedUrl, orientation } = watermarkedResult;
      const paths = detectedNumbers.length > 0 ? detectedNumbers : [];
      const pathList = paths.map(({ DetectedText }) => DetectedText);

      await db.collection(`imagecollection/${eventId}`).updateOne(
        {
          "image.id": id,
        },
        {
          $set: {
            "image.watermarkedUrl": watermarkedUrl,
            path: pathList,
            "image.orientation": orientation,
          },
        }
      );
      return { watermarkedUrl, pathList };
    }
  );
};

const detectAndWatermarkQueue = async (db, eventId, imageArray) => {
  //group by ${groupSize} wait for the previous group to finish
  const groupSize = 10;
  const results = [];
  for (let i = 0; i < imageArray.length; i += groupSize) {
    const group = imageArray.slice(i, i + groupSize);
    const groupPromises = group.map((imageItem) =>
      detectAndWatermark(db, eventId, imageItem)
    );
    const groupResults = await Promise.all(groupPromises);
    results.push(groupResults);
  }

  return results;
};

module.exports = { detectAndWatermarkQueue };
