const { createCanvas, loadImage } = require("canvas");
const GifEncoder = require("gifencoder");
const sharp = require("sharp");
const { uploadToS3, getS3Object } = require("./uploadModules");

async function generateGif(imageList, fileName) {
  const orientation = imageList[0]?.orientation || "vertical";
  const width = orientation === "vertical" ? 1200 : 1800;
  const height = orientation === "vertical" ? 1800 : 1200;
  const encoder = new GifEncoder(width, height);
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  //write gif
  encoder.start();
  encoder.setRepeat(0);
  encoder.setDelay(500);
  encoder.setQuality(1);

  //read images from s3 url
  await Promise.all(
    imageList.map(async (item, key) => {
      //按照key順序
      const imageKey = decodeURIComponent(
        item.url.split(process.env.AWS_BUCKET_URL + "/")[1]
      );
      const buffer = await getS3Object(imageKey);
      const resizedBuffer = await sharp(buffer.Body)
        .rotate()
        .resize({
          width,
          fit: "inside",
          withoutEnlargement: true,
        })
        .toBuffer();
      const image = await loadImage(resizedBuffer);

      // 居中绘制图像
      ctx.drawImage(image, 0, 0, width, height);
      encoder.addFrame(ctx);
    })
  );

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
