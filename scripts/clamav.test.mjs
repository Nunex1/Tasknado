import { afterEach, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { createServer } from "node:net";
import {
  parseVersion,
  scanBytes,
  scannerIdentity,
  scannerTarget,
  selfTest,
  testSignature,
} from "./clamav.mjs";

const servers = [];
afterEach(() => {
  for (const server of servers.splice(0)) server.close();
});

// A loopback stand-in for clamd. `answer` receives the command and the bytes
// of an INSTREAM body and returns the reply, or null to stay silent.
async function daemon(answer) {
  const server = createServer((socket) => {
    let buffer = Buffer.alloc(0);
    socket.on("error", () => {});
    socket.on("data", (data) => {
      buffer = Buffer.concat([buffer, data]);
      const end = buffer.indexOf(0);
      if (end < 0) return;
      const command = buffer.subarray(1, end).toString();
      let body = null;
      if (command === "INSTREAM") {
        const parts = [];
        let offset = end + 1;
        for (;;) {
          if (buffer.length < offset + 4) return;
          const length = buffer.readUInt32BE(offset);
          offset += 4;
          if (length === 0) break;
          if (buffer.length < offset + length) return;
          parts.push(buffer.subarray(offset, offset + length));
          offset += length;
        }
        body = Buffer.concat(parts);
      }
      const reply = answer(command, body);
      if (reply === null) return;
      if (reply === undefined) return socket.destroy();
      socket.end(reply);
    });
  });
  servers.push(server);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { host: "127.0.0.1", port: server.address().port, timeoutMs: 1500 };
}
const version = "ClamAV 1.5.4/28177/Sun Nov  8 06:23:52 2026";
const real = (command, body) =>
  command === "VERSION"
    ? version + "\0"
    : body.equals(testSignature())
      ? "stream: Eicar-Test-Signature FOUND\0"
      : "stream: OK\0";

describe("clamd adapter", () => {
  it("sends the exact standard test signature", () => {
    expect(createHash("sha256").update(testSignature()).digest("hex")).toBe(
      "275a021bbfb6489e54d471899f7db9d1663fc695ec2fe2a2c4538aabf651fd0f",
    );
  });

  it("returns a verdict only for explicit clamd answers", async () => {
    const target = await daemon(real);
    await expect(scanBytes(target, Buffer.from("notes"))).resolves.toBe(
      "clean",
    );
    await expect(scanBytes(target, testSignature())).resolves.toBe("infected");
    // Files larger than one protocol chunk arrive intact.
    const large = Buffer.alloc(200 * 1024, 7);
    let received;
    const echo = await daemon((command, body) => {
      received = body;
      return "stream: OK\0";
    });
    await scanBytes(echo, large);
    expect(received.equals(large)).toBe(true);
  });

  it("treats errors, silence, garbage and dropped connections as failures", async () => {
    const cases = [
      () => "stream: Can't allocate memory ERROR\0",
      () => "INSTREAM size limit exceeded. ERROR\0",
      () => "HTTP/1.1 200 OK\r\n\r\n",
      () => "stream: OK", // unterminated reply
      () => "OK\0",
      () => "\0",
      () => "x".repeat(8192) + "\0",
      () => undefined, // connection dropped
      () => null, // no answer before the timeout
    ];
    for (const answer of cases)
      await expect(
        scanBytes(await daemon(answer), Buffer.from("notes")),
      ).rejects.toThrow(/^scanner_/);
    await expect(
      scanBytes(
        { host: "127.0.0.1", port: 1, timeoutMs: 1500 },
        Buffer.from("x"),
      ),
    ).rejects.toThrow("scanner_unreachable");
  });

  it("refuses a service that approves the test signature", async () => {
    await expect(selfTest(await daemon(real))).resolves.toBeUndefined();
    const approvesEverything = await daemon((command) =>
      command === "VERSION" ? version + "\0" : "stream: OK\0",
    );
    await expect(selfTest(approvesEverything)).rejects.toThrow(
      "scanner_self_test_failed",
    );
    await expect(selfTest(await daemon(() => undefined))).rejects.toThrow(
      "scanner_self_test_failed",
    );
  });

  it("requires a ClamAV engine with recent signatures", async () => {
    const target = await daemon(real);
    const at = Date.UTC(2026, 10, 9, 6, 23, 52);
    await expect(
      scannerIdentity(target, { maxSignatureAgeHours: 72, now: at }),
    ).resolves.toEqual({
      engine: "1.5.4",
      signatures: 28177,
      signatureAgeHours: 24,
    });
    await expect(
      scannerIdentity(target, {
        maxSignatureAgeHours: 72,
        now: at + 73 * 3600000,
      }),
    ).rejects.toThrow("signatures_stale");
    // An engine without a loaded database reports no database fields.
    expect(() => parseVersion("ClamAV 1.5.4")).toThrow("scanner_not_clamav");
    expect(() => parseVersion("PONG")).toThrow("scanner_not_clamav");
    expect(() =>
      parseVersion("ClamAV 1.5.4/28177/Sun Xyz  8 06:23:52 2026"),
    ).toThrow("scanner_not_clamav");
    await expect(
      scannerIdentity(await daemon(() => "SSH-2.0-OpenSSH\0")),
    ).rejects.toThrow("scanner_not_clamav");
  });

  it("only accepts a remote daemon when the network is declared private", () => {
    expect(
      scannerTarget({ CLAMD_HOST: "127.0.0.1", CLAMD_PORT: "3310" }),
    ).toEqual({ host: "127.0.0.1", port: 3310, timeoutMs: 60000 });
    expect(
      scannerTarget({
        CLAMD_HOST: "clamav",
        CLAMD_PORT: "3310",
        CLAMD_TRUSTED_NETWORK: "yes",
        CLAMD_TIMEOUT_MS: "5000",
      }),
    ).toEqual({ host: "clamav", port: 3310, timeoutMs: 5000 });
    for (const env of [
      {},
      { CLAMD_HOST: "127.0.0.1" },
      { CLAMD_HOST: "127.0.0.1", CLAMD_PORT: "0" },
      { CLAMD_HOST: "127.0.0.1", CLAMD_PORT: "3310", CLAMD_TIMEOUT_MS: "1" },
    ])
      expect(() => scannerTarget(env)).toThrow("scanner_not_configured");
    expect(() =>
      scannerTarget({ CLAMD_HOST: "scanner.example", CLAMD_PORT: "3310" }),
    ).toThrow("scanner_network_not_trusted");
  });
});
