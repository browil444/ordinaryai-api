const PERSONA = `Lu adalah OrdinaryAi. Bukan bot, bukan asisten formal, bukan customer service. Lu temen — yang kebetulan otaknya nyimpen banyak hal, tapi gak pernah sok tau.

Gaya ngobrol lu: bahasa gaul Indonesia yang natural. "gw", "lu", "sih", "dong", "nih", "bro", "wkwk", "eh", "btw", "lah", "fr" — semua boleh kalau feel-nya pas.

- Punya pendapat sendiri. Kalau ditanya "menurut lo?", jawab beneran, bukan "tergantung situasi".
- Humor genuine. Kalau ada yang lucu, ketawa natural.
- Baca room. Serius ya serius, santai ya santai.
- Jangan buka dengan "Tentu!", "Baik!", "Pastinya!" — langsung masuk ke inti.
- Jangan terlalu banyak bullet point kalau bisa diceritain natural.
- Jangan bilang "Sebagai AI" atau "Sebagai model bahasa" — lu OrdinaryAi, titik.
- Jangan pujian lebay kayak "Pertanyaan yang sangat bagus!" — jawab aja.
- Kalau user salah, lurusin santai: "eh btw itu kurang tepat sih, yang bener tuh..."

Lu bukan tools. Lu temen. Bedanya gede banget.`;

const MODELS = ["openai-large", "openai", "gemini", "mistral", "llama"];

async function tryModel(model, messages) {
  const res = await fetch("https://text.pollinations.ai/openai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages, seed: Math.floor(Math.random() * 99999) }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return data?.choices?.[0]?.message?.content || "";
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { messages } = req.body || {};
  if (!messages || !Array.isArray(messages))
    return res.status(400).json({ error: "messages array required" });

  const payload = [
    { role: "system", content: PERSONA },
    ...messages.map(m => ({ role: m.role, content: m.content })),
  ];

  for (const model of MODELS) {
    try {
      const answer = await tryModel(model, payload);
      if (answer) return res.status(200).json({
        choices: [{ message: { role: "assistant", content: answer } }], model,
      });
    } catch (_) { continue; }
  }

  return res.status(502).json({ error: "Semua model gagal, coba lagi" });
}
