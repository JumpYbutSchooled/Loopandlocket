// Runs before every functions deploy (firebase.json "predeploy") so checkout charges the same
// prices the site shows. Edit public/products.json, never functions/products.json.
const fs = require("fs");
const path = require("path");

fs.copyFileSync(
  path.join(__dirname, "..", "public", "products.json"),
  path.join(__dirname, "products.json"),
);
console.log("Copied public/products.json into functions/");
