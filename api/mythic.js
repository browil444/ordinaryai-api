import crypto from "node:crypto";

const BASE = "https://notegpt.io";
const UA = "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Mobile Safari/537.36";

function uuid() {
  return crypto.randomUUID();
}

function randomNumber(length = 10) {
  let result = "";
  for (let i = 0; i < length; i++) result += Math.floor(Math.random() * 10);
  return result;
}

function makeSboxGuid() {
  const now = Math.floor(Date.now() / 1000);
  const raw = `${now}|762|${randomNumber(9)}`;
  return Buffer.from(raw).toString("base64");
}

function makeCookieHeader() {
  const now = Math.floor(Date.now() / 1000);
  const anonymousUserId = uuid();
  return [
    `_ga_PFX3BRW5RQ=GS2.1.s${now}$o1$g0$t${now}$j60$l0$h${randomNumber(9)}`,
    `_ga=GA1.2.${randomNumber(9)}.${now}`,
    `_gid=GA1.2.${randomNumber(9)}.${now}`,
    `_gat_gtag_UA_252982427_14=1`,
    `sbox-guid=${encodeURIComponent(makeSboxGuid())}`,
    `anonymous_user_id=${anonymousUserId}`,
  ].join("; ");
}

function toHistoryMessages(history) {
  return history.slice(-5).flatMap((item) => [
    { role: "user", content: item.user },
    { role: "assistant", content: item.assistant },
  ]);
}

function parseSSE(rawBody) {
  let answer = "";
  let reasoning = "";
  for (const line of rawBody.split(/\r?\n/)) {
    const clean = line.trim();
    if (!clean.startsWith("data:")) continue;
    const raw = clean.replace(/^data:\s*/, "").trim();
    if (!raw || raw === "[DONE]") continue;
    try {
      const json = JSON.parse(raw);
      if (json.reasoning) reasoning += json.reasoning;
      if (json.text) answer += json.text;
      if (json.done) break;
    } catch {}
  }
  return { answer, reasoning };
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { messages, system } = req.body || {};
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: "messages array required" });
  }

  // Build history pairs dari messages
  const history = [];
  for (let i = 0; i + 1 < messages.length; i += 2) {
    if (messages[i]?.role === "user" && messages[i + 1]?.role === "assistant") {
      history.push({ user: messages[i].content, assistant: messages[i + 1].content });
    }
  }
  const lastMsg = messages[messages.length - 1];
  const prompt = lastMsg?.content || "";

  const conversationId = uuid();
  const cookieHeader = makeCookieHeader();

  const payload = {
    message: prompt,
    language: "auto",
    model: "deepseek-v4-flash",
    tone: "default",
    length: "moderate",
    conversation_id: conversationId,
    image_urls: [],
    history_messages: toHistoryMessages(history),
    chat_mode: "deep_think",
  };

  try {
    const upstream = await fetch(`${BASE}/api/v2/chat/stream`, {
      method: "POST",
      headers: {
        "sec-ch-ua-platform": `"Android"`,
        "User-Agent": UA,
        "sec-ch-ua": `"Google Chrome";v="147", "Not.A/Brand";v="8", "Chromium";v="147"`,
        "Content-Type": "application/json",
        "sec-ch-ua-mobile": "?1",
        Accept: "*/*",
        Origin: BASE,
        "sec-fetch-site": "same-origin",
        "sec-fetch-mode": "cors",
        "sec-fetch-dest": "empty",
        Referer: `${BASE}/chat-deepseek`,
        "Accept-Encoding": "gzip, deflate, br, zstd",
        "Accept-Language": "id-ID,id;q=0.9",
        Cookie: cookieHeader,
        priority: "u=1, i",
      },
      body: JSON.stringify(payload),
    });

    const rawBody = await upstream.text();
    const { answer, reasoning } = parseSSE(rawBody);

    if (!answer && !reasoning) {
      return res.status(502).json({ error: "No response from upstream", raw: rawBody.slice(0, 500) });
    }

    // Kalau ada reasoning, tampilkan sebagai bagian jawaban (opsional bisa dipisah)
    const finalContent = answer || reasoning;

    return res.status(200).json({
      choices: [{ message: { role: "assistant", content: finalContent } }],
      model: "deepseek-v4-flash",
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
