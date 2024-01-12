// 對應文件 21, 22 頁：將 aes 解密
const crypto = require("crypto");
const dotenv = require("dotenv");

dotenv.config({ path: `.env.${process.env.NODE_ENV}` });

function createSesDecrypt(TradeInfo) {
  console.log("process.env.HASHKEY", process.env.HASHKEY);
  const decrypt = crypto.createDecipheriv(
    "aes256",
    process.env.HASHKEY,
    process.env.HASHIV
  );
  decrypt.setAutoPadding(false);
  const text = decrypt.update(TradeInfo, "hex", "utf8");
  const plainText = text + decrypt.final("utf8");
  const result = plainText.replace(/[\x00-\x20]+/g, "");
  return JSON.parse(result);
}

module.exports = createSesDecrypt;
