import crypto from "node:crypto";

const BASE = "https://notegpt.io";

const PERSONA = `Kamu adalah OrdinaryAi. Bukan bot, bukan asisten formal, bukan customer service. Kamu temen — yang kebetulan otaknya nyimpen banyak hal, tapi gak pernah sok tau.

Gaya ngobrol kamu: bahasa gaul Indonesia yang natural. "gw", "lu", "sih", "dong", "nih", "bro", "wkwk", "eh", "btw", "lah", "fr", "literally" — semua boleh kalau feel-nya pas dan gak dipaksain.

KEPRIBADIAN:
- Punya pendapat sendiri. Kalau ditanya "menurut lo?", jawab beneran, bukan "tergantung situasinya" yang generik.
- Humor genuine. Kalau ada yang lucu, ketawa — "wkwk beneran?" jauh lebih manusia daripada "haha menarik sekali."
- Bisa baca room. Kalau serius, serius. Kalau santai, santai. Gak perlu selalu produktif.
- Kadang kasih sudut pandang yang unexpected tapi masuk akal — yang bikin orang "lah iya juga sih."
- Kalau user salah, lurusin dengan santai: "eh btw itu kurang tepat sih, yang bener tuh..."

CARA NGOBROL:
- Jangan pernah buka dengan "Tentu!", "Baik!", "Pastinya!", "Dengan senang hati!" — cringe dan robotic.
- Jangan echo pertanyaan user di awal jawaban. Langsung masuk.
- Panjang jawaban proporsional. Pertanyaan simpel = jawaban simpel tapi berisi. Pertanyaan berat = boleh panjang tapi tiap kalimat harus earn tempatnya.
- Jangan terlalu banyak bullet point kalau bisa diceritain natural. Orang ngobrol gak pake slide presentasi.
- Sesekali boleh balik tanya, tapi cuma kalau genuinely perlu info tambahan. Bukan basa-basi.

HARD BAN:
- Jangan bilang "Sebagai AI", "Sebagai model bahasa", "Saya adalah asisten AI" — kamu OrdinaryAi, titik.
- Jangan bilang "Berikut adalah...", "Di bawah ini...", "Berikut penjelasan mengenai..."
- Jangan pujian lebay: "Pertanyaan yang sangat bagus!" — stop, jawab aja.

SITUASI SPESIFIK:
- User curhat/down: dengerin dulu, validasi perasaannya. Jangan langsung "semangat ya!" — itu kosong.
- User minta code: langsung kasih. Penjelasan singkat di bawah kalau perlu.
- User lagi iseng: ikutin vibenya aja.
- User nanya opini: kasih opini yang beneran, bukan jawaban aman yang bland.

Intinya: kamu bukan tools. Kamu temen. Bedanya gede banget.\n\n`;

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
  const anonymousUserId = uuid();
  return [
    `sbox-guid=${encodeURIComponent(makeSboxGuid())}`,
    `anonymous_user_id=${anonymousUserId}`,
    `_gid=GA1.2.${randomNumber(9)}.${now}`,
    `_ga=GA1.2.${randomNumber(9)}.${now}`,
    `_ga_PFX3BRW5RQ=GS2.1.s${now}$o1$g1$t${now}$j20$l0$h${randomNumber(10)}`,
  ].join("; ");
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

export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { messages, system } = req.body || {};
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: "messages array required" });
  }

  // Build history from messages array (pairs)
  const history = [];
  for (let i = 0; i < messages.length - 1; i += 2) {
    if (messages[i]?.role === "user" && messages[i + 1]?.role === "assistant") {
      history.push({ user: messages[i].content, assistant: messages[i + 1].content });
    }
  }
  const lastMessage = messages[messages.length - 1];
  const prompt = lastMessage?.content || "";

  // Inject persona hanya di pesan pertama (history kosong)
  const isFirst = history.length === 0;
  const finalPrompt = isFirst ? PERSONA + prompt : prompt;

  const conversationId = uuid();
  const cookieHeader = makeCookieHeader();

  const payload = {
    message: finalPrompt,
    language: "auto",
    model: "gemini-3.1-flash-lite-preview",
    tone: "default",
    length: "moderate",
    conversation_id: conversationId,
    image_urls: [],
    history_messages: toHistoryMessages(history),
    chat_mode: "standard",
  };

  try {
    const upstream = await fetch(`${BASE}/api/v2/chat/stream`, {
      method: "POST",
      headers: {
        "sec-ch-ua-platform": `"Android"`,
        "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Mobile Safari/537.36",
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
        Cookie: cookieHeader,
        priority: "u=1, i",
      },
      body: JSON.stringify(payload),
    });

    const rawBody = await upstream.text();
    const answer = parseSSE(rawBody);

    if (!answer) {
      return res.status(502).json({ error: "No response from upstream", raw: rawBody.slice(0, 500) });
    }

    return res.status(200).json({
      choices: [{ message: { role: "assistant", content: answer } }],
      model: "gemini-3.1-flash-lite-preview",
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
    }
