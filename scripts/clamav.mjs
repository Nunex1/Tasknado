// ClamAV daemon (clamd) adapter for the trusted upload worker.
//
// Everything here fails closed. A file is clean only when a daemon that has
// just proved it detects the standard test signature answers "OK" for those
// exact bytes. Timeouts, closed connections, unknown replies, stale signatures
// and services that are not clamd are errors, never verdicts.
import { connect } from "node:net";

const LOOPBACK = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);
const MONTHS = "JanFebMarAprMayJunJulAugSepOctNovDec";
const CHUNK = 64 * 1024;

// The EICAR standard antivirus test string: harmless by design and detected
// by every engine. Assembled at run time so this source file is not itself
// quarantined by endpoint protection.
export const testSignature = () =>
  Buffer.from(
    [
      "X5O!P%@AP[4",
      String.fromCharCode(92),
      "PZX54(P^)7CC)7}$EICAR",
      "-STANDARD-ANTIVIRUS-",
      "TEST-FILE!$H+H*",
    ].join(""),
    "latin1",
  );

/**
 * clamd has no authentication or encryption, and the worker sends it private
 * file bytes. The daemon must therefore be on this host, unless the operator
 * states that the network path to it is private.
 */
export function scannerTarget(env) {
  const host = env.CLAMD_HOST;
  const port = Number(env.CLAMD_PORT);
  if (!host || !Number.isInteger(port) || port < 1 || port > 65535)
    throw Error("scanner_not_configured");
  if (!LOOPBACK.has(host) && env.CLAMD_TRUSTED_NETWORK !== "yes")
    throw Error("scanner_network_not_trusted");
  const timeout = Number(env.CLAMD_TIMEOUT_MS ?? 60000);
  if (!Number.isFinite(timeout) || timeout < 1000 || timeout > 600000)
    throw Error("scanner_not_configured");
  return { host: host.replace(/^\[|\]$/g, ""), port, timeoutMs: timeout };
}

// One command per connection: nothing is shared between two files.
function exchange(target, command, body) {
  return new Promise((resolve, reject) => {
    const socket = connect({ host: target.host, port: target.port });
    const chunks = [];
    let size = 0;
    let settled = false;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      if (error) reject(error);
      else resolve(value);
    };
    socket.setTimeout(target.timeoutMs, () => finish(Error("scanner_timeout")));
    socket.on("error", () => finish(Error("scanner_unreachable")));
    socket.on("data", (data) => {
      size += data.length;
      // Replies are one short line. Anything longer is not clamd.
      if (size > 4096) return finish(Error("scanner_protocol"));
      chunks.push(data);
      const reply = Buffer.concat(chunks);
      const end = reply.indexOf(0);
      if (end >= 0) finish(null, reply.subarray(0, end).toString("latin1"));
    });
    socket.on("close", () => finish(Error("scanner_protocol")));
    socket.on("connect", () => {
      socket.write(`z${command}\0`);
      if (!body) return;
      for (let offset = 0; offset < body.length; offset += CHUNK) {
        const part = body.subarray(offset, offset + CHUNK);
        const length = Buffer.alloc(4);
        length.writeUInt32BE(part.length);
        socket.write(length);
        socket.write(part);
      }
      socket.write(Buffer.alloc(4));
    });
  });
}

/** "ClamAV 1.5.4/28177/Sun Nov  8 06:23:52 2026" */
export function parseVersion(reply) {
  const match =
    /^ClamAV (\d+\.\d+\.\d+[\w.-]*)\/(\d+)\/\w{3} (\w{3}) +(\d{1,2}) (\d{2}):(\d{2}):(\d{2}) (\d{4})$/.exec(
      reply,
    );
  // Without the database fields the daemon has no signatures loaded.
  if (!match) throw Error("scanner_not_clamav");
  const month = MONTHS.indexOf(match[3]) / 3;
  if (!Number.isInteger(month)) throw Error("scanner_not_clamav");
  return {
    engine: match[1],
    signatures: Number(match[2]),
    signaturesAt: new Date(
      Date.UTC(+match[8], month, +match[4], +match[5], +match[6], +match[7]),
    ),
  };
}

export async function scannerIdentity(
  target,
  { maxSignatureAgeHours = 72, now = Date.now() } = {},
) {
  const version = parseVersion(await exchange(target, "VERSION"));
  const signatureAgeHours = Math.max(
    0,
    Math.round((now - version.signaturesAt.getTime()) / 3600000),
  );
  if (signatureAgeHours > maxSignatureAgeHours) throw Error("signatures_stale");
  return {
    engine: version.engine,
    signatures: version.signatures,
    signatureAgeHours,
  };
}

/** Resolves to "clean" or "infected"; every other outcome throws. */
export async function scanBytes(target, bytes) {
  const reply = await exchange(target, "INSTREAM", Buffer.from(bytes));
  if (reply === "stream: OK") return "clean";
  if (/^stream: \S.* FOUND$/.test(reply)) return "infected";
  throw Error("scanner_error");
}

/**
 * Proves detection end to end through the same socket the files use. A port
 * that answers "OK" to everything, or a daemon without signatures, fails here.
 */
export async function selfTest(target) {
  let verdict;
  try {
    verdict = await scanBytes(target, testSignature());
  } catch {
    throw Error("scanner_self_test_failed");
  }
  if (verdict !== "infected") throw Error("scanner_self_test_failed");
}
