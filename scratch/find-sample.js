const fs = require("fs");
const content = fs.readFileSync("components/pages/DistribusiPage.jsx", "utf8");
const lines = content.split("\n");
let count = 0;
lines.forEach((line, i) => {
  if (line.toLowerCase().includes("sample")) {
    console.log(`${i + 1}: ${line.trim()}`);
    count++;
  }
});
console.log(`Found ${count} lines with "sample"`);
