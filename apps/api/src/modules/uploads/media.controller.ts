import { Controller, Get, Header, Param, Query, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { Response } from 'express';
import { Public, SkipEnvelope } from '../../common/decorators';
import { bannerSvg, ICON_KEYS, productSvg } from './placeholder.svg';

const clamp = (s: string | undefined, max: number, fallback = '') => (s ?? fallback).slice(0, max);
const icon = (s?: string) => (s && ICON_KEYS.includes(s) ? s : 'generic');

/** Deterministic placeholder artwork used by the seed data and as a fallback when no image is uploaded. */
@ApiTags('Media')
@Controller('media')
export class MediaController {
  @Public()
  @SkipThrottle()
  @SkipEnvelope()
  @Get('product/:seed.svg')
  @Header('Content-Type', 'image/svg+xml; charset=utf-8')
  @Header('Cache-Control', 'public, max-age=31536000, immutable')
  @ApiOperation({ summary: 'Generated product placeholder (SVG)' })
  product(
    @Param('seed') seed: string,
    @Query() q: { t?: string; i?: string; v?: string; b?: string },
    @Res() res: Response,
  ) {
    res.send(
      productSvg({
        seed: clamp(seed, 80),
        title: clamp(q.t, 80, 'Product'),
        icon: icon(q.i),
        variant: Number(q.v) || 0,
        brand: q.b ? clamp(q.b, 30) : undefined,
      }),
    );
  }

  @Public()
  @SkipThrottle()
  @SkipEnvelope()
  @Get('banner/:seed.svg')
  @Header('Content-Type', 'image/svg+xml; charset=utf-8')
  @Header('Cache-Control', 'public, max-age=31536000, immutable')
  @ApiOperation({ summary: 'Generated banner artwork (SVG)' })
  banner(
    @Param('seed') seed: string,
    @Query() q: { t?: string; s?: string; c?: string; i?: string; w?: string; h?: string },
    @Res() res: Response,
  ) {
    res.send(
      bannerSvg({
        seed: clamp(seed, 80),
        title: clamp(q.t, 60, 'Glideinbir Kart'),
        subtitle: clamp(q.s, 120),
        cta: q.c ? clamp(q.c, 24) : undefined,
        icon: icon(q.i),
        width: Math.min(Math.max(Number(q.w) || 1600, 400), 2400),
        height: Math.min(Math.max(Number(q.h) || 560, 200), 1200),
      }),
    );
  }
}
