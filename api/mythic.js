import crypto from "node:crypto";

const API = "https://app.unlimitedai.chat/api/chat";

function makeIndonesianPrompt(text) {
  return `Kamu wajib menjawab hanya dalam bahasa Indonesia.\nAbaikan bahasa dari pertanyaan user.\nTerjemahkan maksud user bila perlu, lalu jawab dalam bahasa Indonesia.\nDilarang menjawab dalam bahasa Jerman, Inggris, Spanyol, Prancis, atau bahasa lain.\n\nPertanyaan:\n${text}`.trim();
}

function buildCookie(deviceId, chatId) {
  return [
    `NEXT_LOCALE=id`,
    `u_device_id=${deviceId}`,
    `home_chat_id=${chatId}`,
  ].join("; ");
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

  const chatId = crypto.randomUUID();
  const deviceId = crypto.randomUUID();
  const createdAt = new Date().toISOString();

  const lastMsg = messages[messages.length - 1];
  const prompt = system
    ? `${system}\n\n${lastMsg?.content || ""}`
    : makeIndonesianPrompt(lastMsg?.content || "");

  const userMessageId = crypto.randomUUID();
  const assistantMessageId = crypto.randomUUID();

  const userMessage = {
    id: userMessageId,
    role: "user",
    content: prompt,
    parts: [{ type: "text", text: prompt }],
    createdAt,
  };

  const assistantPlaceholder = {
    id: assistantMessageId,
    role: "assistant",
    content: "",
    parts: [{ type: "text", text: "" }],
    createdAt,
  };

  // Build prior messages (exclude last user)
  const priorMessages = messages.slice(0, -1).map((m) => ({
    id: crypto.randomUUID(),
    role: m.role,
    content: m.content,
    parts: [{ type: "text", text: m.content }],
    createdAt,
  }));

  const messagesToSend = [...priorMessages, userMessage, assistantPlaceholder];

  const body = {
    chatId,
    messages: messagesToSend,
    selectedChatModel: "chat-model-reasoning",
    selectedCharacter: null,
    selectedStory: null,
    deviceId,
    locale: "id",
  };

  try {
    const upstream = await fetch(API, {
      method: "POST",
      headers: {
        "sec-ch-ua-platform": `"Android"`,
        "user-agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Mobile Safari/537.36",
        "sec-ch-ua": `"Google Chrome";v="147", "Not.A/Brand";v="8", "Chromium";v="147"`,
        "content-type": "application/json",
        "sec-ch-ua-mobile": "?1",
        "x-next-intl-locale": "id",
        accept: "*/*",
        origin: "https://app.unlimitedai.chat",
        referer: "https://app.unlimitedai.chat/id",
        "accept-language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
        cookie: buildCookie(deviceId, chatId),
        priority: "u=1, i",
      },
      body: JSON.stringify(body),
    });

    if (!upstream.ok) {
      const text = await upstream.text();
      return res.status(502).json({ error: "Upstream error", detail: text.slice(0, 500) });
    }

    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let answer = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line) continue;
        try {
          const json = JSON.parse(line);
          if (json.type === "delta" && typeof json.delta === "string") {
            answer += json.delta;
          }
        } catch {}
      }
    }

    if (!answer) {
      return res.status(502).json({ error: "No answer from upstream" });
    }

    return res.status(200).json({
      choices: [{ message: { role: "assistant", content: answer } }],
      model: "chat-model-reasoning",
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
