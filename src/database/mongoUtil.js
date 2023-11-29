const Mongoclient = require("mongodb").MongoClient;
const dotenv = require("dotenv");
dotenv.config({ path: `.env.${process.env.NODE_ENV}` });

var CONNECTION_STRING = process.env.MONGO_CONNECTION_STRING;
var DATABASE_NAME = "photopacerdb";
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
