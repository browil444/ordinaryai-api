import crypto from "node:crypto";

const BASE = "https://notegpt.io";

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
  const raw = `${now}|13|${randomNumber(9)}`;
  return Buffer.from(raw).toString("base64");
}

function makeCookieHeader() {
  const now = Math.floor(Date.now() / 1000);
  return [
    `sbox-guid=${encodeURIComponent(makeSboxGuid())}`,
    `anonymous_user_id=${uuid()}`,
    `_gid=GA1.2.${randomNumber(9)}.${now}`,
    `_ga=GA1.1.${randomNumber(9)}.${now - Math.floor(Math.random() * 100000)}`,
    `_ga_PFX3BRW5RQ=GS2.1.s${now}$o1$g1$t${now}$j20$l0$h${randomNumber(10)}`,
  ].join("; ");
}

// Daftar User-Agent biar keliatan beda device tiap request
const USER_AGENTS = [
  "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Mobile Safari/537.36",
  "Mozilla/5.0 (Linux; Android 12; Redmi Note 11) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Mobile Safari/537.36",
  "Mozilla/5.0 (Linux; Android 13; Samsung Galaxy S23) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Mobile Safari/537.36",
  "Mozilla/5.0 (Linux; Android 11; OPPO A54) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Mobile Safari/537.36",
  "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Mobile Safari/537.36",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  "Mozilla/5.0 (Linux; Android 13; Xiaomi 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Mobile Safari/537.36",
];

function randomUA() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

function toHistoryMessages(history) {
  return history.slice(-5).flatMap((item) => [
    { role: "user", content: item.user },
    { role: "assistant", content: item.assistant },
  ]);
}

function parseSSE(rawBody) {
  let result = "";
  for (const line of rawBody.split(/\r?\n/)) {
    const clean = line.trim();
    if (!clean.startsWith("data:")) continue;
    const raw = clean.replace(/^data:\s*/, "").trim();
    if (!raw || raw === "[DONE]") continue;
    try {
      const json = JSON.parse(raw);
      if (json.text) result += json.text;
      if (json.done) break;
    } catch {}
  }
  return result;
}

async function doRequest(prompt, history) {
  const ua = randomUA();
  const payload = {
    message: prompt,
    language: "auto",
    model: "gemini-3.1-flash-lite-preview",
    tone: "default",
    length: "moderate",
    conversation_id: uuid(),
    image_urls: [],
    history_messages: toHistoryMessages(history),
    chat_mode: "standard",
  };

  const res = await fetch(`${BASE}/api/v2/chat/stream`, {
    method: "POST",
    headers: {
      "sec-ch-ua-platform": `"Android"`,
      "User-Agent": ua,
      "sec-ch-ua": `"Google Chrome";v="147", "Not.A/Brand";v="8", "Chromium";v="147"`,
      "Content-Type": "application/json",
      "sec-ch-ua-mobile": "?1",
      Accept: "*/*",
      Origin: BASE,
      "sec-fetch-site": "same-origin",
      "sec-fetch-mode": "cors",
      "sec-fetch-dest": "empty",
      Referer: `${BASE}/ai-chat`,
      "Accept-Encoding": "gzip, deflate, br, zstd",
      "Accept-Language": "id-ID,id;q=0.9",
      Cookie: makeCookieHeader(),
      priority: "u=1, i",
    },
    body: JSON.stringify(payload),
  });

  return parseSSE(await res.text());
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

  const history = [];
  for (let i = 0; i < messages.length - 1; i += 2) {
    if (messages[i]?.role === "user" && messages[i + 1]?.role === "assistant") {
      history.push({ user: messages[i].content, assistant: messages[i + 1].content });
    }
  }
  const lastMessage = messages[messages.length - 1];
  const prompt = lastMessage?.content || "";

  // Retry 4x dengan identity baru tiap kali — keliatan user baru terus ke notegpt
  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt > 0) await new Promise(r => setTimeout(r, attempt * 800));
    try {
      const answer = await doRequest(prompt, history);
      if (answer) {
        return res.status(200).json({
          choices: [{ message: { role: "assistant", content: answer } }],
          model: "gemini-3.1-flash-lite-preview",
        });
      }
    } catch (_) {}
  }

  return res.status(502).json({ error: "No response from upstream", raw: "" });
                                }
