const https = require("https");
const crypto = require("crypto");

const BASE_URL = "api.deep-image.ai";

function getClientId() {
  return crypto
    .createHash("md5")
    .update(Date.now().toString() + Math.random().toString())
    .digest("hex");
}

const UA =
  "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36";

function deepImageRequest(method, path, body, clientId) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const options = {
      hostname: BASE_URL,
      path,
      method,
      headers: {
        accept: "application/json, text/plain, */*",
        "content-type": "application/json",
        "user-agent": UA,
        "x-client-id": clientId,
        origin: "https://deep-image.ai",
        referer: "https://deep-image.ai/",
        "sec-ch-ua": '"Chromium";v="140", "Not=A?Brand";v="24", "Google Chrome";v="140"',
        "sec-ch-ua-mobile": "?1",
        "sec-ch-ua-platform": '"Android"',
        "sec-fetch-site": "same-site",
        "sec-fetch-mode": "cors",
        "sec-fetch-dest": "empty",
        "accept-language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
        ...(payload ? { "content-length": Buffer.byteLength(payload) } : {}),
      },
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          reject(new Error("Failed to parse response: " + data));
        }
      });
    });

    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function sleep(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

export default async function handler(req, res) {
  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { prompt, width = 768, height = 1152 } = req.body || {};

  if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
    return res.status(400).json({ error: "Parameter 'prompt' wajib diisi." });
  }

  const w = Math.min(Math.max(parseInt(width) || 768, 256), 1536);
  const h = Math.min(Math.max(parseInt(height) || 1152, 256), 1536);
  const clientId = getClientId();

  try {
    // Step 1: Submit job
    const genRes = await deepImageRequest(
      "POST",
      "/api/public/free-image-generator/generate",
      { prompt: prompt.trim(), width: w, height: h },
      clientId
    );

    if (!genRes.job) {
      return res.status(502).json({
        error: "Gagal mendapatkan job ID dari Deep Image AI.",
        raw: genRes,
      });
    }

    const jobId = genRes.job;

    // Step 2: Poll result
    const maxAttempts = 40;
    for (let i = 0; i < maxAttempts; i++) {
      await sleep(3000);

      const jobRes = await deepImageRequest(
        "GET",
        `/api/apps/deep_image/v2/jobs/${jobId}`,
        null,
        clientId
      );

      if (jobRes.is_failed) {
        return res.status(502).json({ error: "Job gagal di server Deep Image AI.", job: jobId });
      }

      if (jobRes.result && jobRes.result.result_url) {
        return res.status(200).json({
          success: true,
          job: jobRes.hash || jobId,
          prompt: prompt.trim(),
          width: jobRes.data?.width || w,
          height: jobRes.data?.height || h,
          model: jobRes.generation_metadata?.model || null,
          image_url: jobRes.result.result_url,
          duration_seconds: jobRes.generation_metadata?.request_duration || null,
        });
      }
    }

    return res.status(504).json({
      error: "Timeout — gambar belum selesai setelah 2 menit. Coba lagi.",
      job: jobId,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Internal server error." });
  }
}
