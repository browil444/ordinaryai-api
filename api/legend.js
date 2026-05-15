import crypto from "node:crypto";

const API = "https://api.overchat.ai/v1/chat/completions";

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

  const systemMessage = {
    id: crypto.randomUUID(),
    role: "system",
    content: system || "Ikuti bahasa user dan jawab dengan gaya natural, singkat, dan jelas.",
  };

  const formattedMessages = messages.map((m) => ({
    id: crypto.randomUUID(),
    role: m.role,
    content: m.content,
  }));

  const body = {
    chatId,
    model: "openai/gpt-4o",
    messages: [systemMessage, ...formattedMessages],
    personaId: "gpt-4o-landing",
    frequency_penalty: 0,
    max_tokens: 4000,
    presence_penalty: 0,
    stream: false,
    temperature: 0.7,
    top_p: 0.95,
  };

  try {
    const upstream = await fetch(API, {
      method: "POST",
      headers: {
        "sec-ch-ua-platform": `"Android"`,
        "x-device-uuid": deviceId,
        "sec-ch-ua": `"Google Chrome";v="147", "Not.A/Brand";v="8", "Chromium";v="147"`,
        "sec-ch-ua-mobile": "?1",
        "x-device-language": "id-ID",
        "x-device-platform": "web",
        "x-device-version": "1.0.44",
        "user-agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Mobile Safari/537.36",
        accept: "application/json",
        "content-type": "application/json",
        origin: "https://overchat.ai",
        referer: "https://overchat.ai/",
        "accept-language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
        priority: "u=1, i",
      },
      body: JSON.stringify(body),
    });

    if (!upstream.ok) {
      const text = await upstream.text();
      return res.status(502).json({ error: "Upstream error", detail: text.slice(0, 500) });
    }

    const data = await upstream.json();
    const content = data?.choices?.[0]?.message?.content;

    if (!content) {
      return res.status(502).json({ error: "No content in response", raw: JSON.stringify(data).slice(0, 500) });
    }

    return res.status(200).json({
      choices: [{ message: { role: "assistant", content } }],
      model: "gpt-4o",
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
