import fs from "fs"
import fsp from "fs/promises"
import path from "path"
import crypto from "crypto"
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import { env } from "../config/env"

export interface StorageProvider {
  /** Persist a buffer, returning the storage key to save on the File row. */
  put(key: string, data: Buffer, contentType: string): Promise<void>
  /** Return bytes for direct streaming (local) or null if a redirect URL should be used instead. */
  getBuffer(key: string): Promise<Buffer | null>
  /** Return a time-limited URL the client can fetch/download directly, or null if not supported. */
  getSignedUrl(key: string, expiresInSeconds?: number): Promise<string | null>
  delete(key: string): Promise<void>
}

export function makeStorageKey(worldId: string, originalName: string): string {
  const ext = path.extname(originalName)
  return `${worldId}/${Date.now()}-${crypto.randomBytes(8).toString("hex")}${ext}`
}

class LocalStorageProvider implements StorageProvider {
  private root: string
  constructor(root: string) {
    this.root = path.resolve(root)
    fs.mkdirSync(this.root, { recursive: true })
  }

  private resolve(key: string) {
    const full = path.resolve(this.root, key)
    if (!full.startsWith(this.root)) throw new Error("Invalid storage key")
    return full
  }

  async put(key: string, data: Buffer): Promise<void> {
    const full = this.resolve(key)
    await fsp.mkdir(path.dirname(full), { recursive: true })
    await fsp.writeFile(full, data)
  }

  async getBuffer(key: string): Promise<Buffer | null> {
    try {
      return await fsp.readFile(this.resolve(key))
    } catch {
      return null
    }
  }

  async getSignedUrl(): Promise<string | null> {
    // Local dev has no separate object-storage host; files are streamed
    // through the API's own /files/:id/download route instead.
    return null
  }

  async delete(key: string): Promise<void> {
    try {
      await fsp.unlink(this.resolve(key))
    } catch {
      // already gone — fine
    }
  }
}

class S3StorageProvider implements StorageProvider {
  private client: S3Client
  private bucket: string

  constructor() {
    this.client = new S3Client({
      region: env.s3.region,
      endpoint: env.s3.endpoint || undefined,
      forcePathStyle: env.s3.forcePathStyle,
      credentials: env.s3.accessKeyId
        ? { accessKeyId: env.s3.accessKeyId, secretAccessKey: env.s3.secretAccessKey }
        : undefined,
    })
    this.bucket = env.s3.bucket
  }

  async put(key: string, data: Buffer, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: data, ContentType: contentType })
    )
  }

  async getBuffer(key: string): Promise<Buffer | null> {
    try {
      const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }))
      const stream = res.Body as NodeJS.ReadableStream
      const chunks: Buffer[] = []
      for await (const chunk of stream) chunks.push(Buffer.from(chunk))
      return Buffer.concat(chunks)
    } catch {
      return null
    }
  }

  async getSignedUrl(key: string, expiresInSeconds = 600): Promise<string | null> {
    const cmd = new GetObjectCommand({ Bucket: this.bucket, Key: key })
    return getSignedUrl(this.client, cmd, { expiresIn: expiresInSeconds })
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }))
  }
}

export const storage: StorageProvider =
  env.storageProvider === "s3" ? new S3StorageProvider() : new LocalStorageProvider(env.storageLocalDir)
