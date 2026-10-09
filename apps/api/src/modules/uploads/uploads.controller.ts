import { Body, Controller, HttpCode, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';
import { CurrentUser } from '../../common/decorators';
import { badRequest, forbidden } from '../../common/errors';
import { ZBody } from '../../common/pipes/zod-validation.pipe';
import type { AuthUser } from '../../common/types';
import { detectMime, StorageService, UPLOAD_FOLDERS, type UploadFolder } from './storage.service';

const folderSchema = z.object({ folder: z.enum(UPLOAD_FOLDERS).default('misc') });
const MAX_BYTES = 5 * 1024 * 1024;

/** Which roles may write to which folder. */
function assertFolderAccess(user: AuthUser, folder: UploadFolder): void {
  const staff = user.role === 'ADMIN' || user.role === 'SUPER_ADMIN';
  if (['banners', 'categories', 'brands'].includes(folder) && !staff)
    throw forbidden('Only admins can upload to this folder');
  if (['products'].includes(folder) && user.role !== 'SELLER' && !staff)
    throw forbidden('Only sellers can upload product media');
  if (folder === 'kyc' && user.role !== 'SELLER' && !staff)
    throw forbidden('Only sellers can upload KYC documents');
}

@ApiTags('Uploads')
@ApiBearerAuth()
@Controller('uploads')
export class UploadsController {
  constructor(private readonly storage: StorageService) {}

  @Post()
  @HttpCode(201)
  @Throttle({ default: { limit: 40, ttl: 60_000 } })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_BYTES, files: 1 } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: { type: 'string', format: 'binary' },
        folder: { type: 'string', enum: [...UPLOAD_FOLDERS] },
      },
    },
  })
  @ApiOperation({ summary: 'Upload an image (jpg/png/webp/gif ≤ 5 MB) or a PDF (KYC only)' })
  async upload(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body('folder') folderRaw?: string,
  ) {
    if (!file) throw badRequest('FILE_REQUIRED', 'Attach a file in the "file" field');
    const folder = folderSchema.parse({ folder: folderRaw || undefined }).folder;
    assertFolderAccess(user, folder);

    const mime = detectMime(file.buffer);
    if (!mime)
      throw badRequest('UNSUPPORTED_FILE', 'Only JPG, PNG, WebP, GIF or PDF files are allowed');
    if (mime === 'application/pdf' && folder !== 'kyc')
      throw badRequest('UNSUPPORTED_FILE', 'PDF uploads are only allowed for KYC documents');
    return this.storage.upload(file.buffer, folder, mime);
  }

  @Post('sign')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Get signed params for a direct-to-Cloudinary upload (falls back to the local upload URL)',
  })
  sign(@CurrentUser() user: AuthUser, @ZBody(folderSchema) body: { folder: UploadFolder }) {
    assertFolderAccess(user, body.folder);
    return this.storage.sign(body.folder);
  }
}
