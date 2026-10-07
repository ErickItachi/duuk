import { Buffer } from "node:buffer";
import { Duplex } from "node:stream";
import tls from "node:tls";

// Supabase's Node TLS shim closes this GoDaddy connection on its first write.
// Keep ImapFlow's parser and commands, using Deno's certificate-verified TLS I/O.
export class NativeImapSocket extends Duplex {
  encrypted = true;
  authorized = false;
  connection;
  reading = false;
  timer;
  timeout = 0;
  constructor(connector = (options) => Deno.connectTls(options)) {
    super();
    this.connector = connector;
  }
  _construct(callback) {
    let expired = false;
    const pending = this.connector({
      hostname: "imap.secureserver.net",
      port: 993,
    });
    const timer = setTimeout(() => {
      expired = true;
      callback(
        Object.assign(new Error("IMAP TLS connection timed out"), {
          code: "CONNECT_TIMEOUT",
        }),
      );
    }, 15000);
    pending.then(
      (connection) => {
        clearTimeout(timer);
        if (expired || this.destroyed) {
          connection.close();
          if (!expired) callback();
          return;
        }
        this.connection = connection;
        this.authorized = true;
        callback();
        this.emit("connect");
        this.emit("secureConnect");
      },
      (error) => {
        clearTimeout(timer);
        if (!expired) callback(error);
      },
    );
  }
  _read() {
    if (this.reading || !this.connection || this.destroyed) return;
    this.reading = true;
    const buffer = new Uint8Array(64 * 1024);
    this.connection.read(buffer).then(
      (length) => {
        this.reading = false;
        if (this.destroyed) return;
        this.activity();
        if (length === null) this.push(null);
        else if (this.push(Buffer.from(buffer.subarray(0, length))))
          this._read();
      },
      (error) => {
        this.reading = false;
        if (!this.destroyed) this.destroy(error);
      },
    );
  }
  _write(chunk, _encoding, callback) {
    const write = async () => {
      if (!this.connection || this.destroyed)
        throw new Error("IMAP TLS connection is closed");
      let offset = 0;
      while (offset < chunk.length) {
        const written = await this.connection.write(chunk.subarray(offset));
        if (!written) throw new Error("IMAP TLS write did not progress");
        offset += written;
        this.activity();
      }
    };
    write().then(() => callback(), callback);
  }
  _destroy(error, callback) {
    clearTimeout(this.timer);
    try {
      this.connection?.close();
    } catch {
      /* already closed */
    }
    callback(error);
  }
  setTimeout(milliseconds, callback) {
    this.timeout = milliseconds;
    if (callback) this.once("timeout", callback);
    this.activity();
    return this;
  }
  activity() {
    clearTimeout(this.timer);
    if (this.timeout && !this.destroyed)
      this.timer = setTimeout(() => this.emit("timeout"), this.timeout);
  }
  setKeepAlive() {
    return this;
  }
  setNoDelay() {
    return this;
  }
  ref() {
    return this;
  }
  unref() {
    return this;
  }
  getCipher() {
    return null;
  }
}

export function nativeImapTransport(
  client,
  makeSocket = () => new NativeImapSocket(),
) {
  const connect = client.connect.bind(client);
  client.connect = () => {
    if (client.options?.proxy || client.options?.secure === false)
      throw new Error("IMAP transport requires implicit TLS without a proxy");
    const original = tls.connect;
    // ImapFlow 2.2.6 creates its socket synchronously before its first await when
    // no proxy is configured. Restore the factory in the same JS turn, before
    // awaiting anything: concurrent SMTP/IMAP calls retain their own transport.
    tls.connect = (options, callback) => {
      if (
        options.host !== "imap.secureserver.net" ||
        options.port !== 993 ||
        options.rejectUnauthorized === false ||
        options.socket
      ) {
        throw new Error("Unsupported IMAP transport options");
      }
      const socket = makeSocket();
      if (callback) socket.once("secureConnect", callback);
      return socket;
    };
    try {
      return connect();
    } finally {
      tls.connect = original;
    }
  };
  return client;
}
