import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
const html = await readFile(new URL("../examples/site.html", import.meta.url));
createServer((_request, response) => {
  response.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(html);
}).listen(4174, "127.0.0.1", () =>
  console.log(
    "Radar sample sites: http://localhost:4174 and http://127.0.0.1:4174",
  ),
);
