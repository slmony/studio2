import "dotenv/config";
import crypto from "crypto";
import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const MODEL_NAME = "gemini-4-hydrogen";
const TTS_MODEL_NAME = "gemini-3.8-flash-lite-tts";

const NARRATION_CACHE_DIR = path.resolve(__dirname, ".narration-cache");
if (!fs.existsSync(NARRATION_CACHE_DIR)) {
  fs.mkdirSync(NARRATION_CACHE_DIR, { recursive: true });
}

function getGeminiClient(apiVersion = "v1beta"): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("کلید API هوش مصنوعی در تنظیمات محیط سرور پیکربندی نشده است.");
  }
  return new GoogleGenAI({
    apiKey,
    apiVersion,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

function formatApiError(err: unknown): { status: number; message: string } {
  const raw = err instanceof Error ? err.message : String(err);
  if (raw.includes("403") || raw.includes("PERMISSION_DENIED") || raw.includes("API_KEY_INVALID")) {
    return {
      status: 403,
      message: "دسترسی به سرویس هوش مصنوعی برقرار نشد. لطفاً کلید API را در بخش Settings > Secrets بررسی کنید.",
    };
  }
  if (raw.includes("429") || raw.includes("RESOURCE_EXHAUSTED")) {
    return {
      status: 429,
      message: "سقف مجاز درخواست هوش مصنوعی موقتاً تکمیل شده است. لطفاً کمی بعد دوباره تلاش کنید.",
    };
  }
  return {
    status: 500,
    message: raw || "خطای غیرمنتظره در پردازش هوش مصنوعی رخ داد.",
  };
}

interface WordTiming {
  word: string;
  start: number;
  end: number;
}

/**
 * Parses a 16-bit mono/stereo WAV file from Gemini TTS, trims leading/trailing
 * dead silence so speech hits right on beat, and computes acoustic-aligned
 * word-by-word timings locked to the real spoken energy envelope.
 */
function processWavAndAlignWords(
  wavBuf: Buffer,
  text: string
): { trimmedWav: Buffer; duration: number; wordTimings: WordTiming[] } {
  // Locate 'data' chunk safely inside RIFF WAV
  let dataOffset = 44;
  let dataSize = Math.max(0, wavBuf.length - 44);
  let sampleRate = 24000;
  let numChannels = 1;
  let bitsPerSample = 16;

  if (wavBuf.length > 44 && wavBuf.toString("ascii", 0, 4) === "RIFF") {
    let pos = 12;
    while (pos + 8 <= wavBuf.length) {
      const chunkId = wavBuf.toString("ascii", pos, pos + 4);
      const chunkLen = wavBuf.readUInt32LE(pos + 4);
      if (chunkId === "fmt " && pos + 24 <= wavBuf.length) {
        numChannels = wavBuf.readUInt16LE(pos + 10) || 1;
        sampleRate = wavBuf.readUInt32LE(pos + 12) || 24000;
        bitsPerSample = wavBuf.readUInt16LE(pos + 22) || 16;
      } else if (chunkId === "data") {
        dataOffset = pos + 8;
        dataSize = Math.min(chunkLen, wavBuf.length - dataOffset);
        break;
      }
      pos += 8 + chunkLen + (chunkLen % 2);
    }
  }

  const bytesPerSample = Math.max(1, bitsPerSample / 8);
  const blockAlign = bytesPerSample * numChannels;
  const totalSamples = Math.floor(dataSize / blockAlign);

  if (totalSamples < 240) {
    const words = text.trim().split(/\s+/).filter(Boolean);
    const dur = Math.max(0.5, totalSamples / sampleRate);
    return {
      trimmedWav: wavBuf,
      duration: dur,
      wordTimings: words.map((w, i) => ({
        word: w,
        start: Number(((i / Math.max(1, words.length)) * dur).toFixed(3)),
        end: Number((((i + 1) / Math.max(1, words.length)) * dur).toFixed(3)),
      })),
    };
  }

  // Extract mono Float32 samples
  const samples = new Float32Array(totalSamples);
  for (let i = 0; i < totalSamples; i++) {
    const byteIdx = dataOffset + i * blockAlign;
    samples[i] = wavBuf.readInt16LE(byteIdx) / 32768;
  }

  // Compute 10ms RMS energy frames
  const frameSize = Math.max(1, Math.floor(sampleRate * 0.01));
  const numFrames = Math.floor(totalSamples / frameSize);
  const rms = new Float32Array(numFrames);
  let peakRms = 0.001;
  for (let f = 0; f < numFrames; f++) {
    let sum = 0;
    const base = f * frameSize;
    for (let j = 0; j < frameSize; j++) {
      const v = samples[base + j];
      sum += v * v;
    }
    const val = Math.sqrt(sum / frameSize);
    rms[f] = val;
    if (val > peakRms) peakRms = val;
  }

  const silenceThresh = Math.max(0.012, peakRms * 0.065);
  let startFrame = 0;
  while (startFrame < numFrames - 1 && rms[startFrame] < silenceThresh) startFrame++;
  let endFrame = numFrames - 1;
  while (endFrame > startFrame && rms[endFrame] < silenceThresh) endFrame--;

  // Keep 20ms natural attack and 70ms natural release
  startFrame = Math.max(0, startFrame - 2);
  endFrame = Math.min(numFrames - 1, endFrame + 7);

  const trimStartSample = startFrame * frameSize;
  const trimEndSample = Math.min(totalSamples, (endFrame + 1) * frameSize);
  const trimmedSampleCount = Math.max(frameSize, trimEndSample - trimStartSample);
  const trimmedDataBytes = trimmedSampleCount * blockAlign;

  // Compute active speech RMS so every TTS sentence matches one steady constant volume
  let activeSqSum = 0;
  let activeSampleCount = 0;
  for (let f = startFrame; f <= endFrame; f++) {
    if (rms[f] >= silenceThresh * 0.85) {
      const base = f * frameSize;
      for (let j = 0; j < frameSize && base + j < totalSamples; j++) {
        const s = samples[base + j];
        activeSqSum += s * s;
        activeSampleCount++;
      }
    }
  }
  const activeMeanRms = Math.sqrt(activeSqSum / Math.max(1, activeSampleCount));
  const targetRms = 0.22;
  const baseGain = Math.min(4.5, Math.max(0.4, targetRms / Math.max(0.015, activeMeanRms)));

  // Smooth slow 350ms loudness follower so intra-sentence dynamics stay completely even
  const winFrames = 35;
  const halfWin = Math.floor(winFrames / 2);
  const deClickSamples = Math.min(Math.floor(sampleRate * 0.003), Math.floor(trimmedSampleCount / 4));

  // Rebuild clean 44-byte RIFF WAV header for leveled, trimmed audio
  const trimmedWav = Buffer.alloc(44 + trimmedDataBytes);
  trimmedWav.write("RIFF", 0, "ascii");
  trimmedWav.writeUInt32LE(36 + trimmedDataBytes, 4);
  trimmedWav.write("WAVE", 8, "ascii");
  trimmedWav.write("fmt ", 12, "ascii");
  trimmedWav.writeUInt32LE(16, 16);
  trimmedWav.writeUInt16LE(1, 20); // PCM
  trimmedWav.writeUInt16LE(numChannels, 22);
  trimmedWav.writeUInt32LE(sampleRate, 24);
  trimmedWav.writeUInt32LE(sampleRate * blockAlign, 28);
  trimmedWav.writeUInt16LE(blockAlign, 32);
  trimmedWav.writeUInt16LE(bitsPerSample, 34);
  trimmedWav.write("data", 36, "ascii");
  trimmedWav.writeUInt32LE(trimmedDataBytes, 40);

  for (let i = 0; i < trimmedSampleCount; i++) {
    const srcSampleIdx = trimStartSample + i;
    const frameIdx = Math.min(numFrames - 1, Math.floor(srcSampleIdx / frameSize));
    let localSq = 0;
    let localCnt = 0;
    const fStart = Math.max(startFrame, frameIdx - halfWin);
    const fEnd = Math.min(endFrame, frameIdx + halfWin);
    for (let f = fStart; f <= fEnd; f++) {
      if (rms[f] >= silenceThresh * 0.85) {
        localSq += rms[f] * rms[f];
        localCnt++;
      }
    }
    const localRms = localCnt > 0 ? Math.sqrt(localSq / localCnt) : activeMeanRms;
    const agcRatio = Math.min(1.32, Math.max(0.76, activeMeanRms / Math.max(0.015, localRms)));
    let val = samples[srcSampleIdx] * baseGain * agcRatio;

    // Clean soft ceiling above 0.85 so peaks never clip or drop
    const absVal = Math.abs(val);
    if (absVal > 0.85) {
      val = Math.sign(val) * (0.85 + 0.09 * Math.tanh((absVal - 0.85) / 0.15));
    }

    // 3ms inaudible micro-declick at buffer edges
    if (i < deClickSamples) {
      val *= i / Math.max(1, deClickSamples);
    } else if (i >= trimmedSampleCount - deClickSamples) {
      val *= (trimmedSampleCount - 1 - i) / Math.max(1, deClickSamples);
    }

    const int16 = Math.max(-32768, Math.min(32767, Math.round(val * 32767)));
    for (let ch = 0; ch < numChannels; ch++) {
      const dstOffset = 44 + i * blockAlign + ch * bytesPerSample;
      trimmedWav.writeInt16LE(int16, dstOffset);
    }
  }

  const duration = Number((trimmedSampleCount / sampleRate).toFixed(3));
  const activeFrames = endFrame - startFrame + 1;

  // Build cumulative acoustic speech activity curve (pauses stay flat, speech rises)
  const cumActivity = new Float32Array(activeFrames + 1);
  for (let i = 0; i < activeFrames; i++) {
    const e = rms[startFrame + i];
    // Compress dynamic range with sqrt so quieter consonants still advance time while silence pauses flat
    const speechWeight = e > silenceThresh * 0.7 ? Math.pow(e / peakRms, 0.45) + 0.12 : 0.02;
    cumActivity[i + 1] = cumActivity[i] + speechWeight;
  }
  const totalActivity = Math.max(0.001, cumActivity[activeFrames]);

  // Compute Persian phonetic duration weights for every word
  const words = text.trim().split(/\s+/).filter(Boolean);
  const weights = words.map((w) => {
    const clean = w.replace(/[،؛.!؟:«»()\-]/g, "");
    let score = 0.9;
    for (const ch of clean) {
      if ("اویآ".includes(ch)) score += 0.62; // long Persian vowels
      else if (ch === "\u200c") score += 0.15; // ZWNJ half-space
      else score += 0.42;
    }
    if (/[،؛:]$/.test(w)) score += 1.4; // natural comma/semicolon pause
    if (/[.!؟]$/.test(w)) score += 1.1;
    return score;
  });

  const totalWeight = weights.reduce((a, b) => a + b, 0) || 1;
  const wordTimings: WordTiming[] = [];
  let accWeight = 0;
  let prevTime = 0;

  for (let wi = 0; wi < words.length; wi++) {
    accWeight += weights[wi];
    const targetAct = (accWeight / totalWeight) * totalActivity;

    // Binary search frame matching cumulative acoustic activity
    let lo = 0;
    let hi = activeFrames;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cumActivity[mid] < targetAct) lo = mid + 1;
      else hi = mid;
    }

    // Snap internal word boundaries toward local energy valley within ±80ms
    let bestFrame = lo;
    if (wi < words.length - 1) {
      const winStart = Math.max(1, lo - 8);
      const winEnd = Math.min(activeFrames - 2, lo + 8);
      let minRms = rms[startFrame + lo] ?? peakRms;
      for (let f = winStart; f <= winEnd; f++) {
        const val = rms[startFrame + f] ?? peakRms;
        if (val < minRms * 0.85) {
          minRms = val;
          bestFrame = f;
        }
      }
    } else {
      bestFrame = activeFrames;
    }

    const endTime = Math.min(
      duration,
      Math.max(prevTime + 0.06, Number(((bestFrame * frameSize) / sampleRate).toFixed(3)))
    );
    wordTimings.push({
      word: words[wi],
      start: Number(prevTime.toFixed(3)),
      end: wi === words.length - 1 ? duration : endTime,
    });
    prevTime = endTime;
  }

  return { trimmedWav, duration, wordTimings };
}

async function generateOrFetchCachedTts(params: {
  text: string;
  voiceName: string;
  style: string;
}): Promise<{ audioUrl: string; duration: number; wordTimings: WordTiming[] }> {
  const { text, voiceName, style } = params;
  const hash = crypto
    .createHash("sha256")
    .update(`v2-rms22|${TTS_MODEL_NAME}|${voiceName}|${style}|${text.trim()}`)
    .digest("hex")
    .slice(0, 20);

  const wavPath = path.join(NARRATION_CACHE_DIR, `${hash}.wav`);
  const metaPath = path.join(NARRATION_CACHE_DIR, `${hash}.json`);

  if (fs.existsSync(wavPath) && fs.existsSync(metaPath)) {
    const meta = JSON.parse(fs.readFileSync(metaPath, "utf-8")) as {
      duration: number;
      wordTimings: WordTiming[];
    };
    return {
      audioUrl: `/api/narration-cache/${hash}.wav`,
      duration: meta.duration,
      wordTimings: meta.wordTimings,
    };
  }

  const ai = getGeminiClient("v1beta");
  let response: Awaited<ReturnType<typeof ai.models.generateContent>> | null = null;
  let lastErr: unknown = null;

  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      response = await ai.models.generateContent({
        model: TTS_MODEL_NAME,
        contents: [
          {
            role: "user",
            parts: [
              {
                text: text.trim(),
                speechMetadata: {
                  style,
                },
              },
            ],
          },
        ],
        config: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName },
            },
          },
        },
      });
      break;
    } catch (err) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      if ((msg.includes("429") || msg.includes("RESOURCE_EXHAUSTED")) && attempt < 3) {
        await new Promise((r) => setTimeout(r, 4000 * (attempt + 1)));
        continue;
      }
      throw err;
    }
  }

  if (!response) {
    throw lastErr ?? new Error("پاسخ صوتی از سرویس گویندگی دریافت نشد.");
  }

  const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!base64Audio) {
    throw new Error("پاسخ صوتی از سرویس گویندگی دریافت نشد.");
  }

  const rawWav = Buffer.from(base64Audio, "base64");
  const { trimmedWav, duration, wordTimings } = processWavAndAlignWords(rawWav, text);

  fs.writeFileSync(wavPath, trimmedWav);
  fs.writeFileSync(metaPath, JSON.stringify({ duration, wordTimings }));

  return {
    audioUrl: `/api/narration-cache/${hash}.wav`,
    duration,
    wordTimings,
  };
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: "4mb" }));

  // Serve cached TTS WAV files directly with proper audio/wav content-type
  app.use(
    "/api/narration-cache",
    express.static(NARRATION_CACHE_DIR, {
      setHeaders: (res) => {
        res.setHeader("Content-Type", "audio/wav");
        res.setHeader("Cache-Control", "public, max-age=86400");
      },
    })
  );

  // 1. AI Reel Script & Scene Generator
  app.post("/api/ai/script", async (req, res) => {
    try {
      const { topic, tone = "حرفه‌ای و پرانرژی", durationSeconds = 15 } = req.body ?? {};
      if (!topic || typeof topic !== "string" || !topic.trim()) {
        return res.status(400).json({ error: "لطفاً موضوع ریلز را وارد کنید." });
      }

      const ai = getGeminiClient();
      const response = await ai.models.generateContent({
        model: MODEL_NAME,
        contents: `موضوع ریلز اینستاگرام: "${topic.trim()}"
لحن: ${tone}
مدت زمان کل هدف: حدود ${Math.max(8, Math.min(45, Number(durationSeconds) || 15))} ثانیه.
یک سناریوی دقیق و وایرال فارسی برای ریلز ۹:۱۶ بساز که شامل ۳ تا ۵ صحنه کوتاه و ریتمیک باشد. هر صحنه تیتر کوتاه روی تصویر (حداکثر ۵ کلمه)، زیرنویس گفتاری کوتاه و طبیعی، مدت زمان به ثانیه، پیشنهاد فیلتر رنگی (از میان: cinematic-warm, neon-night, kodak-film, noir-bw, pastel-soft, golden-hour, nordic-cool, magazine-sharp, dramatic) و پیشنهاد انیمیشن ورود (از میان: fade, slide-up, pop, zoom-in, typewriter) داشته باشد.`,
        config: {
          systemInstruction:
            "تو یک کارگردان حرفه‌ای ریلز اینستاگرام و کپی‌رایتر ارشد فارسی هستی. همیشه خروجی تمیز، کوتاه، مدرن و مناسب صفحه موبایل ۹:۱۶ تولید کن.",
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              projectTitle: { type: Type.STRING },
              hookText: { type: Type.STRING },
              ctaText: { type: Type.STRING },
              suggestedMusic: {
                type: Type.STRING,
                description: "One of: lofi-night, cinema-ambient, reels-pulse, deep-bass",
              },
              scenes: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    headline: { type: Type.STRING },
                    caption: { type: Type.STRING },
                    duration: { type: Type.NUMBER },
                    filterPreset: { type: Type.STRING },
                    animation: { type: Type.STRING },
                    visualTheme: {
                      type: Type.STRING,
                      description: "One of: luxury, urban, coffee, abstract, editorial",
                    },
                  },
                  required: ["headline", "caption", "duration", "filterPreset", "animation", "visualTheme"],
                },
              },
            },
            required: ["projectTitle", "hookText", "ctaText", "suggestedMusic", "scenes"],
          },
        },
      });

      const parsed = JSON.parse((response.text ?? "{}").trim());
      return res.json(parsed);
    } catch (err) {
      const formatted = formatApiError(err);
      return res.status(formatted.status).json({ error: formatted.message });
    }
  });

  // 2. AI Auto Timed Captions (Karaoke segments)
  app.post("/api/ai/captions", async (req, res) => {
    try {
      const { scriptText, totalDuration = 12 } = req.body ?? {};
      if (!scriptText || typeof scriptText !== "string" || !scriptText.trim()) {
        return res.status(400).json({ error: "لطفاً متن یا سناریوی گفتاری را وارد کنید." });
      }

      const ai = getGeminiClient();
      const targetSec = Math.max(4, Math.min(60, Number(totalDuration) || 12));
      const response = await ai.models.generateContent({
        model: MODEL_NAME,
        contents: `متن زیر را به جملات کوتاه و خوش‌ریتم زیرنویس ریلز اینستاگرام (هر بخش ۳ تا ۶ کلمه) تقسیم کن و زمان شروع و مدت زمان هر بخش را طوری تنظیم کن که در مجموع حدود ${targetSec} ثانیه باشد. متن را فارسی، روان و بدون علامت اضافه بنویس:
"""
${scriptText.trim()}
"""`,
        config: {
          systemInstruction:
            "تو متخصص زیرنویس پویا و کارائوکه ریلز فارسی هستی. زیرنویس‌ها باید کوتاه، خوانا و بدون همپوشانی زمانی باشند.",
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              segments: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    start: { type: Type.NUMBER },
                    duration: { type: Type.NUMBER },
                    text: { type: Type.STRING },
                  },
                  required: ["start", "duration", "text"],
                },
              },
            },
            required: ["segments"],
          },
        },
      });

      const parsed = JSON.parse((response.text ?? "{}").trim());
      return res.json(parsed);
    } catch (err) {
      const formatted = formatApiError(err);
      return res.status(formatted.status).json({ error: formatted.message });
    }
  });

  // 3. AI Social Kit (Captions, Hashtags, Viral Hooks, Cover Titles)
  app.post("/api/ai/social-kit", async (req, res) => {
    try {
      const { topic, audience = "مخاطب عمومی اینستاگرام" } = req.body ?? {};
      if (!topic || typeof topic !== "string" || !topic.trim()) {
        return res.status(400).json({ error: "لطفاً موضوع ویدیو را وارد کنید." });
      }

      const ai = getGeminiClient();
      const response = await ai.models.generateContent({
        model: MODEL_NAME,
        contents: `برای یک ریلز اینستاگرام درباره "${topic.trim()}" با مخاطب "${audience}" تولید کن:
1) سه کپشن متفاوت فارسی (کوتاه وایرال، داستانی تعاملی، فروشگاهی/حرفه‌ای)
2) دوازده هشتگ هدفمند فارسی و انگلیسی
3) پنج هوک ۳ ثانیه اول برای جذب مخاطب
4) سه تیتر کوتاه و کوبنده برای کاور ریلز`,
        config: {
          systemInstruction:
            "تو استراتژیست رشد اینستاگرام فارسی هستی. متن‌های طبیعی، بدون کلیشه و با تعامل بالا بنویس.",
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              captions: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    style: { type: Type.STRING },
                    text: { type: Type.STRING },
                  },
                  required: ["style", "text"],
                },
              },
              hashtags: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
              hooks: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
              coverTitles: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
            },
            required: ["captions", "hashtags", "hooks", "coverTitles"],
          },
        },
      });

      const parsed = JSON.parse((response.text ?? "{}").trim());
      return res.json(parsed);
    } catch (err) {
      const formatted = formatApiError(err);
      return res.status(formatted.status).json({ error: formatted.message });
    }
  });

  // 4. AI Style & Color Director
  app.post("/api/ai/style-director", async (req, res) => {
    try {
      const { mood } = req.body ?? {};
      if (!mood || typeof mood !== "string" || !mood.trim()) {
        return res.status(400).json({ error: "لطفاً حس‌وحال یا سبک دلخواه ویدیو را بنویسید." });
      }

      const ai = getGeminiClient();
      const response = await ai.models.generateContent({
        model: MODEL_NAME,
        contents: `کاربر این سبک و حس‌وحال را برای ریلز اینستاگرام می‌خواهد: "${mood.trim()}"
یک پکیج کارگردانی بصری دقیق پیشنهاد بده شامل: نام سبک فارسی، توضیح کوتاه دلیل انتخاب، شناسه فیلتر رنگی (یکی از: cinematic-warm, neon-night, kodak-film, noir-bw, pastel-soft, golden-hour, nordic-cool, vhs-retro, magazine-sharp, dramatic)، فونت پیشنهادی (یکی از: Vazirmatn, Lalezar, Rubik, Amiri, Gulzar)، رنگ اصلی هگز (accentColor)، رنگ متن هگز (textColor)، ترنزیشن (یکی از: dissolve, fade-black, slide-left, slide-up, zoom-burst, wipe, flash-white, spin) و موزیک (یکی از: lofi-night, cinema-ambient, reels-pulse, deep-bass).`,
        config: {
          systemInstruction:
            "تو مدیر هنری و کالرگریدر ویدیوهای اینستاگرام هستی. ترکیب‌های رنگی خوانا و حرفه‌ای با کنتراست عالی پیشنهاد بده.",
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              styleName: { type: Type.STRING },
              rationale: { type: Type.STRING },
              filterPreset: { type: Type.STRING },
              fontFamily: { type: Type.STRING },
              accentColor: { type: Type.STRING },
              textColor: { type: Type.STRING },
              transition: { type: Type.STRING },
              musicId: { type: Type.STRING },
            },
            required: [
              "styleName",
              "rationale",
              "filterPreset",
              "fontFamily",
              "accentColor",
              "textColor",
              "transition",
              "musicId",
            ],
          },
        },
      });

      const parsed = JSON.parse((response.text ?? "{}").trim());
      return res.json(parsed);
    } catch (err) {
      const formatted = formatApiError(err);
      return res.status(formatted.status).json({ error: formatted.message });
    }
  });

  // 5. AI Young Male Voiceover TTS with Acoustic Word-by-Word Alignment
  app.post("/api/ai/tts", async (req, res) => {
    try {
      const {
        text,
        voiceName = "Puck",
        style = "Consistent, steady, confident young Persian male commercial narrator, uniform calm-confident tone, constant microphone proximity and steady constant volume throughout without shouting or whispering",
      } = req.body ?? {};

      if (!text || typeof text !== "string" || !text.trim()) {
        return res.status(400).json({ error: "متن نریشن نمی‌تواند خالی باشد." });
      }

      const validVoices = new Set(["Puck", "Fenrir", "Charon", "Kore", "Zephyr"]);
      const safeVoice = validVoices.has(voiceName) ? voiceName : "Puck";

      const result = await generateOrFetchCachedTts({
        text: text.trim(),
        voiceName: safeVoice,
        style,
      });

      return res.json(result);
    } catch (err) {
      const formatted = formatApiError(err);
      return res.status(formatted.status).json({ error: formatted.message });
    }
  });

  // 6. Acoustic + Gemini Word-by-Word Timestamp Alignment for Uploaded Audio
  app.post("/api/ai/align-audio", async (req, res) => {
    try {
      const { audioPath, words } = req.body ?? {};
      if (!audioPath || typeof audioPath !== "string") {
        return res.status(400).json({ error: "مسیر فایل صوتی الزامی است." });
      }
      const cleanRel = audioPath.replace(/^\/+/, "");
      const resolved = path.resolve(__dirname, "public", cleanRel);
      if (!resolved.startsWith(path.resolve(__dirname, "public")) || !fs.existsSync(resolved)) {
        return res.status(404).json({ error: "فایل صوتی یافت نشد." });
      }

      const wavBuf = fs.readFileSync(resolved);
      const b64 = wavBuf.toString("base64");
      const ai = getGeminiClient("v1beta");

      const wordPrompt = Array.isArray(words) && words.length > 0
        ? `Listen carefully to the attached Persian narration audio. Return exact start and end timestamps (in seconds, floating point with 2 decimals, monotonically increasing) for EVERY SINGLE word in this exact ordered list:\n${JSON.stringify(words)}`
        : "Transcribe every spoken word in the attached Persian narration audio with exact start and end timestamps (in seconds).";

      const response = await ai.models.generateContent({
        model: MODEL_NAME,
        contents: [
          {
            role: "user",
            parts: [
              { inlineData: { mimeType: "audio/wav", data: b64 } },
              { text: wordPrompt },
            ],
          },
        ],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                word: { type: Type.STRING },
                start: { type: Type.NUMBER },
                end: { type: Type.NUMBER },
              },
              required: ["word", "start", "end"],
            },
          },
        },
      });

      const rawTimings = JSON.parse((response.text ?? "[]").trim()) as WordTiming[];
      return res.json({ wordTimings: rawTimings });
    } catch (err) {
      const formatted = formatApiError(err);
      return res.status(formatted.status).json({ error: formatted.message });
    }
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Kadr Studio server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
