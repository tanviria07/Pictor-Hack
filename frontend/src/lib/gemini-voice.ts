import { SYSTEM_PROMPT } from "./coach-prompts";

interface GeminiCoachRequest {
  apiKey: string;
  model: string;
  context: string;
  transcript: string;
}

interface GeminiGenerateResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
  error?: {
    message?: string;
  };
}

export async function requestGeminiCoachReply({
  apiKey,
  model,
  context,
  transcript,
}: GeminiCoachRequest): Promise<string> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      model,
    )}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: {
          parts: [{ text: SYSTEM_PROMPT }],
        },
        contents: [
          {
            role: "user",
            parts: [
              {
                text: `${context}\n\nUser said: ${transcript}`,
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 160,
        },
      }),
    },
  );

  const data = (await response.json()) as GeminiGenerateResponse;
  if (!response.ok) {
    throw new Error(data.error?.message || `Gemini request failed (${response.status}).`);
  }

  const text = data.candidates?.[0]?.content?.parts
    ?.map((part) => part.text || "")
    .join("")
    .trim();

  if (!text) {
    throw new Error("Gemini returned an empty voice coach response.");
  }

  return text;
}
