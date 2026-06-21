const fs = require("node:fs");
const path = require("node:path");

const source = path.join(__dirname, "..", "src", "db", "schema.sql");
const target = path.join(__dirname, "..", "dist", "db", "schema.sql");

fs.mkdirSync(path.dirname(target), { recursive: true });
fs.copyFileSync(source, target);
console.log(`Copied ${path.relative(process.cwd(), source)} to ${path.relative(process.cwd(), target)}`);
