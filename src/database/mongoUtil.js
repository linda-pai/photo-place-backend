const Mongoclient = require("mongodb").MongoClient;
const dotenv = require("dotenv");
dotenv.config();

var CONNECTION_STRING = process.env.MONGO_CONNECTION_STRING;
var DATABASE_NAME = "productlistdb";
var database;

module.exports = {
  connectToServer: function (callback) {
    Mongoclient.connect(CONNECTION_STRING, (err, client) => {
      database = client.db(DATABASE_NAME);
      return callback(err);
    });
  },

  getDb: function () {
    return database;
  },
};
