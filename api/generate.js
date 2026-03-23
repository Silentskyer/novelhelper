const ALLOWED_MODELS = new Set([
  "gemini-2.0-flash",
  "gemini-1.5-flash",
  "gemini-1.5-pro",
]);

const MAX_PROMPT_LENGTH = 6000;

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
  const timeout = setTimeout(() => controller.abort(), 25000);

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [{ text: prompt }],
            },
          ],
          generationConfig: {
            temperature: 0.95,
            topP: 0.9,
            maxOutputTokens: 1200,
          },
        }),
        signal: controller.signal,
      }
    );

    const data = await response.json();

    if (!response.ok) {
      const message = data?.error?.message || "Gemini 請求失敗。";
      return sendError(res, response.status, message);
    }

    const text = getTextFromGemini(data);
    if (!text) {
      return sendError(res, 502, "AI 沒有回傳內容。");
    }

    return res.status(200).json({ text });
  } catch (error) {
    if (error?.name === "AbortError") {
      return sendError(res, 504, "AI 回應逾時，請稍後再試。");
    }

    return sendError(res, 500, "伺服器處理請求時發生錯誤。");
  } finally {
    clearTimeout(timeout);
  }
};
