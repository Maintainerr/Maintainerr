import { OverlayRenderOptions, OverlayResult } from '@maintainerr/contracts';
import { Injectable } from '@nestjs/common';
import {
    Canvas,
    CanvasRenderingContext2D,
    createCanvas,
    registerFont,
} from 'canvas';
import * as fs from 'fs';
import * as path from 'path';
import sharp from 'sharp';
import { MaintainerrLogger } from '../logging/logs.service';

@Injectable()
export class OverlayRenderService {
  private registeredFonts = new Map<string, string>();

  constructor(private readonly logger: MaintainerrLogger) {
    this.logger.setContext(OverlayRenderService.name);
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  private toFraction(v: number): number {
    return Math.max(0, v) / 100.0;
  }

  private parseColor(hex: string): string {
    const t = hex.trim();
    if (/^#[0-9A-Fa-f]{8}$/.test(t)) {
      const r = parseInt(t.slice(1, 3), 16);
      const g = parseInt(t.slice(3, 5), 16);
      const b = parseInt(t.slice(5, 7), 16);
      const a = parseInt(t.slice(7, 9), 16) / 255;
      return `rgba(${r},${g},${b},${a.toFixed(3)})`;
    }
    return t;
  }

  private isTransparent(color: string): boolean {
    const c = color.trim().toLowerCase();
    return c === 'none' || c === 'transparent' || c === 'rgba(0,0,0,0)';
  }

  private getFontFamily(fontPath: string): string {
    if (this.registeredFonts.has(fontPath)) {
      return this.registeredFonts.get(fontPath)!;
    }
    if (fs.existsSync(fontPath)) {
      const family = path.basename(fontPath, path.extname(fontPath));
      try {
        registerFont(fontPath, { family });
        this.registeredFonts.set(fontPath, family);
        return family;
      } catch (err) {
        this.logger.warn(`Failed to register font at ${fontPath}`);
        this.logger.debug(err);
      }
    } else {
      this.logger.warn(`Font file not found: ${fontPath}`);
    }
    return 'sans-serif';
  }

  private drawRoundRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    rTop: number,
    rBottom = rTop,
  ): void {
    const rt = Math.min(Math.max(0, rTop), w / 2, h / 2);
    const rb = Math.min(Math.max(0, rBottom), w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rt, y);
    ctx.lineTo(x + w - rt, y);
    if (rt > 0) ctx.arcTo(x + w, y, x + w, y + rt, rt);
    else ctx.lineTo(x + w, y);
    ctx.lineTo(x + w, y + h - rb);
    if (rb > 0) ctx.arcTo(x + w, y + h, x + w - rb, y + h, rb);
    else ctx.lineTo(x + w, y + h);
    ctx.lineTo(x + rb, y + h);
    if (rb > 0) ctx.arcTo(x, y + h, x, y + h - rb, rb);
    else ctx.lineTo(x, y + h);
    ctx.lineTo(x, y + rt);
    if (rt > 0) ctx.arcTo(x, y, x + rt, y, rt);
    else ctx.lineTo(x, y);
    ctx.closePath();
  }

  private computeAnchorX(
    align: 'left' | 'center' | 'right',
    imgW: number,
    boxW: number,
    offsetFrac: number,
  ): number {
    const offset = Math.round(imgW * offsetFrac);
    switch (align) {
      case 'left':
        return Math.max(0, offset);
      case 'right':
        return Math.max(0, imgW - boxW - offset);
      case 'center':
        return Math.max(0, Math.round((imgW - boxW) / 2));
      default:
        return 0;
    }
  }

  private computeAnchorY(
    align: 'top' | 'center' | 'bottom',
    imgH: number,
    boxH: number,
    offsetFrac: number,
  ): number {
    const offset = Math.round(imgH * offsetFrac);
    switch (align) {
      case 'top':
        return Math.max(0, offset);
      case 'bottom':
        return Math.max(0, imgH - boxH - offset);
      case 'center':
        return Math.max(0, Math.round((imgH - boxH) / 2));
      default:
        return 0;
    }
  }

  // ── Frame drawing ───────────────────────────────────────────────────────

  private async drawFrame(
    posterBuf: Buffer,
    opts: {
      imgW: number;
      imgH: number;
      strokeW: number;
      outerR: number;
      innerR: number;
      frameColor: string;
      inset: 'outside' | 'inside' | 'flush';
    },
  ): Promise<Buffer> {
    const { imgW, imgH, strokeW, outerR, innerR, frameColor, inset } = opts;

    const margin =
      inset === 'outside'
        ? 0
        : inset === 'inside'
          ? strokeW
          : Math.floor(strokeW / 2);

    const frameCanvas = createCanvas(imgW, imgH);
    const fCtx = frameCanvas.getContext('2d');

    // Draw outer shape in frame colour
    fCtx.fillStyle = frameColor;
    this.drawRoundRect(
      fCtx,
      margin,
      margin,
      imgW - margin * 2,
      imgH - margin * 2,
      outerR,
    );
    fCtx.fill();

    // Punch transparent inner hole
    const innerM = margin + strokeW;
    const innerW = imgW - innerM * 2;
    const innerH = imgH - innerM * 2;
    if (innerW > 0 && innerH > 0) {
      fCtx.globalCompositeOperation = 'destination-out';
      fCtx.fillStyle = 'rgba(0,0,0,1)';
      this.drawRoundRect(fCtx, innerM, innerM, innerW, innerH, innerR);
      fCtx.fill();
      fCtx.globalCompositeOperation = 'source-over';
    }

    const frameBuf = frameCanvas.toBuffer('image/png');

    return await sharp(posterBuf)
      .composite([{ input: frameBuf, blend: 'over' }])
      .png()
      .toBuffer();
  }

  // ── Pill rendering ──────────────────────────────────────────────────────

  private renderPill(p: {
    text: string;
    fontFamily: string;
    pointSize: number;
    targetW: number;
    targetH: number;
    effRad: number;
    padPx: number;
    fontColor: string;
    backColor: string;
    withShadow: boolean;
    dockFlat: 'top' | 'bottom' | null;
  }): Buffer {
    const canvas: Canvas = createCanvas(p.targetW, p.targetH);
    const ctx = canvas.getContext('2d');

    // Background
    if (!this.isTransparent(p.backColor)) {
      ctx.fillStyle = p.backColor;
      const rTop = p.dockFlat === 'top' ? 0 : p.effRad;
      const rBottom = p.dockFlat === 'bottom' ? 0 : p.effRad;
      this.drawRoundRect(ctx, 0, 0, p.targetW, p.targetH, rTop, rBottom);
      ctx.fill();
    }

    // Shadow
    if (p.withShadow) {
      ctx.shadowColor = 'rgba(0,0,0,0.6)';
      ctx.shadowBlur = Math.ceil(p.pointSize * 0.08);
      ctx.shadowOffsetX = Math.ceil(p.pointSize * 0.05);
      ctx.shadowOffsetY = Math.ceil(p.pointSize * 0.05);
    }

    // Text
    ctx.fillStyle = p.fontColor;
    ctx.font = `${p.pointSize}px "${p.fontFamily}"`;
    ctx.textBaseline = 'middle';
    ctx.fillText(p.text, p.padPx, p.targetH / 2);

    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;

    return canvas.toBuffer('image/png');
  }

  // ── Main render ─────────────────────────────────────────────────────────

  async renderOverlay(
    posterBuffer: Buffer,
    opts: OverlayRenderOptions,
  ): Promise<OverlayResult> {
    const meta = await sharp(posterBuffer).metadata();
    const imgW = meta.width!;
    const imgH = meta.height!;
    const shortSide = Math.min(imgW, imgH);

    const MIN_FONT_FRAC = 0.02;
    const MAX_FONT_FRAC = 0.1;
    const WIDTH_BUDGET = 0.88;

    const fontFrac = this.toFraction(opts.fontSize);
    const padFrac = this.toFraction(opts.padding);
    const radFrac = this.toFraction(opts.backRadius);
    const offXFrac = this.toFraction(opts.horizontalOffset);
    const offYFrac = this.toFraction(opts.verticalOffset);

    // Font & text measurement
    const fontFamily = this.getFontFamily(opts.fontPath);
    const maxBoxW = Math.floor(imgW * WIDTH_BUDGET);

    let pointSize = Math.round(
      imgH * Math.min(MAX_FONT_FRAC, Math.max(MIN_FONT_FRAC, fontFrac)),
    );

    const measure = createCanvas(1, 1);
    const mCtx = measure.getContext('2d');
    mCtx.font = `${pointSize}px "${fontFamily}"`;
    let tm = mCtx.measureText(opts.text);

    // Shrink-to-fit
    while (
      tm.width > maxBoxW &&
      pointSize > Math.round(imgH * MIN_FONT_FRAC)
    ) {
      pointSize = Math.max(
        Math.round(imgH * MIN_FONT_FRAC),
        pointSize - Math.ceil(Math.max(1, pointSize * 0.08)),
      );
      mCtx.font = `${pointSize}px "${fontFamily}"`;
      tm = mCtx.measureText(opts.text);
    }

    const labelW = Math.ceil(tm.width);
    const labelH = Math.max(
      Math.ceil(tm.actualBoundingBoxAscent + tm.actualBoundingBoxDescent),
      Math.ceil(pointSize * 0.7),
    );

    // Pill geometry
    let padPx = Math.max(
      2,
      Math.round(Math.max(imgH * padFrac, pointSize * 0.45)),
    );
    let effRad = Math.round(Math.max(imgH * radFrac, pointSize * 0.35));
    let targetW = labelW + 2 * padPx;
    let targetH = labelH + 2 * padPx;
    effRad = Math.min(effRad, Math.floor(Math.min(targetW, targetH) / 2));

    // Dock / frame adjustments
    let strokeW = 0;
    let innerInsetPx = 0;
    let outerR = 0;
    let innerR = 0;

    if (opts.useFrame) {
      const fwFrac = Math.max(this.toFraction(opts.frameWidth), 0.0001);
      strokeW = Math.max(1, Math.round(shortSide * fwFrac));

      const fMargin =
        opts.frameInset === 'outside'
          ? 0
          : opts.frameInset === 'inside'
            ? strokeW
            : Math.floor(strokeW / 2);

      innerInsetPx = fMargin + strokeW;
      outerR = Math.max(
        0,
        Math.round(shortSide * this.toFraction(opts.frameRadius)),
      );

      const innerFracR = this.toFraction(opts.frameInnerRadius);
      innerR =
        opts.frameInnerRadiusMode === 'auto'
          ? Math.max(0, outerR - strokeW)
          : Math.min(
              outerR,
              Math.max(0, Math.round(shortSide * innerFracR)),
            );

      if (opts.dockStyle === 'bar') {
        targetW = Math.max(1, imgW - 2 * innerInsetPx);
        const basisR = innerR > 0 ? innerR : outerR;
        effRad = Math.min(
          Math.floor(targetH / 2),
          Math.round(Math.max(0, basisR * 0.5)),
        );
      } else {
        const basisR = innerR > 0 ? innerR : outerR;
        if (basisR > 0)
          effRad = Math.min(effRad, Math.max(4, Math.round(basisR * 0.9)));
      }
    }

    // Alignment
    let hAlign = opts.horizontalAlign;
    let vAlign = opts.verticalAlign;
    if (opts.overlayBottomCenter) {
      hAlign = 'center';
      vAlign = 'bottom';
    }

    let anchorX: number;
    let anchorY: number;

    if (opts.useFrame) {
      anchorX = Math.round((imgW - targetW) / 2);
      anchorY =
        opts.dockPosition === 'top'
          ? Math.max(0, innerInsetPx - 1)
          : imgH - targetH - innerInsetPx + 1;
    } else {
      anchorX = this.computeAnchorX(hAlign, imgW, targetW, offXFrac);
      anchorY = this.computeAnchorY(vAlign, imgH, targetH, offYFrac);
    }

    // Clamp to image bounds
    anchorX = Math.max(0, Math.min(anchorX, imgW - targetW));
    anchorY = Math.max(0, Math.min(anchorY, imgH - targetH));

    // Render pill
    const pillBuf = this.renderPill({
      text: opts.text,
      fontFamily,
      pointSize,
      targetW,
      targetH,
      effRad,
      padPx,
      fontColor: this.parseColor(opts.fontColor),
      backColor: this.parseColor(
        opts.useFrame ? opts.frameColor : opts.backColor,
      ),
      withShadow: !opts.useFrame,
      dockFlat: opts.useFrame ? opts.dockPosition : null,
    });

    // Apply frame then composite
    let workBuf = posterBuffer;

    if (opts.useFrame) {
      workBuf = await this.drawFrame(workBuf, {
        imgW,
        imgH,
        strokeW,
        outerR,
        innerR,
        frameColor: this.parseColor(opts.frameColor),
        inset: opts.frameInset,
      });
    }

    const resultBuf = await sharp(workBuf)
      .composite([
        { input: pillBuf, left: anchorX, top: anchorY, blend: 'over' },
      ])
      .jpeg({ quality: 92 })
      .toBuffer();

    return { buffer: resultBuf, contentType: 'image/jpeg' };
  }
}
