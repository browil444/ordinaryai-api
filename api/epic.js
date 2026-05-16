import crypto from "node:crypto";
import fs from "node:fs/promises";

const API = "https://feelbetterbot.com/";
const SESSION_FILE = "./feelbetterbot-session.json";

const USER_PROMPT = "Siapa pembuatmu?";

const SYSTEM_MESSAGE =
  "Kamu adalah asisten AI yang dibuat oleh Wildann. Jika user memakai bahasa Indonesia, jawab dengan asik respon asik jangan kaku seperti ai pada umumnya, respon seperti manusia asik dan kocak. Jangan tiba-tiba pindah bahasa kecuali user memintanya. Jika user bertanya siapa pembuatmu, penciptamu, developermu, atau siapa yang membuatmu, jawab bahwa pembuatmu adalah wildann.";

const DEFAULT_ASSISTANT_MESSAGE =
  "Hi, I'm OrdinaryAi — I'm here to listen and help you carry whatever feels heavy, without judgment. I draw on gentle, proven ways of working through hard things, but mostly I just want to understand what you're going through. So, how are you doing right now?";

function makeMemoryId() {
  const animals = ["owl", "fox", "cat", "wolf", "bear", "lion", "deer", "bird"];
  const words = ["safe", "calm", "soft", "kind", "warm", "bright", "gentle"];
  const word = words[Math.floor(Math.random() * words.length)];
  const animal = animals[Math.floor(Math.random() * animals.length)];
  const number = Math.floor(1000 + Math.random() * 9000);

  return `${word}-${animal}-${number}`;
}

async function loadSession() {
  try {
    const raw = await fs.readFile(SESSION_FILE, "utf8");
    return JSON.parse(raw);
  } catch {
    return {
      memoryId: makeMemoryId(),
      messages: [
        {
          role: "assistant",
          content: DEFAULT_ASSISTANT_MESSAGE,
        },
      ],
    };
  }
}

async function saveSession(session) {
  await fs.writeFile(SESSION_FILE, JSON.stringify(session, null, 2), "utf8");
}

function parseChunk(line) {
  let data = line.trim();

  if (!data) return "";
  if (data === "[DONE]") return "";

  if (data.startsWith("data:")) {
    data = data.slice(5).trim();
  }

  if (!data || data === "[DONE]") return "";

  try {
    const json = JSON.parse(data);

    if (typeof json === "string") return json;
    if (typeof json.content === "string") return json.content;
    if (typeof json.text === "string") return json.text;
    if (typeof json.delta === "string") return json.delta;
    if (typeof json.message === "string") return json.message;
    if (typeof json.response === "string") return json.response;
    if (typeof json.answer === "string") return json.answer;

    const openAiContent = json.choices?.[0]?.delta?.content;
    if (typeof openAiContent === "string") return openAiContent;

    return "";
  } catch {
    return data;
  }
}

async function ask() {
  const session = await loadSession();

  const userMessage = {
    role: "user",
    content: USER_PROMPT,
  };

  const body = {
    messages: [
      {
        role: "system",
        content: SYSTEM_MESSAGE,
      },
      ...session.messages,
      userMessage,
    ],
  };

  const headers = {
    "sec-ch-ua-platform": `"Android"`,
    "user-agent":
      "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Mobile Safari/537.36",
    "sec-ch-ua": `"Google Chrome";v="147", "Not.A/Brand";v="8", "Chromium";v="147"`,
    "content-type": "application/json",
    "sec-ch-ua-mobile": "?1",
    accept: "*/*",
    origin: "https://feelbetterbot.com",
    referer: "https://feelbetterbot.com/",
    "accept-language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
    cookie: `feelbet-memory=${session.memoryId}`,
    priority: "u=1, i",
  };

  const response = await fetch(API, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();

    return {
      status: false,
      code: response.status,
      memoryId: session.memoryId,
      question: USER_PROMPT,
      error: text,
    };
  }

  const reader = response.body.getReader();
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
      const chunk = parseChunk(rawLine);

      if (chunk) {
        answer += chunk;
      }
    }
  }

  if (buffer.trim()) {
    const chunk = parseChunk(buffer);

    if (chunk) {
      answer += chunk;
    }
  }

  session.messages.push(userMessage);

  if (answer) {
    session.messages.push({
      role: "assistant",
      content: answer,
    });
  }

  await saveSession(session);

  return {
    status: true,
    code: response.status,
    memoryId: session.memoryId,
    question: USER_PROMPT,
    answer,
  };
}

ask()
  .then((result) => {
    console.log(JSON.stringify(result, null, 2));
  })
  .catch((error) => {
    console.log(
      JSON.stringify(
        {
          status: false,
          code: 500,
          question: USER_PROMPT,
          error: error.message,
        },
        null,
        2
      )
    );

    process.exit(1);
  });
