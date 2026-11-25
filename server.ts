import "dotenv/config";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const MODEL_NAME = "gemini-4-hydrogen";

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("کلید API هوش مصنوعی در تنظیمات محیط سرور پیکربندی نشده است.");
  }
  return new GoogleGenAI({
    apiKey,
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

async function startServer() {
  const app = express();
  app.use(express.json({ limit: "2mb" }));

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
