const createSignaturedHeader = require("./createSignaturedHeader");
const dotenv = require("dotenv");
dotenv.config({ path: `.env.${process.env.NODE_ENV}` });

const uri = `/v3/payments/request`;

const linePay = async (orderId, amount, refinedProducts, isMobile) => {
  const requestBody = JSON.stringify({
    orderId,
    amount,
    currency: "TWD",
    packages: [
      {
        id: orderId,
        amount,
        products: refinedProducts,
      },
    ],
    redirectUrls: {
      confirmUrl: process.env.LINE_PAY_CONFIRM_URL,
      confirmUrlType: isMobile ? "SERVER" : "CLIENT", // "CLIENT" or "SERVER
      cancelUrl: process.env.LINE_PAY_CANCEL_URL,
    },
    options: {
      display: {
        locale: "zh_TW",
        checkConfirmUrlBrowser: true,
      },
    },
  });

  const linePayRes = await fetch(`${process.env.LINE_PAY_SITE}${uri}`, {
    method: "POST",
    headers: createSignaturedHeader(uri, requestBody),
    body: requestBody,
  })
    .then((res) => res.json())
    .then((res) => {
      if (res.returnCode === "0000") return res.info.paymentUrl;
      else return res;
    })
    .catch((err) => console.log(err));

  return linePayRes;
};

module.exports = linePay;
