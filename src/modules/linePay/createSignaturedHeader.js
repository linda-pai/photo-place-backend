const UUID = require("uuid");
const Base64 = require("crypto-js/enc-base64");
const HmacSHA256 = require("crypto-js/hmac-sha256");
const dotenv = require("dotenv");
dotenv.config({ path: `.env.${process.env.NODE_ENV}` });

const createSignaturedHeader = (uri, requestBody) => {
  const nonce = UUID.v4();
  const string = `${process.env.LINE_PAY_CHANNEL_SECRET}${uri}${requestBody}${nonce}`;
  //Signature = Base64(HMAC-SHA256(Your ChannelSecret, (Your ChannelSecret + URI + RequestBody + nonce)))
  const signature = Base64.stringify(
    HmacSHA256(string, process.env.LINE_PAY_CHANNEL_SECRET)
  );
  const headers = {
    "Content-Type": "application/json",
    "X-LINE-ChannelId": process.env.LINE_PAY_CHANNEL_ID,
    "X-LINE-Authorization-Nonce": nonce,
    "X-LINE-Authorization": signature,
  };
  return headers;
};

module.exports = createSignaturedHeader;
