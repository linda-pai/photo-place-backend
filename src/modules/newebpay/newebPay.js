const createSesEncrypt = require("./createSesEncrypt");
const createShaEncrypt = require("./createShaEncrypt");
const dotenv = require("dotenv");
dotenv.config({ path: `.env.${process.env.NODE_ENV}` });

const newebPay = async (data) => {
  const TimeStamp = Math.round(new Date().getTime() / 1000);
  const order = {
    ...data,
    TimeStamp,
    Amt: parseInt(data.totalAmount),
    ItemDesc: data.orderId,
    MerchantOrderNo: TimeStamp,
  };

  // 進行訂單加密
  // 加密第一段字串，此段主要是提供交易內容給予藍新金流
  const aesEncrypt = createSesEncrypt(order);

  // 使用 HASH 再次 SHA 加密字串，作為驗證使用
  const shaEncrypt = createShaEncrypt(aesEncrypt);
  console.log("shaEncrypt:", shaEncrypt);
  order.TradeInfo = aesEncrypt;
  order.TradeSha = shaEncrypt;
  order.MerchantID = process.env.MerchantID;
  order.Version = process.env.Version;

  return order;
};

module.exports = newebPay;
