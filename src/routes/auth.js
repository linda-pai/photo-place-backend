// TODO:刪除這個檔案

const Express = require("express");
const router = Express.Router();

const googleOAuth2Client = require("../../config/googleOAuth2Client");

const SCOPES = ["https://mail.google.com/"];

router.get("/login/:secretkey", (req, res) => {
  if (req.params.secretkey !== process.env.GOOGLE_CLIENT_SECRET)
    return res.status(401).send("Unauthorized");
  const authUrl = googleOAuth2Client.generateAuthUrl({
    access_type: "offline", //TODO:研究這個參數
    scope: SCOPES,
  });
  res.redirect(authUrl);
});

router.get("/googlemail/callback", async (req, res) => {
  const code = req.query.code;
  try {
    const { tokens } = await googleOAuth2Client.getToken(code);
    googleOAuth2Client.setCredentials(tokens);
    req.session.tokens = tokens;
    res.send("Successfully authenticated");
  } catch (err) {
    console.error("Error authenticating with Google:", err);
    res.status(500).send("Error authenticating with Google");
  }
});

module.exports = router;
