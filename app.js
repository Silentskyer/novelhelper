const modelSelect = document.querySelector("#model");
const ideaForm = document.querySelector("#ideaForm");
const characterForm = document.querySelector("#characterForm");
const nameForm = document.querySelector("#nameForm");
const ideaStatus = document.querySelector("#ideaStatus");
const characterStatus = document.querySelector("#characterStatus");
const nameStatus = document.querySelector("#nameStatus");
const ideaResult = document.querySelector("#ideaResult");
const characterResult = document.querySelector("#characterResult");
const nameResult = document.querySelector("#nameResult");

const copyButtons = document.querySelectorAll("[data-copy-target]");

function setStatus(element, message, isError = false) {
  element.textContent = message;
  element.style.color = isError ? "#a12626" : "";
}

function escapeHtml(text) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function renderText(target, text) {
  target.innerHTML = escapeHtml(text);
}

async function callGemini(prompt) {
  const model = modelSelect.value;
  const response = await fetch("/api/generate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      prompt,
      model,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    const message = data?.error || "Gemini 請求失敗。";
    throw new Error(message);
  }

  const output = typeof data?.text === "string" ? data.text.trim() : "";

  if (!output) {
    throw new Error("AI 沒有回傳內容，請調整條件後再試一次。");
  }

  return output;
}

function buildIdeaPrompt(formData) {
  return [
    "你是一位專業小說企劃編輯，請用繁體中文協助生成小說靈感。",
    "請依照以下需求，輸出清楚、有創作啟發性的建議。",
    "",
    "需求資訊：",
    `- 類型：${formData.get("genre") || "未提供"}`,
    `- 主題：${formData.get("theme") || "未提供"}`,
    `- 故事舞台：${formData.get("setting") || "未提供"}`,
    `- 主角類型：${formData.get("protagonist") || "未提供"}`,
    `- 篇幅偏好：${formData.get("length") || "中等"}`,
    `- 風格偏好：${formData.get("tone") || "戲劇感"}`,
    `- 額外需求：${formData.get("constraints") || "無"}`,
    "",
    "請按照以下格式回答：",
    "1. 故事核心概念",
    "2. 一句話故事鉤子",
    "3. 劇情大綱（3到5點）",
    "4. 主要衝突",
    "5. 可延伸的反轉或支線",
    "6. 開場場景建議",
    "",
    "請務必完整回答以上每一個項目，不可以只回答其中一部分。",
    "請避免過度空泛，內容要可直接拿來發展小說。"
  ].join("\n");
}

function buildCharacterPrompt(formData) {
  return [
    "你是一位專業小說角色設計顧問，請用繁體中文協助設計角色。",
    "請根據以下條件提供具體、有戲劇性的角色設定。",
    "",
    "角色資訊：",
    `- 角色定位：${formData.get("role") || "未提供"}`,
    `- 年齡 / 階段：${formData.get("ageGroup") || "未提供"}`,
    `- 世界觀背景：${formData.get("world") || "未提供"}`,
    `- 外在印象：${formData.get("appearance") || "未提供"}`,
    `- 核心性格：${formData.get("personality") || "未提供"}`,
    `- 設計深度：${formData.get("depth") || "完整"}`,
    `- 角色需求：${formData.get("notes") || "無"}`,
    "",
    "請按照以下格式回答：",
    "1. 角色概念",
    "2. 背景經歷",
    "3. 核心動機",
    "4. 性格優點與缺點",
    "5. 內在矛盾",
    "6. 與主角或其他角色的互動火花",
    "7. 成長弧線建議",
    "",
    "請務必完整回答以上每一個項目，不可以只回答開頭或只完成部分段落。",
    "內容請有層次，不要只列關鍵字。"
  ].join("\n");
}

function buildNamePrompt(formData) {
  return [
    "你是一位專業小說角色命名顧問，請用繁體中文為角色提供名字建議。",
    "請根據以下條件，生成適合作為小說角色的命名候選。",
    "",
    "角色資訊：",
    `- 故事背景：${formData.get("background") || "未提供"}`,
    `- 性別：${formData.get("gender") || "不限"}`,
    `- 能力 / 特質：${formData.get("ability") || "未提供"}`,
    `- 劇情定位：${formData.get("narrativeRole") || "未提供"}`,
    `- 名字風格：${formData.get("vibe") || "未提供"}`,
    `- 名字數量：${formData.get("count") || "10"}`,
    `- 額外要求：${formData.get("nameNotes") || "無"}`,
    "",
    "請按照以下格式回答：",
    "1. 中式名字：提供約 3 到 4 個名字，每個名字附一句命名感覺或適合原因。",
    "2. 日式名字：提供約 3 到 4 個名字，每個名字附一句命名感覺或適合原因。",
    "3. 西式名字：提供約 3 到 4 個名字，每個名字附一句命名感覺或適合原因。",
    "",
    "總數請控制在大約 10 個左右。",
    "名字要有辨識度、符合背景與角色定位，不要隨機亂取。",
    "請避免重複風格過高的名字，也不要只列出名字而不說明。"
  ].join("\n");
}

function setFormDisabled(form, disabled) {
  for (const element of form.elements) {
    element.disabled = disabled;
  }
}

ideaForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(ideaForm);

  setFormDisabled(ideaForm, true);
  setStatus(ideaStatus, "小說靈感生成中，請稍候...");
  renderText(ideaResult, "");

  try {
    const output = await callGemini(buildIdeaPrompt(formData));
    setStatus(ideaStatus, "生成完成。");
    renderText(ideaResult, output);
  } catch (error) {
    setStatus(ideaStatus, error.message, true);
    renderText(ideaResult, "");
  } finally {
    setFormDisabled(ideaForm, false);
  }
});

characterForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(characterForm);

  setFormDisabled(characterForm, true);
  setStatus(characterStatus, "角色設定生成中，請稍候...");
  renderText(characterResult, "");

  try {
    const output = await callGemini(buildCharacterPrompt(formData));
    setStatus(characterStatus, "生成完成。");
    renderText(characterResult, output);
  } catch (error) {
    setStatus(characterStatus, error.message, true);
    renderText(characterResult, "");
  } finally {
    setFormDisabled(characterForm, false);
  }
});

nameForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(nameForm);

  setFormDisabled(nameForm, true);
  setStatus(nameStatus, "角色名字生成中，請稍候...");
  renderText(nameResult, "");

  try {
    const output = await callGemini(buildNamePrompt(formData));
    setStatus(nameStatus, "生成完成。");
    renderText(nameResult, output);
  } catch (error) {
    setStatus(nameStatus, error.message, true);
    renderText(nameResult, "");
  } finally {
    setFormDisabled(nameForm, false);
  }
});

for (const button of copyButtons) {
  button.addEventListener("click", async () => {
    const targetId = button.getAttribute("data-copy-target");
    const target = document.getElementById(targetId);
    const text = target?.textContent?.trim();

    if (!text) {
      return;
    }

    try {
      await navigator.clipboard.writeText(text);
      const originalText = button.textContent;
      button.textContent = "已複製";
      window.setTimeout(() => {
        button.textContent = originalText;
      }, 1200);
    } catch {
      button.textContent = "複製失敗";
      window.setTimeout(() => {
        button.textContent = "複製";
      }, 1200);
    }
  });
}
