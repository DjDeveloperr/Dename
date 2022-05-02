import { DNSServer, ARecord, NSRecord } from "./mod.ts";

const server = new DNSServer({
  "domain.yz": [new ARecord("0.0.0.1"), new NSRecord("0.0.0.2")]
});

server.on("listen", () => {
  console.log("Listening ~");
});

server.listen({ port: 6969 });