import { Buffer, EventEmitter } from "../deps.ts";
import { DNSQuery } from "./query.ts";
import { IRecord } from "./records/types.ts";

export type RecordWithTTL = { record: IRecord; ttl?: number };
export type SavedRecord = {
  [name: string]: IRecord | IRecord[] | RecordWithTTL | RecordWithTTL[];
};

export type DNSServerEvents = {
  listen: [number];
  listenTcp: [number];
  clientError: [Error];
  error: [Error];
  close: [];
  closeTcp: [];
  query: [DNSQuery];
  uncaughtException: [Error];
};

export interface ListenOptions {
  port: number;
  tcpPort?: number;
  address?: string;
}

export class DNSServer extends EventEmitter<DNSServerEvents> {
  udpSocket?: Deno.DatagramConn;
  tcpSocket?: Deno.Listener;
  records: { [name: string]: RecordWithTTL[] } = {};

  constructor(records: SavedRecord = {}) {
    super();
    Object.entries(records).forEach(([name, rec]) => {
      if (Array.isArray(rec)) {
        rec.forEach((e: IRecord | RecordWithTTL) => this.register(name, e));
      } else {
        this.register(name, rec);
      }
    });

    this.on("query", async (query) => {
      try {
        if (this.records[query.name] !== undefined) {
          const res = this.records[query.name];
          res.forEach((e) => query.answer(e.record, e.ttl));
          await query.respond();
        }
      } catch (e) {
        this.emit("error", e);
      }
    });
  }

  register(name: string, record: IRecord | RecordWithTTL) {
    let records = this.records[name] ?? [];
    this.records[name] = records;
    if ((record as RecordWithTTL).record !== undefined) {
      records.push(record as RecordWithTTL);
    } else {
      records.push({ record: record as IRecord });
    }
    return this;
  }

  close() {
    this.udpSocket?.close();
  }

  closeTcp() {
    this.tcpSocket?.close();
  }

  async listen(options: ListenOptions) {
    await Promise.all([
      (async () => {
        if (this.udpSocket !== undefined) throw new Error("Already listening");
        this.udpSocket = Deno.listenDatagram({
          port: options.port,
          transport: "udp",
          hostname: options.address ?? "0.0.0.0",
        });

        this.emit("listen", options.port);
        try {
          for await (const [_buf, addr] of this.udpSocket) {
            await this._handleMessage({
              buf: new Buffer(_buf),
              addr,
              send: async (dns) => await this.sendUDP(dns),
            });
          }
        } catch (e) {
          this.emit("error", e);
        }

        this.emit("close");
      })(),
      (async () => {
        if (options.tcpPort !== undefined) {
          if (this.tcpSocket !== undefined)
            throw new Error("Already listening over TCP");
          this.tcpSocket = Deno.listen({
            port: options.tcpPort,
            hostname: options.address,
          });
          this.emit("listenTcp", options.tcpPort);

          try {
            for await (const conn of this.tcpSocket) {
              const buf = new Buffer(await Deno.readAll(conn));
              await this._handleMessage({
                buf,
                addr: conn.remoteAddr,
                send: async (dns) => await this.sendTCP(conn, dns),
              });
            }
          } catch (e) {
            this.emit("error", e);
          }

          this.emit("closeTcp");
        }
      })(),
    ]);
  }

  private async _handleMessage(d: {
    buf: Uint8Array;
    addr: Deno.Addr;
    send: (p: DNSQuery) => unknown;
  }) {
    const buffer = new Buffer(d.buf);
    let query: DNSQuery;

    try {
      query = DNSQuery.create(DNSQuery.parseRaw(buffer, d.addr));
    } catch (e) {
      this.emit("clientError", new Error(`Invalid DNS Datagram`));
      return;
    }

    if (query === undefined || query === null) {
      return;
    }

    query._respond = async function () {
      await d.send(query);
    };

    this.emit("query", query);
  }

  async sendUDP(res: DNSQuery) {
    if (!this.udpSocket) throw new Error("Not listening");

    const buf = this._preparePacket(res);
    if (!buf) return;

    await this.udpSocket.send(buf, res._client!);
    return this;
  }

  async sendTCP(conn: Deno.Conn, res: DNSQuery) {
    if (!this.tcpSocket) throw new Error("Not listening");

    console.log("TCP Send");
    const buf = this._preparePacket(res);
    if (!buf) return console.log("Sad");

    const bts = await conn.write(buf);
    console.log("Written TCP:", bts);
    return this;
  }

  private _preparePacket(res: DNSQuery) {
    try {
      res._flags.qr = 1;
      res.encode();
    } catch (e) {
      this.emit("uncaughtException", new Error("Unable to encode response"));
      return;
    }

    const buf = res._raw!;
    return buf;
  }
}
