import type {
  AnimationType,
  Clip,
  ColorGrade,
  KenBurnsPreset,
  ProjectState,
  TextStyleConfig,
} from "../types/studio";

export interface MediaCache {
  images: Map<string, HTMLImageElement>;
  videos: Map<string, HTMLVideoElement>;
}

export function createMediaCache(): MediaCache {
  return {
    images: new Map(),
    videos: new Map(),
  };
}

export function getOrLoadImage(
  cache: MediaCache,
  src: string,
  onReady?: () => void
): HTMLImageElement | null {
  if (!src) return null;
  let img = cache.images.get(src);
  if (!img) {
    img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => onReady?.();
    img.src = src;
    cache.images.set(src, img);
  }
  return img.complete && img.naturalWidth > 0 ? img : null;
}

export function getOrLoadVideo(
  cache: MediaCache,
  src: string,
  onReady?: () => void
): HTMLVideoElement | null {
  if (!src) return null;
  let vid = cache.videos.get(src);
  if (!vid) {
    vid = document.createElement("video");
    vid.crossOrigin = "anonymous";
    vid.muted = true;
    vid.playsInline = true;
    vid.preload = "auto";
    vid.onloadeddata = () => onReady?.();
    vid.src = src;
    vid.load();
    cache.videos.set(src, vid);
  }
  return vid.readyState >= 2 ? vid : null;
}

export function getProjectDuration(project: ProjectState): number {
  if (project.clips.length === 0) return 10;
  let maxEnd = 0;
  for (const c of project.clips) {
    const end = c.start + c.duration;
    if (end > maxEnd) maxEnd = end;
  }
  return Math.max(3, Math.ceil(maxEnd * 10) / 10);
}

function easeOutCubic(x: number): number {
  const c = Math.max(0, Math.min(1, x));
  return 1 - Math.pow(1 - c, 3);
}

function easeOutBack(x: number): number {
  const c = Math.max(0, Math.min(1, x));
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(c - 1, 3) + c1 * Math.pow(c - 1, 2);
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function buildCssFilter(grade: ColorGrade, scaleFactor: number): string {
  const parts: string[] = [];
  if (grade.brightness !== 100) parts.push(`brightness(${grade.brightness}%)`);
  if (grade.contrast !== 100) parts.push(`contrast(${grade.contrast}%)`);
  if (grade.saturation !== 100) parts.push(`saturate(${grade.saturation}%)`);
  if (grade.hueRotate !== 0) parts.push(`hue-rotate(${grade.hueRotate}deg)`);
  if (grade.warmth > 0) parts.push(`sepia(${Math.min(70, grade.warmth * 0.65)}%)`);
  if (grade.blur > 0) parts.push(`blur(${(grade.blur * scaleFactor).toFixed(1)}px)`);
  return parts.length > 0 ? parts.join(" ") : "none";
}

function computeAnimationOffset(
  type: AnimationType,
  progress: number, // 0 -> 1
  width: number,
  height: number
): { dx: number; dy: number; scale: number; rot: number; alpha: number } {
  const p = easeOutCubic(progress);
  switch (type) {
    case "fade":
      return { dx: 0, dy: 0, scale: 1, rot: 0, alpha: p };
    case "slide-up":
      return { dx: 0, dy: (1 - p) * height * 0.12, scale: 1, rot: 0, alpha: p };
    case "slide-down":
      return { dx: 0, dy: -(1 - p) * height * 0.12, scale: 1, rot: 0, alpha: p };
    case "slide-right":
      return { dx: -(1 - p) * width * 0.18, dy: 0, scale: 1, rot: 0, alpha: p };
    case "slide-left":
      return { dx: (1 - p) * width * 0.18, dy: 0, scale: 1, rot: 0, alpha: p };
    case "pop":
      return { dx: 0, dy: 0, scale: 0.35 + 0.65 * easeOutBack(progress), rot: 0, alpha: Math.min(1, progress * 2.5) };
    case "zoom-in":
      return { dx: 0, dy: 0, scale: 0.72 + 0.28 * p, rot: 0, alpha: p };
    case "spin-in":
      return { dx: 0, dy: 0, scale: 0.5 + 0.5 * p, rot: (1 - p) * -45, alpha: p };
    case "typewriter":
    case "none":
    default:
      return { dx: 0, dy: 0, scale: 1, rot: 0, alpha: 1 };
  }
}

function computeKenBurns(
  preset: KenBurnsPreset,
  clipProgress: number,
  width: number,
  height: number
): { dx: number; dy: number; scale: number } {
  const p = Math.max(0, Math.min(1, clipProgress));
  switch (preset) {
    case "zoom-in":
      return { dx: 0, dy: 0, scale: 1 + p * 0.14 };
    case "zoom-out":
      return { dx: 0, dy: 0, scale: 1.14 - p * 0.14 };
    case "pan-left":
      return { dx: (0.5 - p) * width * 0.08, dy: 0, scale: 1.1 };
    case "pan-right":
      return { dx: (p - 0.5) * width * 0.08, dy: 0, scale: 1.1 };
    case "pan-up":
      return { dx: 0, dy: (0.5 - p) * height * 0.07, scale: 1.1 };
    default:
      return { dx: 0, dy: 0, scale: 1 };
  }
}

function drawBackground(
  ctx: CanvasRenderingContext2D,
  project: ProjectState,
  w: number,
  h: number,
  time: number
) {
  const bg = project.background;
  if (bg.mode === "solid") {
    ctx.fillStyle = bg.color1;
    ctx.fillRect(0, 0, w, h);
    return;
  }

  if (bg.mode === "radial") {
    const grad = ctx.createRadialGradient(w * 0.5, h * 0.45, w * 0.05, w * 0.5, h * 0.5, Math.max(w, h) * 0.78);
    grad.addColorStop(0, bg.color2);
    grad.addColorStop(0.65, bg.color1);
    grad.addColorStop(1, bg.color3);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    return;
  }

  const rad = ((bg.angle - 90) * Math.PI) / 180;
  const cx = w / 2;
  const cy = h / 2;
  const len = Math.hypot(w, h) / 2;
  const grad = ctx.createLinearGradient(
    cx - Math.cos(rad) * len,
    cy - Math.sin(rad) * len,
    cx + Math.cos(rad) * len,
    cy + Math.sin(rad) * len
  );
  grad.addColorStop(0, bg.color1);
  grad.addColorStop(0.5, bg.color2);
  grad.addColorStop(1, bg.color3);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  if (bg.mode === "ambient") {
    // Subtle organic animated studio light orbs + fine floating dust particles
    ctx.save();
    const useBrandGreen =
      project.progressBar.color.toUpperCase() === "#00AE4D" ||
      bg.color2.toUpperCase() === "#0C2919";
    for (let i = 0; i < 3; i++) {
      const ox = w * (0.25 + 0.5 * Math.sin(time * 0.35 + i * 2.1));
      const oy = h * (0.3 + 0.4 * Math.cos(time * 0.28 + i * 1.7));
      const radOrb = w * (0.45 + i * 0.12);
      const orb = ctx.createRadialGradient(ox, oy, 0, ox, oy, radOrb);
      orb.addColorStop(
        0,
        useBrandGreen
          ? i % 2 === 0
            ? "rgba(0, 174, 77, 0.17)"
            : "rgba(165, 165, 164, 0.11)"
          : i % 2 === 0
            ? "rgba(249, 115, 22, 0.16)"
            : "rgba(56, 189, 248, 0.11)"
      );
      orb.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx.fillStyle = orb;
      ctx.fillRect(0, 0, w, h);
    }
    ctx.fillStyle = "rgba(255,255,255,0.22)";
    for (let p = 0; p < 24; p++) {
      const px = ((p * 173.3 + time * 18) % w + w) % w;
      const py = ((p * 291.7 - time * (12 + (p % 5) * 6)) % h + h) % h;
      const pr = ((p % 3) + 1) * (w / 1080) * 1.4;
      ctx.beginPath();
      ctx.arc(px, py, pr, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

function drawMediaElement(
  ctx: CanvasRenderingContext2D,
  source: HTMLImageElement | HTMLVideoElement,
  srcW: number,
  srcH: number,
  w: number,
  h: number,
  clip: Clip,
  scaleFactor: number
) {
  const fit = clip.transform.fitMode;
  const srcRatio = srcW / Math.max(1, srcH);
  const dstRatio = w / Math.max(1, h);

  const drawFitted = (mode: "cover" | "contain") => {
    let dw = w;
    let dh = h;
    if (mode === "cover") {
      if (srcRatio > dstRatio) {
        dh = h;
        dw = h * srcRatio;
      } else {
        dw = w;
        dh = w / srcRatio;
      }
    } else {
      if (srcRatio > dstRatio) {
        dw = w;
        dh = w / srcRatio;
      } else {
        dh = h;
        dw = h * srcRatio;
      }
    }

    const x = -dw / 2;
    const y = -dh / 2;
    const rad = clip.transform.borderRadius * scaleFactor;

    if (rad > 0) {
      ctx.save();
      drawRoundedRect(ctx, x, y, dw, dh, rad);
      ctx.clip();
      ctx.drawImage(source, x, y, dw, dh);
      ctx.restore();
    } else {
      ctx.drawImage(source, x, y, dw, dh);
    }

    if (clip.transform.borderWidth > 0) {
      ctx.save();
      ctx.strokeStyle = clip.transform.borderColor;
      ctx.lineWidth = clip.transform.borderWidth * scaleFactor;
      drawRoundedRect(ctx, x, y, dw, dh, rad);
      ctx.stroke();
      ctx.restore();
    }
  };

  if (fit === "blur-fill") {
    ctx.save();
    ctx.filter = `blur(${(28 * scaleFactor).toFixed(1)}px) brightness(62%)`;
    drawFitted("cover");
    ctx.restore();
    drawFitted("contain");
  } else {
    drawFitted(fit);
  }
}

function wrapLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const paragraphs = text.split("\n");
  const lines: string[] = [];
  for (const para of paragraphs) {
    const words = para.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push("");
      continue;
    }
    let current = words[0];
    for (let i = 1; i < words.length; i++) {
      const candidate = `${current} ${words[i]}`;
      if (ctx.measureText(candidate).width <= maxWidth) {
        current = candidate;
      } else {
        lines.push(current);
        current = words[i];
      }
    }
    lines.push(current);
  }
  return lines;
}

function drawTextOrCaptionClip(
  ctx: CanvasRenderingContext2D,
  clip: Clip,
  w: number,
  localTime: number,
  scaleFactor: number
) {
  const ts: TextStyleConfig | undefined = clip.textStyle;
  if (!ts || !ts.text) return;

  let displayText = ts.text;
  if (clip.enterAnimation === "typewriter" && clip.animationDuration > 0) {
    const p = Math.max(0, Math.min(1, localTime / clip.animationDuration));
    const count = Math.max(1, Math.floor(ts.text.length * p));
    displayText = ts.text.slice(0, count);
  }

  const fontSize = Math.max(14, ts.fontSize * scaleFactor);
  ctx.font = `${ts.fontWeight} ${fontSize}px "${ts.fontFamily}", "Vazirmatn", sans-serif`;
  ctx.textBaseline = "middle";
  ctx.direction = "rtl";

  const maxWidth = w * Math.max(0.3, Math.min(0.95, ts.maxWidthRatio || 0.84));
  const lines = wrapLines(ctx, displayText, maxWidth);
  const lineH = fontSize * (ts.lineHeight || 1.35);
  const totalH = lines.length * lineH;

  let widest = 0;
  for (const l of lines) {
    const mw = ctx.measureText(l).width;
    if (mw > widest) widest = mw;
  }

  const pad = (ts.bgPadding || 20) * scaleFactor;
  const boxW = widest + pad * 2;
  const boxH = totalH + pad * 1.4;

  // Optional solid/glass background box behind text
  if (ts.bgOpacity > 0.01) {
    ctx.save();
    ctx.globalAlpha *= ts.bgOpacity;
    ctx.fillStyle = ts.bgColor;
    const rad = (ts.bgRadius || 12) * scaleFactor;
    drawRoundedRect(ctx, -boxW / 2, -boxH / 2, boxW, boxH, rad);
    ctx.fill();
    if (clip.kind === "caption") {
      ctx.strokeStyle = "rgba(165, 165, 164, 0.38)";
      ctx.lineWidth = Math.max(1, 1.6 * scaleFactor);
      ctx.stroke();
    }
    ctx.restore();
  }

  // Karaoke word-highlight mode for caption clips (word-by-word synced to narration audio!)
  if (clip.kind === "caption") {
    const allWords = displayText.trim().split(/\s+/).filter(Boolean);
    let activeWordIdx = 0;

    if (ts.wordTimings && ts.wordTimings.length > 0) {
      // Exact millisecond match against acoustic word timings
      let found = -1;
      for (let idx = 0; idx < ts.wordTimings.length; idx++) {
        const wt = ts.wordTimings[idx];
        if (localTime >= wt.start && localTime <= wt.end) {
          found = idx;
          break;
        }
        if (localTime > wt.end) {
          found = idx;
        }
      }
      activeWordIdx = Math.max(0, Math.min(allWords.length - 1, found === -1 ? 0 : found));
    } else {
      // Character-weighted fallback when no TTS word timings are attached yet
      const weights = allWords.map((wd) => Math.max(2, wd.length + (/[،؛.!؟]$/.test(wd) ? 3 : 0)));
      const totalW = weights.reduce((a, b) => a + b, 0) || 1;
      const target = (localTime / Math.max(0.1, clip.duration)) * totalW;
      let acc = 0;
      for (let idx = 0; idx < weights.length; idx++) {
        acc += weights[idx];
        if (target <= acc) {
          activeWordIdx = idx;
          break;
        }
        activeWordIdx = idx;
      }
    }

    let runningWordIdx = 0;
    for (let li = 0; li < lines.length; li++) {
      const lineWords = lines[li].split(/\s+/).filter(Boolean);
      const y = -totalH / 2 + li * lineH + lineH / 2;

      const spaceW = ctx.measureText(" ").width;
      const wordWidths = lineWords.map((wd) => ctx.measureText(wd).width);
      const totalLineW =
        wordWidths.reduce((a, b) => a + b, 0) + Math.max(0, lineWords.length - 1) * spaceW;

      // RTL layout: start from right edge and move left
      let cursorX = totalLineW / 2;
      if (ts.align === "right") cursorX = maxWidth / 2;
      if (ts.align === "left") cursorX = -maxWidth / 2 + totalLineW;

      for (let wi = 0; wi < lineWords.length; wi++) {
        const word = lineWords[wi];
        const ww = wordWidths[wi];
        const wordCenterX = cursorX - ww / 2;
        const isActive = runningWordIdx === activeWordIdx;
        const isUpcoming = runningWordIdx > activeWordIdx;

        ctx.save();
        ctx.textAlign = "center";
        if (isActive) {
          // Draw crisp highlight pill behind the exact active spoken word
          ctx.fillStyle = ts.highlightColor || "#00AE4D";
          const hPad = 11 * scaleFactor;
          drawRoundedRect(
            ctx,
            wordCenterX - ww / 2 - hPad,
            y - fontSize * 0.64,
            ww + hPad * 2,
            fontSize * 1.28,
            11 * scaleFactor
          );
          ctx.fill();
        }

        if (ts.shadowBlur > 0) {
          ctx.shadowBlur = ts.shadowBlur * scaleFactor;
          ctx.shadowColor = ts.shadowColor || "rgba(0,0,0,0.78)";
        }
        if (ts.strokeWidth > 0 && !isActive) {
          ctx.lineWidth = ts.strokeWidth * scaleFactor;
          ctx.strokeStyle = ts.strokeColor;
          ctx.lineJoin = "round";
          ctx.strokeText(word, wordCenterX, y);
        }
        ctx.fillStyle = isActive
          ? "#FFFFFF"
          : isUpcoming
          ? "rgba(255, 255, 255, 0.72)"
          : ts.color;
        ctx.fillText(word, wordCenterX, y);
        ctx.restore();

        cursorX -= ww + spaceW;
        runningWordIdx++;
      }
    }
    return;
  }

  // Standard styled text
  ctx.save();
  ctx.textAlign = ts.align;
  if (ts.shadowBlur > 0) {
    ctx.shadowBlur = ts.shadowBlur * scaleFactor;
    ctx.shadowColor = ts.shadowColor || "rgba(0,0,0,0.7)";
  }

  let fillStyle: string | CanvasGradient = ts.color;
  if (ts.useGradient) {
    const g = ctx.createLinearGradient(0, -totalH / 2, 0, totalH / 2);
    g.addColorStop(0, ts.color);
    g.addColorStop(1, ts.gradientTo || "#00AE4D");
    fillStyle = g;
  }

  const textX = ts.align === "center" ? 0 : ts.align === "right" ? widest / 2 : -widest / 2;
  for (let i = 0; i < lines.length; i++) {
    const y = -totalH / 2 + i * lineH + lineH / 2;
    if (ts.strokeWidth > 0) {
      ctx.lineWidth = ts.strokeWidth * scaleFactor;
      ctx.strokeStyle = ts.strokeColor;
      ctx.lineJoin = "round";
      ctx.strokeText(lines[i], textX, y);
    }
    ctx.fillStyle = fillStyle;
    ctx.fillText(lines[i], textX, y);
  }
  ctx.restore();
}

function drawStickerClip(
  ctx: CanvasRenderingContext2D,
  clip: Clip,
  scaleFactor: number
) {
  const accent = clip.stickerAccent || "#00AE4D";
  const label = clip.stickerLabel || clip.name;
  const s = scaleFactor;

  ctx.save();
  ctx.direction = "rtl";
  ctx.font = `800 ${36 * s}px "Vazirmatn", sans-serif`;
  const textW = ctx.measureText(label).width;
  const padX = 34 * s;
  const boxW = Math.max(240 * s, textW + padX * 2 + 44 * s);
  const boxH = 84 * s;

  ctx.shadowBlur = 24 * s;
  ctx.shadowColor = "rgba(0,0,0,0.55)";

  if (clip.stickerId === "discount-50") {
    // Bold angled stamp
    ctx.fillStyle = accent;
    drawRoundedRect(ctx, -boxW / 2, -boxH / 2, boxW, boxH, 16 * s);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.85)";
    ctx.lineWidth = 3 * s;
    drawRoundedRect(ctx, -boxW / 2 + 6 * s, -boxH / 2 + 6 * s, boxW - 12 * s, boxH - 12 * s, 12 * s);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#FFFFFF";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, 0, 2 * s);
  } else if (clip.stickerId === "arrow-down") {
    ctx.fillStyle = "rgba(11,13,17,0.78)";
    drawRoundedRect(ctx, -boxW / 2, -boxH / 2, boxW, boxH, 42 * s);
    ctx.fill();
    ctx.strokeStyle = accent;
    ctx.lineWidth = 3 * s;
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#FFFFFF";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(`↓  ${label}  ↓`, 0, 2 * s);
  } else {
    // Sleek broadcast graphic callout card
    ctx.fillStyle = "rgba(15, 20, 30, 0.88)";
    drawRoundedRect(ctx, -boxW / 2, -boxH / 2, boxW, boxH, 18 * s);
    ctx.fill();

    ctx.strokeStyle = accent;
    ctx.lineWidth = 3 * s;
    ctx.stroke();

    // Accent icon circle on right side
    ctx.shadowBlur = 0;
    const iconX = boxW / 2 - 36 * s;
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.arc(iconX, 0, 20 * s, 0, Math.PI * 2);
    ctx.fill();

    // Crisp vector icon inside circle
    ctx.fillStyle = "#FFFFFF";
    ctx.strokeStyle = "#FFFFFF";
    ctx.lineWidth = 3 * s;
    ctx.beginPath();
    if (clip.stickerId === "heart-glow") {
      ctx.arc(iconX - 4 * s, -2 * s, 5 * s, 0, Math.PI * 2);
      ctx.arc(iconX + 4 * s, -2 * s, 5 * s, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(iconX - 9 * s, 0);
      ctx.lineTo(iconX, 10 * s);
      ctx.lineTo(iconX + 9 * s, 0);
      ctx.fill();
    } else if (clip.stickerId === "save-post") {
      ctx.moveTo(iconX - 6 * s, -8 * s);
      ctx.lineTo(iconX + 6 * s, -8 * s);
      ctx.lineTo(iconX + 6 * s, 9 * s);
      ctx.lineTo(iconX, 4 * s);
      ctx.lineTo(iconX - 6 * s, 9 * s);
      ctx.closePath();
      ctx.fill();
    } else if (clip.stickerId === "star-award") {
      for (let i = 0; i < 5; i++) {
        const a = (i * 4 * Math.PI) / 5 - Math.PI / 2;
        const px = iconX + Math.cos(a) * 9 * s;
        const py = Math.sin(a) * 9 * s;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
    } else {
      // Plus / play emblem
      ctx.moveTo(iconX - 7 * s, 0);
      ctx.lineTo(iconX + 7 * s, 0);
      ctx.moveTo(iconX, -7 * s);
      ctx.lineTo(iconX, 7 * s);
      ctx.stroke();
    }

    ctx.fillStyle = "#F8FAFC";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, -18 * s, 2 * s);
  }
  ctx.restore();
}

function drawShapeClip(
  ctx: CanvasRenderingContext2D,
  clip: Clip,
  w: number,
  h: number,
  scaleFactor: number
) {
  const kind = clip.shapeKind || "rect";
  const fill1 = clip.shapeFill || "#00AE4D";
  const fill2 = clip.shapeFill2 || "rgba(0,0,0,0.8)";

  ctx.save();
  if (kind === "gradient-scrim") {
    const sw = w;
    const sh = h * 0.55;
    const grad = ctx.createLinearGradient(0, -sh / 2, 0, sh / 2);
    grad.addColorStop(0, fill1);
    grad.addColorStop(1, fill2);
    ctx.fillStyle = grad;
    ctx.fillRect(-sw / 2, -sh / 2, sw, sh);
  } else if (kind === "circle") {
    ctx.fillStyle = fill1;
    ctx.beginPath();
    ctx.arc(0, 0, 160 * scaleFactor, 0, Math.PI * 2);
    ctx.fill();
  } else if (kind === "line") {
    ctx.fillStyle = fill1;
    drawRoundedRect(ctx, -280 * scaleFactor, -5 * scaleFactor, 560 * scaleFactor, 10 * scaleFactor, 5 * scaleFactor);
    ctx.fill();
  } else {
    ctx.fillStyle = fill1;
    drawRoundedRect(
      ctx,
      -260 * scaleFactor,
      -120 * scaleFactor,
      520 * scaleFactor,
      240 * scaleFactor,
      (clip.transform.borderRadius || 20) * scaleFactor
    );
    ctx.fill();
  }
  ctx.restore();
}

function applyPostVfx(
  ctx: CanvasRenderingContext2D,
  grade: ColorGrade,
  w: number,
  h: number,
  time: number
) {
  // Warm/Cool color cast overlay
  if (grade.warmth !== 0) {
    ctx.save();
    ctx.globalCompositeOperation = "soft-light";
    ctx.fillStyle =
      grade.warmth > 0
        ? `rgba(255, 148, 60, ${Math.min(0.45, grade.warmth / 180)})`
        : `rgba(56, 160, 255, ${Math.min(0.45, Math.abs(grade.warmth) / 180)})`;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  // Vignette
  if (grade.vignette > 0) {
    ctx.save();
    const grad = ctx.createRadialGradient(w / 2, h / 2, w * 0.25, w / 2, h / 2, Math.max(w, h) * 0.72);
    grad.addColorStop(0, "rgba(0,0,0,0)");
    grad.addColorStop(1, `rgba(0,0,0,${Math.min(0.88, grade.vignette / 110)})`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  // Retro scanlines
  if (grade.scanlines > 0) {
    ctx.save();
    ctx.fillStyle = `rgba(0,0,0,${Math.min(0.42, grade.scanlines / 220)})`;
    const step = Math.max(3, Math.round(h / 260));
    for (let y = 0; y < h; y += step * 2) {
      ctx.fillRect(0, y, w, step);
    }
    ctx.restore();
  }

  // Deterministic analog film grain
  if (grade.grain > 0) {
    ctx.save();
    const dots = Math.floor((grade.grain / 100) * 650);
    const seed = Math.floor(time * 30);
    for (let i = 0; i < dots; i++) {
      const rx = Math.abs(Math.sin((i + 1) * 12.9898 + seed * 78.233) * 43758.5453) % 1;
      const ry = Math.abs(Math.sin((i + 1) * 93.9898 + seed * 19.13) * 24634.6345) % 1;
      ctx.fillStyle = i % 2 === 0 ? "rgba(255,255,255,0.14)" : "rgba(0,0,0,0.18)";
      ctx.fillRect(rx * w, ry * h, 2, 2);
    }
    ctx.restore();
  }

  // RGB Glitch horizontal bars
  if (grade.glitch > 0) {
    const pulse = Math.sin(time * 24);
    if (pulse > 0.35) {
      ctx.save();
      const slices = Math.ceil((grade.glitch / 100) * 6);
      for (let i = 0; i < slices; i++) {
        const y = ((Math.sin(time * 13 + i * 7.1) + 1) * 0.5) * h;
        const sh = (4 + (i % 4) * 5) * (h / 1920);
        ctx.fillStyle = i % 2 === 0 ? "rgba(239,68,68,0.22)" : "rgba(56,189,248,0.22)";
        ctx.fillRect(0, y, w, sh);
      }
      ctx.restore();
    }
  }
}

function drawGlobalOverlays(
  ctx: CanvasRenderingContext2D,
  project: ProjectState,
  w: number,
  h: number,
  time: number,
  totalDuration: number,
  scaleFactor: number,
  mediaCache: MediaCache
) {
  // 1. Animated Progress Bar
  if (project.progressBar.enabled) {
    const pb = project.progressBar;
    const barH = Math.max(3, pb.height * scaleFactor);
    const y = pb.position === "top" ? 0 : h - barH;
    const ratio = Math.max(0, Math.min(1, time / Math.max(0.1, totalDuration)));
    ctx.save();
    ctx.fillStyle = pb.trackColor;
    ctx.fillRect(0, y, w, barH);
    ctx.fillStyle = pb.color;
    ctx.fillRect(0, y, w * ratio, barH);
    ctx.restore();
  }

  // 2. Live Audio Spectrum Visualizer
  if (project.visualizer.enabled) {
    const vz = project.visualizer;
    const count = Math.max(8, Math.min(48, vz.barCount));
    const totalW = w * 0.72;
    const startX = (w - totalW) / 2;
    const baseY = h * vz.positionY;
    const gap = 6 * scaleFactor;
    const barW = Math.max(3 * scaleFactor, (totalW - gap * (count - 1)) / count);
    const maxH = 88 * scaleFactor * vz.intensity;
    const isBrandPalette = vz.color.toUpperCase() === "#00AE4D";

    ctx.save();
    ctx.shadowBlur = 12 * scaleFactor;
    ctx.shadowColor = isBrandPalette ? "rgba(0, 174, 77, 0.55)" : vz.color;
    ctx.globalAlpha = 0.92;

    if (vz.style === "wave") {
      if (isBrandPalette) {
        const wg = ctx.createLinearGradient(startX, baseY, startX + totalW, baseY);
        wg.addColorStop(0, "#00AE4D");
        wg.addColorStop(0.5, "#A5A5A4");
        wg.addColorStop(1, "#00AE4D");
        ctx.strokeStyle = wg;
      } else {
        ctx.strokeStyle = vz.color;
      }
      ctx.lineWidth = 4 * scaleFactor;
      ctx.beginPath();
      for (let i = 0; i < count; i++) {
        const x = startX + (i / (count - 1)) * totalW;
        const amp =
          (0.35 +
            0.35 * Math.sin(time * 7.5 + i * 0.55) +
            0.3 * Math.cos(time * 12.2 - i * 0.9)) *
          maxH *
          0.5;
        const y = baseY + amp;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    } else {
      for (let i = 0; i < count; i++) {
        const distCenter = 1 - Math.abs(i / (count - 1) - 0.5) * 1.4;
        const raw =
          0.25 +
          0.4 * Math.abs(Math.sin(time * 6.5 + i * 0.65)) +
          0.35 * Math.abs(Math.cos(time * 11.3 + i * 1.15));
        const bh = Math.max(6 * scaleFactor, raw * maxH * Math.max(0.35, distCenter));
        const x = startX + i * (barW + gap);
        const topY = vz.style === "mirror" ? baseY - bh / 2 : baseY - bh;

        if (isBrandPalette) {
          const bg = ctx.createLinearGradient(x, topY, x, topY + bh);
          if (vz.style === "mirror") {
            bg.addColorStop(0, "#A5A5A4");
            bg.addColorStop(0.3, "#00AE4D");
            bg.addColorStop(0.5, "#34D399");
            bg.addColorStop(0.7, "#00AE4D");
            bg.addColorStop(1, "#A5A5A4");
          } else {
            bg.addColorStop(0, "#A5A5A4");
            bg.addColorStop(0.35, "#34D399");
            bg.addColorStop(1, "#00AE4D");
          }
          ctx.fillStyle = bg;
        } else {
          ctx.fillStyle = vz.color;
        }

        drawRoundedRect(ctx, x, topY, barW, bh, barW / 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  // 3. Brand Watermark & Fixed Bottom Logo
  if (project.watermark.enabled && (project.watermark.handle || project.watermark.logoSrc)) {
    const wm = project.watermark;
    ctx.save();
    ctx.globalAlpha = Math.max(0.1, Math.min(1, wm.opacity));

    const logoImg = wm.logoSrc ? getOrLoadImage(mediaCache, wm.logoSrc) : null;
    const aspect = logoImg
      ? logoImg.naturalWidth / Math.max(1, logoImg.naturalHeight)
      : 1;

    if (wm.corner === "bottom-center") {
      const cx = w / 2;
      const targetLogoW = logoImg
        ? Math.min(w * 0.44, 240 * scaleFactor * wm.scale)
        : 0;
      const logoH = logoImg ? targetLogoW / Math.max(0.35, aspect) : 0;
      const padX = 24 * scaleFactor;
      const padY = 12 * scaleFactor;
      const handleFont = Math.max(12, 20 * scaleFactor * wm.scale);
      const handleGap = wm.handle ? 24 * scaleFactor * wm.scale : 0;

      ctx.font = `700 ${handleFont}px "Vazirmatn", sans-serif`;
      const handleW = wm.handle ? ctx.measureText(wm.handle).width : 0;
      const dockW = Math.max(targetLogoW, handleW) + padX * 2;
      const dockH = logoH + padY * 2 + handleGap;
      const dockTop = h - 30 * scaleFactor - dockH;

      // Crisp dark emerald-obsidian dock with subtle metallic silver hairline
      ctx.save();
      ctx.shadowBlur = 22 * scaleFactor;
      ctx.shadowColor = "rgba(0, 0, 0, 0.78)";
      ctx.fillStyle = "rgba(5, 11, 8, 0.68)";
      drawRoundedRect(ctx, cx - dockW / 2, dockTop, dockW, dockH, 20 * scaleFactor);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = "rgba(165, 165, 164, 0.36)";
      ctx.lineWidth = Math.max(1, 1.5 * scaleFactor);
      ctx.stroke();
      ctx.restore();

      if (logoImg) {
        ctx.save();
        ctx.shadowBlur = 10 * scaleFactor;
        ctx.shadowColor = "rgba(0, 174, 77, 0.35)";
        ctx.drawImage(
          logoImg,
          cx - targetLogoW / 2,
          dockTop + padY,
          targetLogoW,
          logoH
        );
        ctx.restore();
      }

      if (wm.handle) {
        ctx.fillStyle = "#D4D4D3";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.shadowBlur = 8 * scaleFactor;
        ctx.shadowColor = "rgba(0, 0, 0, 0.8)";
        ctx.fillText(wm.handle, cx, dockTop + padY + logoH + handleGap * 0.62);
      }
    } else {
      const padX = 48 * scaleFactor;
      const padY = 64 * scaleFactor;
      const fontSize = 30 * scaleFactor * wm.scale;
      ctx.font = `600 ${fontSize}px "Vazirmatn", sans-serif`;
      ctx.textBaseline = "middle";
      ctx.shadowBlur = 12 * scaleFactor;
      ctx.shadowColor = "rgba(0,0,0,0.75)";

      const isRight = wm.corner.includes("right");
      const isBottom = wm.corner.includes("bottom");
      const x = isRight ? w - padX : padX;
      const y = isBottom ? h - padY : padY;

      let textOffset = 0;
      if (logoImg) {
        const logoH = 48 * scaleFactor * wm.scale;
        const logoW = Math.min(w * 0.28, logoH * aspect);
        const lx = isRight ? x - logoW : x;
        ctx.drawImage(logoImg, lx, y - logoH / 2, logoW, logoH);
        textOffset = logoW + 14 * scaleFactor;
      }

      if (wm.handle) {
        ctx.fillStyle = "#FFFFFF";
        ctx.textAlign = isRight ? "right" : "left";
        ctx.fillText(wm.handle, isRight ? x - textOffset : x + textOffset, y);
      }
    }
    ctx.restore();
  }
}

function drawEditorGuides(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  showSafeZone: boolean,
  showGrid: boolean,
  selectedClip: Clip | null,
  time: number,
  scaleFactor: number
) {
  // Rule of Thirds + Center Crosshair Grid
  if (showGrid) {
    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.22)";
    ctx.lineWidth = Math.max(1, 1.5 * scaleFactor);
    for (let i = 1; i <= 2; i++) {
      ctx.beginPath();
      ctx.moveTo((w * i) / 3, 0);
      ctx.lineTo((w * i) / 3, h);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, (h * i) / 3);
      ctx.lineTo(w, (h * i) / 3);
      ctx.stroke();
    }
    ctx.strokeStyle = "rgba(249,115,22,0.45)";
    ctx.setLineDash([8 * scaleFactor, 8 * scaleFactor]);
    ctx.beginPath();
    ctx.moveTo(w / 2, 0);
    ctx.lineTo(w / 2, h);
    ctx.moveTo(0, h / 2);
    ctx.lineTo(w, h / 2);
    ctx.stroke();
    ctx.restore();
  }

  // Instagram Reels & Story Safe Zone Overlay
  if (showSafeZone) {
    ctx.save();
    const topSafe = h * 0.13;
    const bottomSafe = h * 0.22;
    const rightUi = w * 0.16;

    ctx.fillStyle = "rgba(239, 68, 68, 0.16)";
    ctx.fillRect(0, 0, w, topSafe);
    ctx.fillRect(0, h - bottomSafe, w, bottomSafe);
    ctx.fillRect(w - rightUi, topSafe, rightUi, h - topSafe - bottomSafe);

    ctx.strokeStyle = "rgba(239, 68, 68, 0.72)";
    ctx.lineWidth = 2 * scaleFactor;
    ctx.setLineDash([10 * scaleFactor, 8 * scaleFactor]);
    ctx.strokeRect(24 * scaleFactor, topSafe, w - rightUi - 24 * scaleFactor, h - topSafe - bottomSafe);

    ctx.setLineDash([]);
    ctx.font = `600 ${24 * scaleFactor}px "Vazirmatn", sans-serif`;
    ctx.fillStyle = "rgba(255,255,255,0.82)";
    ctx.textAlign = "center";
    ctx.fillText("منطقه امن ریلز و استوری اینستاگرام", w / 2, topSafe - 18 * scaleFactor);
    ctx.fillText("ناحیه کپشن و دکمه‌های اینستاگرام", w / 2, h - bottomSafe + 36 * scaleFactor);
    ctx.restore();
  }

  // Subtle selection indicator on canvas for active visual clip
  if (
    selectedClip &&
    selectedClip.kind !== "audio" &&
    time >= selectedClip.start &&
    time <= selectedClip.start + selectedClip.duration
  ) {
    const cx = w / 2 + selectedClip.transform.x * w;
    const cy = h / 2 + selectedClip.transform.y * h;
    ctx.save();
    ctx.strokeStyle = "#00AE4D";
    ctx.lineWidth = Math.max(2, 3 * scaleFactor);
    ctx.setLineDash([8 * scaleFactor, 6 * scaleFactor]);
    const bw = selectedClip.kind === "image" || selectedClip.kind === "video" ? w * 0.92 * selectedClip.transform.scale : w * 0.78 * selectedClip.transform.scale;
    const bh = selectedClip.kind === "image" || selectedClip.kind === "video" ? h * 0.92 * selectedClip.transform.scale : 140 * scaleFactor * selectedClip.transform.scale;
    ctx.translate(cx, cy);
    ctx.rotate((selectedClip.transform.rotation * Math.PI) / 180);
    ctx.strokeRect(-bw / 2, -bh / 2, bw, bh);
    ctx.setLineDash([]);
    ctx.fillStyle = "#00AE4D";
    ctx.beginPath();
    ctx.arc(0, 0, 7 * scaleFactor, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

export interface RenderOptions {
  time: number;
  width: number;
  height: number;
  mediaCache: MediaCache;
  showSafeZone?: boolean;
  showGrid?: boolean;
  selectedClipId?: string | null;
  isExport?: boolean;
  onMediaReady?: () => void;
}

export function renderFrame(
  ctx: CanvasRenderingContext2D,
  project: ProjectState,
  opts: RenderOptions
) {
  const { time, width: w, height: h, mediaCache } = opts;
  const scaleFactor = w / 1080;
  const totalDuration = getProjectDuration(project);

  ctx.save();
  ctx.clearRect(0, 0, w, h);

  // 1. Project background
  drawBackground(ctx, project, w, h, time);

  // 2. Render tracks bottom-to-top (video -> graphic -> text)
  const trackOrder = new Map(project.tracks.map((tr, idx) => [tr.id, idx]));
  const trackMap = new Map(project.tracks.map((tr) => [tr.id, tr]));

  const visibleClips = project.clips
    .filter((c) => {
      if (c.kind === "audio") return false;
      const tr = trackMap.get(c.trackId);
      if (!tr || !tr.visible) return false;
      return time >= c.start && time <= c.start + c.duration;
    })
    .sort((a, b) => (trackOrder.get(a.trackId) ?? 0) - (trackOrder.get(b.trackId) ?? 0));

  for (const clip of visibleClips) {
    const localTime = Math.max(0, time - clip.start);
    const clipProg = localTime / Math.max(0.05, clip.duration);

    // Entrance & Exit animations
    let animDx = 0;
    let animDy = 0;
    let animScale = 1;
    let animRot = 0;
    let animAlpha = 1;

    const animDur = Math.max(0.1, Math.min(clip.duration / 2, clip.animationDuration || 0.5));
    if (clip.enterAnimation !== "none" && localTime < animDur) {
      const a = computeAnimationOffset(clip.enterAnimation, localTime / animDur, w, h);
      animDx += a.dx;
      animDy += a.dy;
      animScale *= a.scale;
      animRot += a.rot;
      animAlpha *= a.alpha;
    }

    const remain = clip.duration - localTime;
    if (clip.exitAnimation !== "none" && remain < animDur) {
      const a = computeAnimationOffset(clip.exitAnimation, remain / animDur, w, h);
      animDx -= a.dx;
      animDy -= a.dy;
      animScale *= a.scale;
      animRot -= a.rot;
      animAlpha *= a.alpha;
    }

    // Loop motion
    if (clip.loopAnimation === "float") {
      animDy += Math.sin(localTime * 3.2) * 14 * scaleFactor;
    } else if (clip.loopAnimation === "pulse") {
      animScale *= 1 + Math.sin(localTime * 5.2) * 0.055;
    } else if (clip.loopAnimation === "shake") {
      animDx += Math.sin(localTime * 32) * 5 * scaleFactor;
      animRot += Math.cos(localTime * 28) * 1.4;
    } else if (clip.loopAnimation === "slow-spin") {
      animRot += localTime * 22;
    }

    // Camera Shake VFX
    if (clip.color.cameraShake > 0) {
      const amt = (clip.color.cameraShake / 100) * 18 * scaleFactor;
      animDx += Math.sin(time * 27.3) * amt;
      animDy += Math.cos(time * 31.7) * amt;
    }

    // Transition In effects
    const trDur = Math.max(0.1, Math.min(clip.duration / 2, clip.transitionDuration || 0.45));
    let transFlashWhite = 0;
    let transFadeBlack = 0;
    let wipeRatio: number | null = null;
    if (clip.transitionIn !== "none" && localTime < trDur) {
      const tp = easeOutCubic(localTime / trDur);
      if (clip.transitionIn === "dissolve") {
        animAlpha *= tp;
      } else if (clip.transitionIn === "fade-black") {
        transFadeBlack = 1 - tp;
      } else if (clip.transitionIn === "slide-left") {
        animDx += (1 - tp) * w;
      } else if (clip.transitionIn === "slide-up") {
        animDy += (1 - tp) * h;
      } else if (clip.transitionIn === "zoom-burst") {
        animScale *= 1.45 - 0.45 * tp;
        animAlpha *= tp;
      } else if (clip.transitionIn === "wipe") {
        wipeRatio = tp;
      } else if (clip.transitionIn === "flash-white") {
        transFlashWhite = Math.sin((1 - tp) * Math.PI);
      } else if (clip.transitionIn === "spin") {
        animRot += (1 - tp) * 180;
        animScale *= 0.4 + 0.6 * tp;
        animAlpha *= tp;
      }
    }

    // Ken Burns for images/videos
    const kb =
      clip.kind === "image" || clip.kind === "video"
        ? computeKenBurns(clip.kenBurns, clipProg, w, h)
        : { dx: 0, dy: 0, scale: 1 };

    ctx.save();
    if (wipeRatio !== null) {
      ctx.beginPath();
      ctx.rect(0, 0, w * wipeRatio, h);
      ctx.clip();
    }

    ctx.globalAlpha = Math.max(0, Math.min(1, clip.transform.opacity * animAlpha));
    ctx.globalCompositeOperation = clip.transform.blendMode || "source-over";

    const cx = w / 2 + clip.transform.x * w + animDx + kb.dx;
    const cy = h / 2 + clip.transform.y * h + animDy + kb.dy;
    ctx.translate(cx, cy);
    ctx.rotate(((clip.transform.rotation + animRot) * Math.PI) / 180);
    const sx = clip.transform.scale * animScale * kb.scale * (clip.transform.flipX ? -1 : 1);
    const sy = clip.transform.scale * animScale * kb.scale * (clip.transform.flipY ? -1 : 1);
    ctx.scale(sx, sy);

    if (clip.kind === "image" && clip.src) {
      const img = getOrLoadImage(mediaCache, clip.src, opts.onMediaReady);
      if (img) {
        ctx.filter = buildCssFilter(clip.color, scaleFactor);
        drawMediaElement(ctx, img, img.naturalWidth, img.naturalHeight, w, h, clip, scaleFactor);
        ctx.filter = "none";
      }
    } else if (clip.kind === "video" && clip.src) {
      const vid = getOrLoadVideo(mediaCache, clip.src, opts.onMediaReady);
      if (vid) {
        if (!opts.isExport) {
          const targetVidTime = Math.max(
            0,
            Math.min((vid.duration || 100) - 0.05, clip.trimStart + localTime * (clip.speed || 1))
          );
          if (Math.abs(vid.currentTime - targetVidTime) > 0.14) {
            try {
              vid.currentTime = targetVidTime;
            } catch {
              // ignore seek race during live scrub
            }
          }
        }
        ctx.filter = buildCssFilter(clip.color, scaleFactor);
        drawMediaElement(ctx, vid, vid.videoWidth || w, vid.videoHeight || h, w, h, clip, scaleFactor);
        ctx.filter = "none";
      }
    } else if (clip.kind === "text" || clip.kind === "caption") {
      drawTextOrCaptionClip(ctx, clip, w, localTime, scaleFactor);
    } else if (clip.kind === "sticker") {
      drawStickerClip(ctx, clip, scaleFactor);
    } else if (clip.kind === "shape") {
      drawShapeClip(ctx, clip, w, h, scaleFactor);
    }

    ctx.restore();

    // Clip-level full-frame post VFX (for media clips)
    if (clip.kind === "image" || clip.kind === "video") {
      applyPostVfx(ctx, clip.color, w, h, time);
    }

    if (transFadeBlack > 0.01) {
      ctx.save();
      ctx.fillStyle = `rgba(0,0,0,${transFadeBlack})`;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }
    if (transFlashWhite > 0.01) {
      ctx.save();
      ctx.fillStyle = `rgba(255,255,255,${Math.min(0.92, transFlashWhite)})`;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }
  }

  // 3. Global Instagram Overlays (Progress bar, Visualizer, Watermark)
  drawGlobalOverlays(ctx, project, w, h, time, totalDuration, scaleFactor, mediaCache);

  // 4. Preview-only Editor Guides (excluded from MP4 export)
  if (!opts.isExport) {
    const sel = opts.selectedClipId
      ? project.clips.find((c) => c.id === opts.selectedClipId) ?? null
      : null;
    drawEditorGuides(ctx, w, h, Boolean(opts.showSafeZone), Boolean(opts.showGrid), sel, time, scaleFactor);
  }

  ctx.restore();
}
