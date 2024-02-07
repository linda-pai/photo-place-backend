const createSignaturedHeader = require("./createSignaturedHeader");
const dotenv = require("dotenv");
dotenv.config({ path: `.env.${process.env.NODE_ENV}` });

const linePayConfirm = async (transactionId, amount) => {
  const uri = `/v3/payments/${transactionId}/confirm`;
  const requestBody = JSON.stringify({ amount, currency: "TWD" });

  const linePayConfirmRes = await fetch(`${process.env.LINE_PAY_SITE}${uri}`, {
    method: "POST",
    headers: createSignaturedHeader(uri, requestBody),
    body: requestBody,
  })
    .then((res) => res.json())
    .catch((err) => console.log(err));

  return linePayConfirmRes;
};

module.exports = linePayConfirm;
