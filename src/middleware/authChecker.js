function authChecker(req, res, next) {
  //Authorization header
  const authorization = req.headers.authorization;
  const token = authorization?.split(" ")[1];
  if (!token) {
    return res.status(401).json({ error: "Unauthorized" });
  } else {
    next();
  }
}

module.exports = authChecker;
