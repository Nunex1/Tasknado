// Encrypted backup of the private attachment bytes. Supabase database backups
// do not contain Storage objects, so they need their own copy.
//
//   node scripts/backup-storage.mjs keygen  <key-file>
//   node scripts/backup-storage.mjs export          (reads the project)
//   node scripts/backup-storage.mjs verify          (offline, reads the backup)
//   node scripts/backup-storage.mjs restore         (writes missing objects only)
//   node scripts/backup-storage.mjs seal <in> <out> (encrypt any file, e.g. a database dump)
//   node scripts/backup-storage.mjs open <in> <out>
//
// Environment: BACKUP_DIR and BACKUP_KEY_FILE for every command except keygen;
// SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and an identical TASKNADO_WORKER_TARGET
// for export and restore. Run only on a trusted backend.
//
// Everything written is AES-256-GCM. Object files are named by a keyed hash,
// and the manifest with paths, sizes and SHA-256 digests is encrypted too, so a
// stolen backup reveals neither content nor account identifiers. The key file
// is the secret: keep it apart from the backup, and keep a second copy, because
// without it the backup cannot be read by anyone.
import { createClient } from "@supabase/supabase-js";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
} from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";

const MAGIC = Buffer.from("TNB1");
const MANIFEST = "manifest.enc";
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

/** MAGIC | iv(12) | ciphertext | tag(16). `context` binds the blob to its role. */
export function seal(key, bytes, context) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv, {
    authTagLength: 16,
  });
  cipher.setAAD(Buffer.from(context));
  const body = Buffer.concat([cipher.update(bytes), cipher.final()]);
  return Buffer.concat([MAGIC, iv, body, cipher.getAuthTag()]);
}

/** Throws unless the blob is intact and was sealed with this key and context. */
export function open(key, blob, context) {
  if (blob.length < 32 || !blob.subarray(0, 4).equals(MAGIC))
    throw Error("backup_format");
  // A fixed tag length: a truncated tag is never accepted.
  const decipher = createDecipheriv("aes-256-gcm", key, blob.subarray(4, 16), {
    authTagLength: 16,
  });
  decipher.setAAD(Buffer.from(context));
  decipher.setAuthTag(blob.subarray(blob.length - 16));
  try {
    return Buffer.concat([
      decipher.update(blob.subarray(16, blob.length - 16)),
      decipher.final(),
    ]);
  } catch {
    throw Error("backup_corrupt_or_wrong_key");
  }
}

export function loadKey(file) {
  const text = readFileSync(file, "utf8").trim();
  if (!/^[0-9a-f]{64}$/.test(text)) throw Error("backup_key_invalid");
  return Buffer.from(text, "hex");
}

// Keyed, so file names cannot be matched against known account identifiers.
const fileName = (key, path) =>
  createHmac("sha256", key).update(path).digest("hex") + ".bin";

function settings(needsProject) {
  const { BACKUP_DIR, BACKUP_KEY_FILE } = process.env;
  if (!BACKUP_DIR || !isAbsolute(BACKUP_DIR) || !BACKUP_KEY_FILE)
    throw Error("Set an absolute BACKUP_DIR and BACKUP_KEY_FILE");
  const result = { dir: BACKUP_DIR, key: loadKey(BACKUP_KEY_FILE) };
  if (!needsProject) return result;
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, TASKNADO_WORKER_TARGET } =
    process.env;
  if (
    !SUPABASE_URL ||
    !SUPABASE_SERVICE_ROLE_KEY ||
    SUPABASE_URL !== TASKNADO_WORKER_TARGET
  )
    throw Error("Set server credentials and an exact TASKNADO_WORKER_TARGET");
  const url = new URL(SUPABASE_URL);
  if (
    url.protocol !== "https:" &&
    !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)
  )
    throw Error("HTTPS required");
  result.db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return result;
}
const missing = (error) =>
  Number(error?.status ?? error?.statusCode) === 404 ||
  /not.?found/i.test(String(error?.message ?? ""));
const report = (fields) => console.log(JSON.stringify(fields));

async function exportObjects() {
  const { dir, key, db } = settings(true);
  mkdirSync(dir, { recursive: true });
  if (readdirSync(dir).length)
    throw Error("BACKUP_DIR must be empty: one directory per backup");
  const objects = [];
  let absent = 0,
    failed = 0;
  for (let from = 0; ; from += 1000) {
    const page = await db
      .from("attachments")
      .select("path,size")
      .order("path")
      .range(from, from + 999);
    if (page.error) throw Error("attachment_list_unavailable");
    for (const row of page.data) {
      const object = await db.storage.from("attachments").download(row.path);
      if (object.error || !object.data) {
        // A reservation whose upload never completed has no bytes to copy.
        if (missing(object.error)) absent++;
        else failed++;
        continue;
      }
      const bytes = Buffer.from(await object.data.arrayBuffer());
      const file = fileName(key, row.path);
      writeFileSync(join(dir, file), seal(key, bytes, row.path), {
        mode: 0o600,
      });
      objects.push({
        path: row.path,
        file,
        size: bytes.length,
        sha256: sha256(bytes),
      });
    }
    if (page.data.length < 1000) break;
  }
  const manifest = {
    version: 1,
    created_at: new Date().toISOString(),
    objects,
  };
  writeFileSync(
    join(dir, MANIFEST),
    seal(key, Buffer.from(JSON.stringify(manifest)), "manifest"),
    { mode: 0o600 },
  );
  report({
    event: "storage_backup",
    objects: objects.length,
    bytes: objects.reduce((sum, item) => sum + item.size, 0),
    absent,
    failed,
  });
  // An incomplete copy must not look like a successful backup.
  if (failed) process.exitCode = 1;
}

function readManifest(dir, key) {
  const manifest = JSON.parse(
    open(key, readFileSync(join(dir, MANIFEST)), "manifest").toString("utf8"),
  );
  if (manifest.version !== 1 || !Array.isArray(manifest.objects))
    throw Error("backup_format");
  return manifest;
}
// Decrypts one object and checks it against the manifest; null when damaged.
function readObject(dir, key, item) {
  try {
    const bytes = open(key, readFileSync(join(dir, item.file)), item.path);
    return bytes.length === item.size && sha256(bytes) === item.sha256
      ? bytes
      : null;
  } catch {
    return null;
  }
}

function verify() {
  const { dir, key } = settings(false);
  const manifest = readManifest(dir, key);
  let damaged = 0;
  for (const item of manifest.objects)
    if (!readObject(dir, key, item)) damaged++;
  report({
    event: "storage_backup_verify",
    created_at: manifest.created_at,
    objects: manifest.objects.length,
    damaged,
  });
  if (damaged) process.exitCode = 1;
}

// Never overwrites or deletes: an object that already exists is left as it is
// and counted. Restoring twice is harmless.
async function restore() {
  const { dir, key, db } = settings(true);
  const manifest = readManifest(dir, key);
  let restored = 0,
    existing = 0,
    failed = 0;
  for (const item of manifest.objects) {
    const bytes = readObject(dir, key, item);
    if (!bytes) {
      failed++;
      continue;
    }
    const uploaded = await db.storage
      .from("attachments")
      .upload(item.path, bytes, { upsert: false });
    if (!uploaded.error) restored++;
    else if (/exists|duplicate/i.test(String(uploaded.error.message)))
      existing++;
    else failed++;
  }
  report({
    event: "storage_backup_restore",
    objects: manifest.objects.length,
    restored,
    existing,
    failed,
  });
  if (failed) process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [command, input, output] = process.argv.slice(2);
  if (command === "keygen") {
    if (!input || existsSync(input)) throw Error("Choose a new key file path");
    writeFileSync(input, randomBytes(32).toString("hex") + "\n", {
      mode: 0o600,
      flag: "wx",
    });
    report({ event: "backup_key_created" });
  } else if (command === "export") await exportObjects();
  else if (command === "verify") verify();
  else if (command === "restore") await restore();
  else if ((command === "seal" || command === "open") && input && output) {
    const key = loadKey(process.env.BACKUP_KEY_FILE ?? "");
    const transform = command === "seal" ? seal : open;
    writeFileSync(output, transform(key, readFileSync(input), "file"), {
      mode: 0o600,
      flag: "wx",
    });
    report({ event: `backup_file_${command}ed` });
  } else {
    console.error(
      "Usage: backup-storage.mjs keygen <file> | export | verify | restore | seal <in> <out> | open <in> <out>",
    );
    process.exitCode = 1;
  }
}
