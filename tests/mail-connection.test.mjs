import test from 'node:test';
import assert from 'node:assert/strict';
import { once, EventEmitter } from 'node:events';
import tls from 'node:tls';
import { NativeImapSocket, nativeImapTransport } from '../supabase/functions/_shared/imap-transport.mjs';
import { mailFailure } from '../supabase/functions/_shared/mail-failure.mjs';

function connection(chunks = []) {
  const writes = [];
  let release;
  let closed = 0;
  return {
    writes, get closed() { return closed; },
    read(buffer) {
      if (chunks.length) { const chunk = chunks.shift(); buffer.set(chunk); return Promise.resolve(chunk.length); }
      return new Promise(resolve => { release = resolve; });
    },
    async write(buffer) { const size = Math.min(3, buffer.length); writes.push(Buffer.from(buffer.subarray(0, size))); return size; },
    close() { closed++; release?.(null); },
  };
}

test('IMAP transport preserves binary reads and partial writes and closes the TLS connection', async () => {
  const incoming = Buffer.from('Olá\r\n\0', 'utf8');
  const remote = connection([incoming]);
  const socket = new NativeImapSocket(async options => {
    assert.deepEqual(options, {hostname:'imap.secureserver.net',port:993});
    return remote;
  });
  await once(socket, 'secureConnect');
  assert(socket.authorized && socket.encrypted);
  const [received] = await once(socket, 'data');
  assert.deepEqual(received, incoming);
  const outgoing = Buffer.from('A1 SEARCH "produção"\r\n\0', 'utf8');
  await new Promise((resolve, reject) => socket.write(outgoing, error => error ? reject(error) : resolve()));
  assert.deepEqual(Buffer.concat(remote.writes), outgoing);
  const closed = once(socket, 'close'); socket.destroy(); await closed;
  assert.equal(remote.closed, 1);
});

test('IMAP inactivity emits a timeout and socket destruction releases pending reads', async () => {
  const remote = connection();
  const socket = new NativeImapSocket(async () => remote);
  await once(socket, 'secureConnect');
  socket.resume(); socket.setTimeout(15);
  await once(socket, 'timeout');
  const closed = once(socket, 'close');socket.destroy();await closed;
  assert.equal(remote.closed, 1);
});

test('IMAP connection failure does not mark an unverified socket as authorized', async () => {
  const socket = new NativeImapSocket(async () => { throw new Error('TLS certificate rejected'); });
  const [error] = await once(socket, 'error');
  assert.equal(error.message, 'TLS certificate rejected');
  assert.equal(socket.authorized, false);
});

test('TLS factory is restored before awaiting either concurrent IMAP connection', async () => {
  const original = tls.connect;
  const create = () => {
    const socket = new EventEmitter();
    const engine = { options:{secure:true}, connect() {
      assert.equal(tls.connect({host:'imap.secureserver.net',port:993}),socket);
      return new Promise(resolve => setTimeout(resolve, 5));
    }};
    return nativeImapTransport(engine, () => socket);
  };
  const first=create().connect();assert.equal(tls.connect,original);
  const second=create().connect();assert.equal(tls.connect,original);
  await Promise.all([first,second]);assert.equal(tls.connect,original);
});

test('IMAP rejects arbitrary hosts, disabled certificate checks and proxy setup, restoring TLS after errors', () => {
  const original=tls.connect;
  for(const options of [{host:'attacker.invalid',port:993},{host:'imap.secureserver.net',port:25},{host:'imap.secureserver.net',port:993,rejectUnauthorized:false}]) {
    const client=nativeImapTransport({connect(){return tls.connect(options);}});
    assert.throws(()=>client.connect(),/Unsupported/);assert.equal(tls.connect,original);
  }
  const client=nativeImapTransport({options:{proxy:'http://attacker.invalid'},connect(){throw Error('should not connect');}});
  assert.throws(()=>client.connect(),/requires implicit TLS/);assert.equal(tls.connect,original);
});

test('mail failures distinguish authentication from transport failures without exposing provider error data', () => {
  const privateValue='test-only-private-value';
  const auth=mailFailure({authenticationFailed:true,message:privateValue,code:privateValue},'imap');
  assert.equal(auth.status,422);assert.equal(auth.kind,'authentication');assert.equal(auth.code,'other');
  const smtp=mailFailure({code:'EAUTH',message:privateValue},'smtp');assert.equal(smtp.status,422);assert.match(smtp.message,/envio/);
  const network=mailFailure({code:'ClosedAfterConnectTLS',message:privateValue},'imap');assert.equal(network.status,502);assert.equal(network.kind,'connection');
  assert(!JSON.stringify([auth,smtp,network]).includes(privateValue));
});
