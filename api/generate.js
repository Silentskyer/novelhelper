const ALLOWED_MODELS = new Set([
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-2.5-pro",
  "gemini-2.0-flash",
]);

const MAX_PROMPT_LENGTH = 6000;
const MAX_OUTPUT_TOKENS = 4096;
const MAX_CONTINUATIONS = 2;

function setSecurityHeaders(res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
}

function sendError(res, statusCode, message) {
  setSecurityHeaders(res);
  res.status(statusCode).json({ error: message });
}

function getTextFromGemini(data) {
  const parts = data?.candidates?.[0]?.content?.parts ?? [];
  return parts
    .map((part) => (typeof part?.text === "string" ? part.text : ""))
    .join("\n")
    .trim();
}

function getFinishReason(data) {
  return data?.candidates?.[0]?.finishReason || "";
}

async function generateContent({ apiKey, model, contents, signal }) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents,
        generationConfig: {
          temperature: 0.95,
          topP: 0.9,
          maxOutputTokens: MAX_OUTPUT_TOKENS,
          responseMimeType: "text/plain",
        },
      }),
      signal,
    }
  );

  const data = await response.json();
  return { response, data };
}

module.exports = async function handler(req, res) {
  setSecurityHeaders(res);

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "只允許使用 POST。" });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return sendError(res, 500, "伺服器尚未設定 GEMINI_API_KEY。");
  }

  const contentType = req.headers["content-type"] || "";
  if (!contentType.includes("application/json")) {
    return sendError(res, 415, "請使用 JSON 格式送出資料。");
  }

  const prompt = typeof req.body?.prompt === "string" ? req.body.prompt.trim() : "";
  const model = typeof req.body?.model === "string" ? req.body.model.trim() : "";

  if (!prompt) {
    return sendError(res, 400, "缺少 prompt。");
  }

  if (prompt.length > MAX_PROMPT_LENGTH) {
    return sendError(res, 400, "輸入內容過長，請縮短後再試。");
  }

  if (!ALLOWED_MODELS.has(model)) {
    return sendError(res, 400, "不支援的模型。");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);

  try {
    const contents = [
      {
        role: "user",
        parts: [{ text: prompt }],
      },
    ];

    let combinedText = "";

    for (let attempt = 0; attempt <= MAX_CONTINUATIONS; attempt += 1) {
      const { response, data } = await generateContent({
        apiKey,
        model,
        contents,
        signal: controller.signal,
      });

      if (!response.ok) {
        const message = data?.error?.message || "Gemini 請求失敗。";
        return sendError(res, response.status, message);
      }

      const text = getTextFromGemini(data);
      const finishReason = getFinishReason(data);

      if (text) {
        combinedText = combinedText ? `${combinedText}\n\n${text}` : text;
      }

      if (finishReason !== "MAX_TOKENS" || attempt === MAX_CONTINUATIONS) {
        break;
      }

      contents.push({
        role: "model",
        parts: [{ text }],
      });
      contents.push({
        role: "user",
        parts: [
          {
            text: "請從上一段最後一句後面繼續，完整補完所有尚未回答的項目。不要重複前文，也不要重新開頭。",
          },
        ],
      });
    }

    if (!combinedText) {
      return sendError(res, 502, "AI 沒有回傳內容。");
    }

    return res.status(200).json({ text: combinedText });
  } catch (error) {
    if (error?.name === "AbortError") {
      return sendError(res, 504, "AI 回應逾時，請稍後再試。");
    }

    return sendError(res, 500, "伺服器處理請求時發生錯誤。");
  } finally {
    clearTimeout(timeout);
  }
};
