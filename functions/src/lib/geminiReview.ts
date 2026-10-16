import { DOCUMENTS, REVIEW_INSTRUCTIONS, reviewSchema, type DocumentImage, type ReviewRole } from "./documentReview";

export async function reviewDocuments(key: string, role: ReviewRole, images: DocumentImage[]) {
  const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent", {
    method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": key },
    signal: AbortSignal.timeout(90_000), // eslint-disable-line no-undef -- Node 22 global.
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: REVIEW_INSTRUCTIONS }] },
      contents: [{ role: "user", parts: [
        { text: `Role: ${role}. Required images: ${DOCUMENTS[role].join(", ")}. Today (UTC): ${new Date().toISOString().slice(0, 10)}.` },
        ...images.flatMap(image => [{ text: `Image label: ${image.kind}` }, { inlineData: { mimeType: image.mimeType, data: image.data } }]),
      ] }],
      generationConfig: { temperature: 0, maxOutputTokens: 4096, responseMimeType: "application/json", responseSchema: reviewSchema },
    }),
  });
  // Provider errors can contain request details: never log/return their body.
  if (!response.ok) throw new Error("Document review service unavailable");
  const body = await response.json() as { candidates?: { finishReason?: string; content?: { parts?: { text?: string; thought?: boolean }[] } }[] };
  const candidate = body.candidates?.[0];
  if (candidate?.finishReason !== "STOP") throw new Error("Document review incomplete");
  const text = candidate.content?.parts?.filter(part => !part.thought).map(part => part.text ?? "").join("");
  if (!text) throw new Error("Document review empty");
  return JSON.parse(text) as unknown;
}
