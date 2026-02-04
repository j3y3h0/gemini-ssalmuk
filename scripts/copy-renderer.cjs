const fs = require("fs");
const path = require("path");
const src = path.join(process.cwd(), "renderer");
const dest = path.join(process.cwd(), "dist", "renderer");
fs.mkdirSync(dest, { recursive: true });
["index.html", "styles.css"].forEach((f) => {
  fs.copyFileSync(path.join(src, f), path.join(dest, f));
});
