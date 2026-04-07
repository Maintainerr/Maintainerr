import {
  OverlayElement,
  OverlayRenderOptions,
  OverlayResult,
  type VariableElement,
} from '@maintainerr/contracts';
import { Injectable } from '@nestjs/common';
import {
  Canvas,
  CanvasRenderingContext2D,
  createCanvas,
  registerFont,
} from 'canvas';
import { format as dateFnsFormat, type Locale } from 'date-fns';
import * as dateFnsLocales from 'date-fns/locale';
import * as fs from 'fs';
import * as path from 'path';
import sharp from 'sharp';
import { dataDir as configDataDir } from '../../app/config/dataDir';
import { MaintainerrLogger } from '../logging/logs.service';

export interface TemplateRenderContext {
  /** Raw deletion date for per-element formatting */
  deleteDate: Date;
  /** Number of days remaining */
  daysLeft: number;
}

@Injectable()
export class OverlayRenderService {
  private registeredFonts = new Map<string, string>();
  private readonly bundledFontsDir: string;

  constructor(private readonly logger: MaintainerrLogger) {
    this.logger.setContext(OverlayRenderService.name);
    const distFonts = path.join(__dirname, '..', '..', 'assets', 'fonts');
    const srcFonts = path.join(__dirname, '..', '..', '..', 'assets', 'fonts');
    this.bundledFontsDir = fs.existsSync(distFonts) ? distFonts : srcFonts;
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

    // Resolve bare filenames against known font directories
    let resolvedPath = fontPath;
    if (!path.isAbsolute(fontPath) && !fs.existsSync(fontPath)) {
      const bundled = path.join(this.bundledFontsDir, fontPath);
      if (fs.existsSync(bundled)) {
        resolvedPath = bundled;
      } else {
        const userPath = path.join(
          configDataDir,
          'overlays',
          'fonts',
          fontPath,
        );
        if (fs.existsSync(userPath)) {
          resolvedPath = userPath;
        }
      }
    }

    if (fs.existsSync(resolvedPath)) {
      const family = path.basename(resolvedPath, path.extname(resolvedPath));
      try {
        registerFont(resolvedPath, { family });
        this.registeredFonts.set(fontPath, family);
        return family;
      } catch (err) {
        this.logger.warn(`Failed to register font at ${resolvedPath}`);
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
    while (tm.width > maxBoxW && pointSize > Math.round(imgH * MIN_FONT_FRAC)) {
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
    const padPx = Math.max(
      2,
      Math.round(Math.max(imgH * padFrac, pointSize * 0.45)),
    );
    let effRad = Math.round(Math.max(imgH * radFrac, pointSize * 0.35));
    let targetW = labelW + 2 * padPx;
    const targetH = labelH + 2 * padPx;
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
          : Math.min(outerR, Math.max(0, Math.round(shortSide * innerFracR)));

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

  // ── Template-based rendering ──────────────────────────────────────────

  /**
   * Render overlay elements from a template onto a poster.
   * Each element is rendered to a canvas then composited in layer order.
   */
  async renderFromTemplate(
    posterBuffer: Buffer,
    elements: OverlayElement[],
    canvasWidth: number,
    canvasHeight: number,
    context: TemplateRenderContext,
  ): Promise<OverlayResult> {
    const meta = await sharp(posterBuffer).metadata();
    const imgW = meta.width!;
    const imgH = meta.height!;

    // Scale factor: template canvas → actual poster dimensions
    const scaleX = imgW / canvasWidth;
    const scaleY = imgH / canvasHeight;

    // Sort elements by layerOrder, then render bottom-up
    const sorted = [...elements]
      .filter((el) => el.visible)
      .sort((a, b) => a.layerOrder - b.layerOrder);

    const layers: Array<{ input: Buffer; left: number; top: number }> = [];

    for (const el of sorted) {
      const sx = Math.round(el.x * scaleX);
      const sy = Math.round(el.y * scaleY);
      const sw = Math.max(1, Math.round(el.width * scaleX));
      const sh = Math.max(1, Math.round(el.height * scaleY));

      let layerBuf: Buffer | null = null;

      switch (el.type) {
        case 'text':
          layerBuf = this.renderTextElement(el, sw, sh, scaleX);
          break;
        case 'variable':
          layerBuf = this.renderVariableElement(el, sw, sh, scaleX, context);
          break;
        case 'shape':
          layerBuf = this.renderShapeElement(el, sw, sh);
          break;
        case 'image':
          layerBuf = await this.renderImageElement(el, sw, sh);
          break;
      }

      if (layerBuf) {
        // Apply rotation if needed
        if (el.rotation && el.rotation !== 0) {
          layerBuf = await sharp(layerBuf)
            .rotate(el.rotation, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
            .toBuffer();
        }

        // Apply element-level opacity
        if (el.opacity < 1) {
          layerBuf = await this.applyOpacity(layerBuf, el.opacity);
        }

        // Clamp layer to poster bounds – sharp.composite() throws
        // when a composite layer extends beyond the base image.
        const layerMeta = await sharp(layerBuf).metadata();
        let lw = layerMeta.width ?? sw;
        let lh = layerMeta.height ?? sh;
        let lx = sx;
        let ly = sy;

        // Handle negative offsets by extracting the visible sub-region
        let extractLeft = 0;
        let extractTop = 0;
        if (lx < 0) {
          extractLeft = -lx;
          lw -= extractLeft;
          lx = 0;
        }
        if (ly < 0) {
          extractTop = -ly;
          lh -= extractTop;
          ly = 0;
        }

        // Trim to poster bounds
        if (lx + lw > imgW) lw = imgW - lx;
        if (ly + lh > imgH) lh = imgH - ly;

        // Skip invisible layers
        if (lw <= 0 || lh <= 0) continue;

        // Extract visible region if we had to crop
        if (
          extractLeft > 0 ||
          extractTop > 0 ||
          lw !== (layerMeta.width ?? sw) ||
          lh !== (layerMeta.height ?? sh)
        ) {
          layerBuf = await sharp(layerBuf)
            .extract({
              left: extractLeft,
              top: extractTop,
              width: lw,
              height: lh,
            })
            .toBuffer();
        }

        layers.push({ input: layerBuf, left: lx, top: ly });
      }
    }

    const resultBuf = await sharp(posterBuffer)
      .composite(layers.map((l) => ({ ...l, blend: 'over' as const })))
      .jpeg({ quality: 92 })
      .toBuffer();

    return { buffer: resultBuf, contentType: 'image/jpeg' };
  }

  // ── Element renderers ─────────────────────────────────────────────────

  private renderTextElement(
    el: Extract<OverlayElement, { type: 'text' }>,
    w: number,
    h: number,
    scale: number,
  ): Buffer {
    const canvas = createCanvas(w, h);
    const ctx = canvas.getContext('2d');

    // Background
    if (el.backgroundColor) {
      const bg = this.parseColor(el.backgroundColor);
      if (!this.isTransparent(bg)) {
        ctx.fillStyle = bg;
        const rad = Math.round((el.backgroundRadius ?? 0) * scale);
        this.drawRoundRect(ctx, 0, 0, w, h, rad);
        ctx.fill();
      }
    }

    // Text
    const fontFamily = this.getFontFamily(el.fontPath);
    const pointSize = Math.max(1, Math.round(el.fontSize * scale));
    ctx.fillStyle = this.parseColor(el.fontColor);
    ctx.font = `${el.fontWeight ?? 'normal'} ${pointSize}px "${fontFamily}"`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = (el.textAlign as CanvasTextAlign) ?? 'left';

    const padX = Math.round((el.backgroundPadding ?? 0) * scale);
    const textX =
      el.textAlign === 'center'
        ? w / 2
        : el.textAlign === 'right'
          ? w - padX
          : padX;

    ctx.fillText(el.text, textX, h / 2, w - padX * 2);

    return canvas.toBuffer('image/png');
  }

  private renderVariableElement(
    el: Extract<OverlayElement, { type: 'variable' }>,
    w: number,
    h: number,
    scale: number,
    context: TemplateRenderContext,
  ): Buffer {
    // Resolve variable segments into a single text string
    const resolvedText = el.segments
      .map((seg) => {
        if (seg.type === 'text') return seg.value;
        // Variable segment: resolve from context using the element's own config
        switch (seg.field) {
          case 'date':
            return this.formatElementDate(el, context.deleteDate);
          case 'days':
            return context.daysLeft.toString();
          case 'daysText':
            return this.formatElementDaysText(el, context.daysLeft);
          default:
            return '';
        }
      })
      .join('');

    // Render like a text element
    const canvas = createCanvas(w, h);
    const ctx = canvas.getContext('2d');

    if (el.backgroundColor) {
      const bg = this.parseColor(el.backgroundColor);
      if (!this.isTransparent(bg)) {
        ctx.fillStyle = bg;
        const rad = Math.round((el.backgroundRadius ?? 0) * scale);
        this.drawRoundRect(ctx, 0, 0, w, h, rad);
        ctx.fill();
      }
    }

    const fontFamily = this.getFontFamily(el.fontPath);
    const pointSize = Math.max(1, Math.round(el.fontSize * scale));
    ctx.fillStyle = this.parseColor(el.fontColor);
    ctx.font = `${el.fontWeight ?? 'normal'} ${pointSize}px "${fontFamily}"`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = (el.textAlign as CanvasTextAlign) ?? 'left';

    const padX = Math.round((el.backgroundPadding ?? 0) * scale);
    const textX =
      el.textAlign === 'center'
        ? w / 2
        : el.textAlign === 'right'
          ? w - padX
          : padX;

    ctx.fillText(resolvedText, textX, h / 2, w - padX * 2);

    return canvas.toBuffer('image/png');
  }

  // ── Per-element date/variable formatting ──────────────────────────────

  private formatElementDate(el: VariableElement, deleteDate: Date): string {
    const fmt = this.convertVarDateFormat(el.dateFormat ?? 'MMM d');
    const locale = this.resolveVarLocale(el.language ?? 'en-US');
    try {
      let label = dateFnsFormat(deleteDate, fmt, { locale });
      if (el.enableDaySuffix && (el.language ?? 'en-US').startsWith('en')) {
        const day = deleteDate.getDate();
        const suffix = this.ordinalSuffix(day);
        label = label.replace(String(day), suffix);
      }
      return label;
    } catch {
      return deleteDate.toLocaleDateString();
    }
  }

  private formatElementDaysText(el: VariableElement, daysLeft: number): string {
    if (daysLeft === 0) return el.textToday ?? 'today';
    if (daysLeft === 1) return el.textDay ?? 'in 1 day';
    return (el.textDays ?? 'in {0} days').replace('{0}', String(daysLeft));
  }

  private ordinalSuffix(n: number): string {
    const abs = Math.abs(n);
    const lastTwo = abs % 100;
    if (lastTwo >= 11 && lastTwo <= 13) return `${n}th`;
    switch (abs % 10) {
      case 1:
        return `${n}st`;
      case 2:
        return `${n}nd`;
      case 3:
        return `${n}rd`;
      default:
        return `${n}th`;
    }
  }

  private resolveVarLocale(language: string): Locale | undefined {
    const normalized = language.replace('-', '');
    const short = language.split('-')[0];
    const key = normalized || short;
    const byFull = (dateFnsLocales as Record<string, Locale>)[key];
    if (byFull) return byFull;
    return (dateFnsLocales as Record<string, Locale>)[short];
  }

  private convertVarDateFormat(fmt: string): string {
    return fmt.replace(/dddd/g, 'EEEE').replace(/ddd/g, 'EEE');
  }

  private renderShapeElement(
    el: Extract<OverlayElement, { type: 'shape' }>,
    w: number,
    h: number,
  ): Buffer {
    const canvas = createCanvas(w, h);
    const ctx = canvas.getContext('2d');

    const fill = el.fillColor ? this.parseColor(el.fillColor) : null;
    const stroke = el.strokeColor ? this.parseColor(el.strokeColor) : null;

    if (el.shapeType === 'ellipse') {
      ctx.beginPath();
      ctx.ellipse(w / 2, h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
      if (fill && !this.isTransparent(fill)) {
        ctx.fillStyle = fill;
        ctx.fill();
      }
      if (stroke && el.strokeWidth && !this.isTransparent(stroke)) {
        ctx.strokeStyle = stroke;
        ctx.lineWidth = el.strokeWidth;
        ctx.stroke();
      }
    } else {
      // rectangle
      const rad = el.cornerRadius ?? 0;
      this.drawRoundRect(ctx, 0, 0, w, h, rad);
      if (fill && !this.isTransparent(fill)) {
        ctx.fillStyle = fill;
        ctx.fill();
      }
      if (stroke && el.strokeWidth && !this.isTransparent(stroke)) {
        ctx.strokeStyle = stroke;
        ctx.lineWidth = el.strokeWidth;
        ctx.stroke();
      }
    }

    return canvas.toBuffer('image/png');
  }

  private async renderImageElement(
    el: Extract<OverlayElement, { type: 'image' }>,
    w: number,
    h: number,
  ): Promise<Buffer | null> {
    if (!el.imagePath) return null;

    try {
      let imgBuf: Buffer;
      const resolvedPath = path.isAbsolute(el.imagePath)
        ? el.imagePath
        : path.join(configDataDir, 'overlays', 'images', el.imagePath);
      if (fs.existsSync(resolvedPath)) {
        imgBuf = fs.readFileSync(resolvedPath);
      } else {
        this.logger.warn(`Image element source not found: ${resolvedPath}`);
        return null;
      }

      return await sharp(imgBuf)
        .resize(w, h, {
          fit: 'contain',
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .png()
        .toBuffer();
    } catch (err) {
      this.logger.warn(`Failed to render image element: ${el.imagePath}`);
      this.logger.debug(err);
      return null;
    }
  }

  private async applyOpacity(buf: Buffer, opacity: number): Promise<Buffer> {
    // Extract alpha, multiply, re-apply
    const { data, info } = await sharp(buf)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const pixels = new Uint8Array(data.buffer, data.byteOffset, data.length);
    for (let i = 3; i < pixels.length; i += 4) {
      pixels[i] = Math.round(pixels[i] * Math.max(0, Math.min(1, opacity)));
    }

    return sharp(
      Buffer.from(pixels.buffer, pixels.byteOffset, pixels.byteLength),
      {
        raw: { width: info.width, height: info.height, channels: 4 },
      },
    )
      .png()
      .toBuffer();
  }
}
