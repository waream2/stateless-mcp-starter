import { readConfig } from "./config.js";
import { createApp } from "./http/app.js";

const config = readConfig();
const app = createApp();

app.listen(config.port, config.host, () => {
  console.log(`stateless-mcp-starter listening on http://${config.host}:${config.port}`);
});
