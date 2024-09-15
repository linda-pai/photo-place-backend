const express = require("express");
const router = express.Router();

const urllib = require("urllib");

const dotenv = require("dotenv");
dotenv.config({ path: `.env.${process.env.NODE_ENV}` });

router.post("/ip-update", (req, res) => {
  const instanceIp = req.body.instanceIp;

  const MONGODB_API_PUBLIC_KEY = process.env.MONGODB_API_PUBLIC_KEY;
  const MONGODB_API_PRIVATE_KEY = process.env.MONGODB_API_PRIVATE_KEY;
  const MONGODB_GROUP_ID = process.env.MONGODB_GROUP_ID;
  const MONGODB_ORG_ID = process.env.MONGODB_ORG_ID;
  const MONGODB_API_KEY_ID = process.env.MONGODB_API_KEY_ID;

  try {
    // 构建 MongoDB Atlas API 请求
    const url = `https://cloud.mongodb.com/api/atlas/v2/groups/${MONGODB_GROUP_ID}/accessList`;

    // 请求的URL
    const apiKeyUrl = `https://cloud.mongodb.com/api/atlas/v2/orgs/${MONGODB_ORG_ID}/apiKeys/${MONGODB_API_KEY_ID}/accessList`;

    const payload = [
      {
        ipAddress: instanceIp,
        comment: "Auto-scaling instance",
      },
    ];

    const apiKeyPayload = [
      {
        ipAddress: instanceIp,
      },
    ];

    const options = {
      digestAuth: `${MONGODB_API_PUBLIC_KEY}:${MONGODB_API_PRIVATE_KEY}`,
      headers: {
        Accept: "application/vnd.atlas.2023-01-01+json", // update date to desired API version
        "Content-Type": "application/json",
      },
      method: "POST",
    };

    // 发送请求到 MongoDB Atlas API
    urllib
      .request(apiKeyUrl, {
        ...options,
        data: JSON.stringify(apiKeyPayload),
      })
      .then((response) => {
        if (response.statusCode !== 200) {
          console.error(
            `Unexpected Status: ${response.statusCode}: ${response.statusText}`
          );
        } else {
          console.log("IP address added successfully");
        }
      });

    // 发送请求到 MongoDB Atlas API
    urllib
      .request(url, {
        ...options,
        data: JSON.stringify(payload),
      })
      .then(({ data, res: response }) => {
        if (response.statusCode !== 200) {
          console.error(
            `Unexpected Status: ${response.statusCode}: ${response.statusText}`
          );
          res.json({
            message: "Unexpected Status",
            status: response.statusCode,
          });
        } else {
          res.json({ message: "IP address added successfully", status: 200 });
        }
      });
  } catch (error) {
    console.error("Error:", error.message);
    res.json({ message: error.message });
    return {
      statusCode: 500,
      body: JSON.stringify(error.message),
    };
  }
});

module.exports = router;
