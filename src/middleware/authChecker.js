const { sha256 } = require("js-sha256");

const dotenv = require("dotenv");
dotenv.config({ path: `.env.${process.env.NODE_ENV}` });

function authChecker(req, res, next) {
  //Authorization header
  const authorization = req.headers.authorization;
  const secret = req.headers.secret;

  const token = authorization?.split(" ")[1];
  if (!token) {
    return res.status(401).json({ error: "Unauthorized" });
  } else if (secret === sha256(token + process.env.SALT)) {
    next();
  } else {
    return res.status(401).json({ error: "Unauthorized" });
  }
}

module.exports = authChecker;
