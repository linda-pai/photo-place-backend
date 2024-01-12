const crypto = require("crypto");
const dotenv = require("dotenv");
const genDataChain = require("./getDataChain");

dotenv.config({ path: `.env.${process.env.NODE_ENV}` });

function createSesEncrypt(TradeInfo) {
  const encrypt = crypto.createCipheriv(
    "aes-256-cbc",
    process.env.HASHKEY,
    process.env.HASHIV
  );
  const enc = encrypt.update(genDataChain(TradeInfo), "utf8", "hex");
  return enc + encrypt.final("hex");
}

module.exports = createSesEncrypt;
