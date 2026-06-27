import { readFileSync, writeFileSync, unlinkSync } from "fs";

const css = readFileSync("src/panel/panel.styles.tmp.css", "utf8");
writeFileSync("src/panel/panel.styles.ts", `export default ${JSON.stringify(css)};`);
unlinkSync("src/panel/panel.styles.tmp.css");
