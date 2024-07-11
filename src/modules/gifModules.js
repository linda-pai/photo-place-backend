const GifEncoder = require("gifencoder");
const sharp = require("sharp");
const { uploadToS3, getS3Object } = require("./uploadModules");

async function generateGif(imageList, fileName) {
  const orientation = imageList[0]?.orientation || "vertical";
  const width = orientation === "vertical" ? 1200 : 1800;
  const height = orientation === "vertical" ? 1800 : 1200;
  const encoder = new GifEncoder(width, height);

  //write gif
  encoder.start();
  encoder.setRepeat(0);
  encoder.setDelay(500);
  encoder.setQuality(1);

  //read images from s3 url
  for (const item of imageList) {
    const imageKey = decodeURIComponent(
      item.url.split(process.env.AWS_BUCKET_URL + "/")[1]
    );
    const buffer = await getS3Object(imageKey);

    try {
      const { data } = await sharp(buffer.Body)
        .rotate()
        .resize({
          width,
          height,
          fit: "contain",
          background: { r: 255, g: 255, b: 255, alpha: 0 }, // 设置背景色为透明
        })
        .ensureAlpha() // 确保有 alpha 通道
        .raw()
        .toBuffer({ resolveWithObject: true });

      const rgbaData = new Uint8Array(width * height * 4);
      for (let i = 0; i < data.length; i += 4) {
        rgbaData[i] = data[i]; // Red
        rgbaData[i + 1] = data[i + 1]; // Green
        rgbaData[i + 2] = data[i + 2]; // Blue
        rgbaData[i + 3] = data[i + 3]; // Alpha
      }

      encoder.addFrame(rgbaData);
    } catch (err) {
      console.error("Error processing image:", err);
    }
  }

  encoder.finish();
  const buffer = encoder.out.getData();
  const path = `/gifs/`;
  const gifUrl = await uploadGifToS3(buffer, path, fileName);
  return gifUrl;
}

//upload gif to s3
const uploadGifToS3 = async (buffer, path, fileName) => {
  return new Promise(async (resolve, reject) => {
    try {
      const result = await uploadToS3(
        {
          mimetype: "image/gif",
          originalname: fileName,
          buffer,
        },
        path
      );
      resolve(result.Location || "");
    } catch (error) {
      reject(error);
    }
  });
};

module.exports = { generateGif };
