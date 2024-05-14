const { sha256 } = require("js-sha256");

const dotenv = require("dotenv");
dotenv.config({ path: `.env.${process.env.NODE_ENV}` });

function adminChecker(req, res, next) {
  const adminList = [process.env.ADMIN_ID, process.env.ADMIN_PP_ID];
  const cryptedAdminList = adminList.map((id) => {
    return sha256(id + process.env.SALT);
  });
  //Authorization header
  const secret = req.headers.secret;
  if (!secret) {
    return res.status(401).json({ error: "Unauthorized" });
  } else if (cryptedAdminList.includes(secret)) {
    next();
  }
}

module.exports = adminChecker;
