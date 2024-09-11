import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { config } from '../config.js';

export const s3 = new S3Client({
  endpoint: config.S3_ENDPOINT,
  region: config.S3_REGION,
  forcePathStyle: config.S3_FORCE_PATH_STYLE,
  credentials: {
    accessKeyId: config.S3_ACCESS_KEY,
    secretAccessKey: config.S3_SECRET_KEY,
  },
});

export async function putObject(key: string, body: Buffer, contentType: string) {
  await s3.send(
    new PutObjectCommand({
      Bucket: config.S3_BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
}

export async function getObject(key: string) {
  const res = await s3.send(new GetObjectCommand({ Bucket: config.S3_BUCKET, Key: key }));
  return {
    body: res.Body,
    contentType: res.ContentType ?? 'application/octet-stream',
    contentLength: res.ContentLength,
    lastModified: res.LastModified,
  };
}

export async function deleteObject(key: string) {
  await s3.send(new DeleteObjectCommand({ Bucket: config.S3_BUCKET, Key: key }));
}

export async function ensureBucket() {
  try {
    await s3.send(new HeadBucketCommand({ Bucket: config.S3_BUCKET }));
  } catch {
    await s3.send(new CreateBucketCommand({ Bucket: config.S3_BUCKET }));
  }
}

export function imageUrl(key: string): string {
  return `${config.PUBLIC_API_URL}/images/${key}`;
}
