/**
 * Storage helpers — works with any S3-compatible service (AWS S3, Cloudflare R2)
 * Set AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_S3_BUCKET, AWS_S3_ENDPOINT in Railway
 * Falls back to no-op if storage is not configured (dev mode)
 */
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

function getS3Client(): S3Client | null {
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  const region = process.env.AWS_REGION || "auto";
  const endpoint = process.env.AWS_S3_ENDPOINT; // for R2: https://<accountid>.r2.cloudflarestorage.com

  if (!accessKeyId || !secretAccessKey) {
    console.warn("[Storage] AWS credentials not configured — storage disabled");
    return null;
  }

  const config: Record<string, any> = { region, credentials: { accessKeyId, secretAccessKey } };
  if (endpoint) config.endpoint = endpoint;
  return new S3Client(config);
}

function getBucket(): string {
  return process.env.AWS_S3_BUCKET || "mycareeriq";
}

function appendHashSuffix(relKey: string): string {
  const hash = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  const lastDot = relKey.lastIndexOf(".");
  if (lastDot === -1) return `${relKey}_${hash}`;
  return `${relKey.slice(0, lastDot)}_${hash}${relKey.slice(lastDot)}`;
}

export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream"
): Promise<{ key: string; url: string }> {
  const key = appendHashSuffix(relKey.replace(/^\/+/, ""));
  const s3 = getS3Client();

  if (!s3) {
    // Dev fallback — return a placeholder key
    console.warn("[Storage] Skipping upload — storage not configured");
    return { key, url: `/storage-unavailable/${key}` };
  }

  const body = typeof data === "string" ? Buffer.from(data) : data;
  await s3.send(new PutObjectCommand({
    Bucket: getBucket(),
    Key: key,
    Body: body as any,
    ContentType: contentType,
  }));

  return { key, url: `/api/storage/${key}` };
}

export async function storageGetSignedUrl(relKey: string): Promise<string> {
  const key = relKey.replace(/^\/+/, "");
  const s3 = getS3Client();

  if (!s3) return "";

  return getSignedUrl(s3, new GetObjectCommand({ Bucket: getBucket(), Key: key }), { expiresIn: 3600 });
}

export async function storageGet(relKey: string): Promise<{ key: string; url: string }> {
  const key = relKey.replace(/^\/+/, "");
  return { key, url: `/api/storage/${key}` };
}
