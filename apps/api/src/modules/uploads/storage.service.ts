import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { UploadResult, UploadSignature } from '@gk/types';
import type { AppConfig } from '../../config/config.types';

export const UPLOAD_FOLDERS = [
  'products',
  'reviews',
  'returns',
  'kyc',
  'banners',
  'avatars',
  'categories',
  'brands',
  'misc',
] as const;
export type UploadFolder = (typeof UPLOAD_FOLDERS)[number];

const MIME_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'application/pdf': 'pdf',
};

/** Content sniffing — never trust the client supplied mimetype alone. */
export function detectMime(buf: Buffer): string | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])))
    return 'image/png';
  if (buf.subarray(0, 4).toString('ascii') === 'GIF8') return 'image/gif';
  if (
    buf.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buf.subarray(8, 12).toString('ascii') === 'WEBP'
  )
    return 'image/webp';
  if (buf.subarray(0, 4).toString('ascii') === '%PDF') return 'application/pdf';
  return null;
}

/**
 * Media storage. Cloudinary when credentials are present (free tier),
 * otherwise the local disk under `./uploads` served at `/uploads`.
 */
@Injectable()
export class StorageService {
  private readonly log = new Logger(StorageService.name);
  readonly cloudinaryEnabled: boolean;
  readonly localDir = resolve(process.cwd(), 'uploads');
  private readonly publicUrl: string;
  private readonly cloudName?: string;
  private readonly apiKey?: string;
  private readonly apiSecret?: string;

  constructor(@Inject(ConfigService) config: AppConfig) {
    this.cloudName = config.get('CLOUDINARY_CLOUD_NAME', { infer: true });
    this.apiKey = config.get('CLOUDINARY_API_KEY', { infer: true });
    this.apiSecret = config.get('CLOUDINARY_API_SECRET', { infer: true });
    this.publicUrl = config.get('API_PUBLIC_URL', { infer: true }).replace(/\/$/, '');
    this.cloudinaryEnabled = Boolean(this.cloudName && this.apiKey && this.apiSecret);
    if (this.cloudinaryEnabled) {
      cloudinary.config({
        cloud_name: this.cloudName,
        api_key: this.apiKey,
        api_secret: this.apiSecret,
        secure: true,
      });
      this.log.log('Media storage: Cloudinary');
    } else {
      this.log.log(`Media storage: local disk (${this.localDir})`);
    }
  }

  extFor(mime: string): string {
    return MIME_EXT[mime] ?? 'bin';
  }

  async upload(buffer: Buffer, folder: UploadFolder, mime: string): Promise<UploadResult> {
    if (this.cloudinaryEnabled) {
      return new Promise<UploadResult>((resolvePromise, reject) => {
        cloudinary.uploader
          .upload_stream(
            {
              folder: `glideinbir-kart/${folder}`,
              resource_type: mime === 'application/pdf' ? 'raw' : 'image',
            },
            (err, result) => {
              if (err || !result) return reject(err ?? new Error('Cloudinary upload failed'));
              resolvePromise({
                url: result.secure_url,
                publicId: result.public_id,
                width: result.width,
                height: result.height,
                bytes: result.bytes,
              });
            },
          )
          .end(buffer);
      });
    }
    const dir = join(this.localDir, folder);
    await mkdir(dir, { recursive: true });
    const name = `${randomUUID()}.${this.extFor(mime)}`;
    await writeFile(join(dir, name), buffer);
    return { url: `${this.publicUrl}/uploads/${folder}/${name}`, bytes: buffer.length };
  }

  /** Signed params so the browser can upload straight to Cloudinary (no file passes through the API). */
  sign(folder: UploadFolder): UploadSignature {
    if (!this.cloudinaryEnabled) {
      return { provider: 'local', uploadUrl: `${this.publicUrl}/api/v1/uploads` };
    }
    const timestamp = Math.round(Date.now() / 1000);
    const params = { folder: `glideinbir-kart/${folder}`, timestamp };
    const signature = cloudinary.utils.api_sign_request(params, this.apiSecret as string);
    return {
      provider: 'cloudinary',
      uploadUrl: `https://api.cloudinary.com/v1_1/${this.cloudName}/auto/upload`,
      params: { ...params, signature, api_key: this.apiKey as string },
    };
  }
}
