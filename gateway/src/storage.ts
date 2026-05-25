/**
 * Cloudflare R2 storage — S3-compatible client + helper functions.
 *
 * Each project gets a virtual "folder" inside the shared bucket, keyed by
 * its handle. Objects live at:
 *   <handle>/public/<key>        ← publicly readable via cdn.mnemedb.dev
 *   <handle>/private/<key>       ← only via presigned URL
 *
 * Quotas are tracked in Postgres (_mneme_storage_quotas). The free tier is
 * 100 MB per wallet; additional capacity is unlocked by burning $MNEME
 * (verified on-chain via base RPC) and extending the row's expires_at.
 */
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const R2_ACCOUNT_ID       = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID    = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET           = process.env.R2_BUCKET ?? "mneme-storage";
const R2_PUBLIC_BASE      = process.env.R2_PUBLIC_BASE ?? "https://cdn.mnemedb.dev";

// Storage routes are disabled (return 503) if config is missing — the rest
// of the gateway boots fine. Lets devs run the gateway without R2 for
// non-storage features.
const ENABLED = !!(R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY);

export const storageEnabled = (): boolean => ENABLED;

const s3 = ENABLED
  ? new S3Client({
      region: "auto",
      endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId:     R2_ACCESS_KEY_ID!,
        secretAccessKey: R2_SECRET_ACCESS_KEY!,
      },
    })
  : null;

// ─── Key helpers ──────────────────────────────────────────────────────────
const KEY_RX = /^[a-zA-Z0-9._\-/]{1,512}$/;

export function isValidStorageKey(key: string): boolean {
  if (!KEY_RX.test(key)) return false;
  if (key.startsWith("/") || key.includes("//") || key.includes("..")) return false;
  return true;
}

export function objectKey(handle: string, visibility: "public" | "private", key: string): string {
  return `${handle}/${visibility}/${key}`;
}

export function publicUrl(handle: string, key: string): string {
  return `${R2_PUBLIC_BASE}/${handle}/public/${key}`;
}

// ─── Operations ──────────────────────────────────────────────────────────
export interface UploadResult {
  key:       string;        // logical key (without handle/visibility prefix)
  fullKey:   string;        // <handle>/<visibility>/<key>
  size:      number;
  contentType: string;
  publicUrl?: string;       // only if visibility === "public"
}

export async function putObject(args: {
  handle:     string;
  key:        string;
  visibility: "public" | "private";
  body:       Uint8Array | Buffer;
  contentType?: string;
}): Promise<UploadResult> {
  if (!s3) throw new Error("R2 not configured");
  const fullKey = objectKey(args.handle, args.visibility, args.key);
  const contentType = args.contentType ?? "application/octet-stream";

  await s3.send(new PutObjectCommand({
    Bucket:      R2_BUCKET,
    Key:         fullKey,
    Body:        args.body,
    ContentType: contentType,
  }));

  return {
    key:         args.key,
    fullKey,
    size:        args.body.byteLength,
    contentType,
    publicUrl:   args.visibility === "public" ? publicUrl(args.handle, args.key) : undefined,
  };
}

export async function deleteObject(handle: string, visibility: "public" | "private", key: string): Promise<void> {
  if (!s3) throw new Error("R2 not configured");
  await s3.send(new DeleteObjectCommand({
    Bucket: R2_BUCKET,
    Key:    objectKey(handle, visibility, key),
  }));
}

export async function headObject(handle: string, visibility: "public" | "private", key: string): Promise<{ size: number; contentType: string } | null> {
  if (!s3) throw new Error("R2 not configured");
  try {
    const r = await s3.send(new HeadObjectCommand({
      Bucket: R2_BUCKET,
      Key:    objectKey(handle, visibility, key),
    }));
    return { size: r.ContentLength ?? 0, contentType: r.ContentType ?? "application/octet-stream" };
  } catch (e: unknown) {
    if ((e as { name?: string }).name === "NotFound") return null;
    throw e;
  }
}

export async function presignGet(handle: string, visibility: "public" | "private", key: string, expiresIn: number): Promise<string> {
  if (!s3) throw new Error("R2 not configured");
  const cmd = new GetObjectCommand({
    Bucket: R2_BUCKET,
    Key:    objectKey(handle, visibility, key),
  });
  return getSignedUrl(s3, cmd, { expiresIn });
}

export interface ListedObject {
  key:           string;       // logical key (without prefix)
  fullKey:       string;
  size:          number;
  lastModified?: Date;
  publicUrl?:    string;
}

export async function listObjects(handle: string, visibility: "public" | "private", prefix?: string): Promise<ListedObject[]> {
  if (!s3) throw new Error("R2 not configured");
  const fullPrefix = `${handle}/${visibility}/${prefix ?? ""}`;
  const r = await s3.send(new ListObjectsV2Command({
    Bucket: R2_BUCKET,
    Prefix: fullPrefix,
    MaxKeys: 1000,
  }));
  const objs = r.Contents ?? [];
  return objs.map((o) => {
    const fullKey = o.Key!;
    const logicalKey = fullKey.slice(`${handle}/${visibility}/`.length);
    return {
      key:          logicalKey,
      fullKey,
      size:         o.Size ?? 0,
      lastModified: o.LastModified,
      publicUrl:    visibility === "public" ? publicUrl(handle, logicalKey) : undefined,
    };
  });
}
