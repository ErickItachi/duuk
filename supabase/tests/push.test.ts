import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import {
  pushFailure,
  subscriptionOf,
  testDevicePush,
} from "../functions/_shared/push.ts";

const endpoint = "https://web.push.apple.com/fixture-device";
const keys = {
  auth: Buffer.alloc(16).toString("base64url"),
  p256dh: Buffer.alloc(65).toString("base64url"),
};

Deno.test(
  "subscription validation accepts Apple and rejects endpoint spoofing and invalid keys",
  () => {
    assert.deepEqual(subscriptionOf({ endpoint, keys }), { endpoint, keys });
    for (const url of [
      "http://web.push.apple.com/test",
      "https://web.push.apple.com.evil.example/test",
      "https://localhost/test",
      "https://user@web.push.apple.com/test",
      "https://web.push.apple.com:8443/test",
    ])
      assert.throws(() => subscriptionOf({ endpoint: url, keys }));
    assert.throws(() =>
      subscriptionOf({ endpoint, keys: { ...keys, auth: "bad-key" } }),
    );
  },
);

function fixture(allowed = true) {
  const rows = [
    { id: "own-phone", user_id: "owner", endpoint, keys },
    {
      id: "other-phone",
      user_id: "other",
      endpoint: endpoint + "-other",
      keys,
    },
  ];
  const rates: any[] = [];
  const db = {
    from(name: string) {
      assert.equal(name, "duuk_push_subscriptions");
      const filters: Record<string, unknown> = {};
      let remove = false;
      const matches = (r: any) =>
        Object.entries(filters).every(([k, v]) => r[k] === v);
      const builder = {
        select() {
          return builder;
        },
        delete() {
          remove = true;
          return builder;
        },
        eq(key: string, value: unknown) {
          filters[key] = value;
          return builder;
        },
        maybeSingle() {
          return Promise.resolve({
            data: rows.find(matches) || null,
            error: null,
          });
        },
        then(resolve: any, reject: any) {
          if (remove)
            for (let i = rows.length - 1; i >= 0; i--)
              if (matches(rows[i])) rows.splice(i, 1);
          return Promise.resolve({ data: null, error: null }).then(
            resolve,
            reject,
          );
        },
      };
      return builder;
    },
    rpc(name: string, args: any) {
      assert.equal(name, "duuk_action_limit");
      rates.push(args);
      return Promise.resolve({ data: allowed, error: null });
    },
  };
  return { db, rows, rates };
}

Deno.test(
  "device test cannot target another account or an unregistered endpoint",
  async () => {
    const f = fixture();
    let sends = 0;
    const send = async () => {
      sends++;
    };
    for (const target of [endpoint + "-other", endpoint + "-missing"])
      await assert.rejects(testDevicePush(f.db, "owner", target, {}, send), {
        status: 404,
      });
    assert.equal(sends, 0);
    assert.equal(f.rates.length, 0);
  },
);

Deno.test(
  "device test sends only to the selected registered device and enforces a rate limit",
  async () => {
    const f = fixture();
    const sends: any[] = [];
    assert.deepEqual(
      await testDevicePush(f.db, "owner", endpoint, {}, async (s, p) => {
        sends.push({ s, p });
      }),
      { accepted: true },
    );
    assert.equal(sends.length, 1);
    assert.equal(sends[0].s.id, "own-phone");
    assert.equal(sends[0].p.url, "/admin/configuracoes/notificacoes");
    assert.deepEqual(f.rates, [
      {
        actor: "owner",
        action_name: "push-test",
        maximum: 3,
        window_seconds: 300,
      },
    ]);
    const limited = fixture(false);
    await assert.rejects(
      testDevicePush(limited.db, "owner", endpoint, {}, async () => {
        throw Error("Must not send");
      }),
      { status: 429 },
    );
  },
);

Deno.test(
  "expired device is removed without deleting other devices; transport failures retain registration",
  async () => {
    const original = console.error;
    const logs: string[] = [];
    console.error = (v) => logs.push(v);
    try {
      for (const statusCode of [404, 410, 403, 500, undefined]) {
        const f = fixture();
        await assert.rejects(
          testDevicePush(f.db, "owner", endpoint, {}, async () => {
            throw { statusCode, body: "private-provider-body", endpoint };
          }),
          { status: [404, 410].includes(statusCode!) ? 410 : 502 },
        );
        assert.equal(
          f.rows.some((r) => r.id === "other-phone"),
          true,
        );
        assert.equal(
          f.rows.some((r) => r.id === "own-phone"),
          ![404, 410].includes(statusCode!),
        );
      }
      assert(!logs.join("").includes(endpoint));
      assert(!logs.join("").includes("private-provider-body"));
      assert.deepEqual(pushFailure(new Error("network")), {
        status: 0,
        expired: false,
      });
    } finally {
      console.error = original;
    }
  },
);
