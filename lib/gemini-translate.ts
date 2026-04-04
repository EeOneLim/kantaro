// Shared Gemini translation utilities used by both /api/lyrics and /api/translate.
// Kept server-side only — never imported from client components.

import { GoogleGenerativeAI } from "@google/generative-ai";

// Translate in batches so we never exceed Gemini's input token limit in one call.
const TRANSLATION_CHUNK_SIZE = 80;

// Model fallback chain — tries each in order, moves to the next on any error.
// gemini-2.5-flash-lite is the cheapest/fastest but prone to 503s under high demand.
const GEMINI_MODELS = [
  "gemini-2.5-flash-lite",
  "gemini-2.0-flash-lite",
  "gemini-2.0-flash",
];

// Split lines into chunks and translate all chunks in parallel.
// Firing chunks simultaneously cuts total translation time from
// (N × avg_chunk_time) down to max(chunk_times) — typically 3× faster.
export async function translateInChunks(lines: string[]): Promise<string[]> {
  const chunks: string[][] = [];
  for (let i = 0; i < lines.length; i += TRANSLATION_CHUNK_SIZE) {
    chunks.push(lines.slice(i, i + TRANSLATION_CHUNK_SIZE));
  }
  const translatedChunks = await Promise.all(chunks.map(translateWithGemini));
  return translatedChunks.flat();
}

// Translate one chunk of Spanish lyric lines to English using Gemini.
async function translateWithGemini(lines: string[]): Promise<string[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey.startsWith("your_")) {
    console.warn("[gemini-translate] GEMINI_API_KEY not configured — skipping translation");
    return lines.map(() => "");
  }

  const prompt = `You are translating Spanish song lyrics to English.
Translate each numbered line with musical and poetic intent — natural and flowing, not word-for-word literal.
Preserve the emotional tone and rhythm of the original.
Return ONLY a valid JSON array of strings, one English translation per line, in the same order.
Do not include any markdown, code blocks, or explanation.

Spanish lines:
${lines.map((l, i) => `${i + 1}. ${l}`).join("\n")}`;

  const raw = (await callGeminiWithFallback(apiKey, prompt)).trim();

  // Strip markdown code fences if Gemini wraps its response anyway.
  const cleaned = raw
    .replace(/^```(?:json)?\n?/, "")
    .replace(/\n?```$/, "")
    .trim();

  const parsed = JSON.parse(cleaned);

  if (!Array.isArray(parsed)) {
    throw new Error("Gemini response was not a JSON array");
  }

  // Gemini occasionally returns 1-2 extra items or drops one.
  // Trim any excess; pad with "" so callers fall back to Spanish for missing lines.
  return lines.map((_, i) => (parsed[i] as string) ?? "");
}

export async function callGeminiWithFallback(
  apiKey: string,
  prompt: string
): Promise<string> {
  let lastError: unknown;
  for (const modelName of GEMINI_MODELS) {
    try {
      const genai = new GoogleGenerativeAI(apiKey);
      const model = genai.getGenerativeModel({ model: modelName });
      const result = await model.generateContent(prompt);
      if (modelName !== GEMINI_MODELS[0]) {
        console.log(`[gemini-translate] Used fallback model: ${modelName}`);
      }
      return result.response.text();
    } catch (err) {
      console.warn(
        `[gemini-translate] Model ${modelName} failed, trying next:`,
        (err as Error).message
      );
      lastError = err;
    }
  }
  throw lastError;
}
