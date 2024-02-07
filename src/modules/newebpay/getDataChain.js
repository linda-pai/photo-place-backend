const dotenv = require("dotenv");
dotenv.config({ path: `.env.${process.env.NODE_ENV}` });

function genDataChain(order) {
  const RespondType = "JSON";

  return `MerchantID=${process.env.MerchantID}&TimeStamp=${
    order.TimeStamp
  }&Version=${process.env.Version}&RespondType=${RespondType}&MerchantOrderNo=${
    order.MerchantOrderNo
  }&Amt=${order.Amt}&NotifyURL=${encodeURIComponent(
    process.env.NotifyUrl
  )}&ReturnURL=${encodeURIComponent(
    process.env.ReturnUrl
  )}&ItemDesc=${encodeURIComponent(order.ItemDesc)}&Email=${encodeURIComponent(
    order.Email
  )}`;
}

module.exports = genDataChain;
