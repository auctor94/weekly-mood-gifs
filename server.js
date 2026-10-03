import "dotenv/config";
import http from "node:http";
import path from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import express from "express";
import { Server } from "socket.io";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const HOST_SECRET = process.env.HOST_SECRET || "";
const GIPHY_KEYS = loadGiphyKeys();
const isProd = process.env.NODE_ENV === "production";
const CODE_ALPHABET = "ABCDEFGHJKMNPQRTUVWXYZ2346789";

function loadGiphyKeys() {
  const raw = [
    process.env.GIPHY_API_KEY,
    process.env.GIPHY_API_KEY_1,
    process.env.GIPHY_API_KEY_2,
    process.env.GIPHY_API_KEY_3,
    ...(String(process.env.GIPHY_API_KEYS || "").split(/[,\s]+/)),
  ];
  const keys = [];
  const seen = new Set();
  for (const value of raw) {
    const key = String(value || "").trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    keys.push(key);
  }
  return keys;
}

function keyForIndex(index) {
  if (typeof index !== "number" || index < 0 || !GIPHY_KEYS[index]) return "";
  return GIPHY_KEYS[index];
}

function assignKeysEvenly(participants) {
  if (GIPHY_KEYS.length === 0) {
    for (const participant of participants) participant.giphyKeyIndex = null;
    return;
  }
  const ids = shuffle(participants.map((p) => p.id));
  ids.forEach((id, i) => {
    const participant = participants.find((p) => p.id === id);
    if (participant) participant.giphyKeyIndex = i % GIPHY_KEYS.length;
  });
}

function leastUsedKeyIndex(participants) {
  if (GIPHY_KEYS.length === 0) return null;
  const counts = Array(GIPHY_KEYS.length).fill(0);
  for (const participant of participants) {
    if (typeof participant.giphyKeyIndex === "number") {
      counts[participant.giphyKeyIndex] += 1;
    }
  }
  let best = 0;
  for (let i = 1; i < counts.length; i += 1) {
    if (counts[i] < counts[best]) best = i;
  }
  return best;
}

/** @type {Room | null} */
let room = null;

/**
 * @typedef {{ giphyId: string, title: string, previewUrl: string, displayUrl: string }} GifRef
 * @typedef {{
 *   id: string,
 *   name: string,
 *   socketId?: string,
 *   moodNow: GifRef | null,
 *   weekWent: GifRef | null,
 *   submittedAt: string | null,
 *   giphyKeyIndex: number | null,
 * }} Participant
 * @typedef {{
 *   code: string,
 *   phase: "lobby" | "presenting" | "wall",
 *   pickingStarted: boolean,
 *   hostSocketId: string | null,
 *   participants: Participant[],
 *   order: string[],
 *   currentIndex: number,
 * }} Room
 */

function makeCode() {
  let code = "";
  for (let i = 0; i < 4; i += 1) {
    code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return code;
}

function shuffle(ids) {
  const next = [...ids];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

function uniqueName(desired, participants, exceptId) {
  const base = desired.replace(/\s+/g, " ").trim().slice(0, 30);
  const taken = new Set(
    participants.filter((p) => p.id !== exceptId).map((p) => p.name.toLowerCase()),
  );
  if (!taken.has(base.toLowerCase())) return base;
  let n = 2;
  while (taken.has(`${base} ${n}`.toLowerCase())) n += 1;
  return `${base} ${n}`;
}

function isSubmitted(participant) {
  return Boolean(participant.moodNow && participant.weekWent && participant.submittedAt);
}

function allowedGifUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;
    const host = parsed.hostname;
    return (
      host === "giphy.com" ||
      host === "media.giphy.com" ||
      host.endsWith(".giphy.com")
    );
  } catch {
    return false;
  }
}

function parseGif(value) {
  if (!value || typeof value !== "object") return null;
  const giphyId = String(value.giphyId || "").slice(0, 80);
  const title = String(value.title || "").slice(0, 200);
  const previewUrl = String(value.previewUrl || "").slice(0, 500);
  const displayUrl = String(value.displayUrl || "").slice(0, 500);
  if (!giphyId || !allowedGifUrl(previewUrl) || !allowedGifUrl(displayUrl)) return null;
  return { giphyId, title, previewUrl, displayUrl };
}

function currentSlide(currentRoom) {
  if (!currentRoom || currentRoom.phase !== "presenting") return null;
  const id = currentRoom.order[currentRoom.currentIndex];
  const participant = currentRoom.participants.find((p) => p.id === id);
  if (!participant || !isSubmitted(participant)) return null;
  return {
    participantId: participant.id,
    name: participant.name,
    moodNow: participant.moodNow,
    weekWent: participant.weekWent,
    index: currentRoom.currentIndex,
    total: currentRoom.order.length,
  };
}

function wallCards(currentRoom) {
  return currentRoom.order
    .map((id) => currentRoom.participants.find((p) => p.id === id))
    .filter((p) => p && isSubmitted(p))
    .map((p) => ({
      id: p.id,
      name: p.name,
      moodNow: p.moodNow,
      weekWent: p.weekWent,
    }));
}

function hostView(currentRoom) {
  if (!currentRoom) {
    return {
      role: "host",
      phase: "idle",
      pickingStarted: false,
      keyCount: GIPHY_KEYS.length,
      code: null,
      participants: [],
      slide: null,
      wall: null,
    };
  }
  const hideGifs = currentRoom.phase === "lobby";
  return {
    role: "host",
    phase: currentRoom.phase,
    pickingStarted: currentRoom.pickingStarted,
    keyCount: GIPHY_KEYS.length,
    code: currentRoom.code,
    currentIndex: currentRoom.currentIndex,
    orderLength: currentRoom.order.length,
    participants: currentRoom.participants.map((p) => ({
      id: p.id,
      name: p.name,
      submitted: isSubmitted(p),
      ...(hideGifs
        ? {}
        : {
            moodNow: p.moodNow,
            weekWent: p.weekWent,
          }),
    })),
    slide: currentSlide(currentRoom),
    wall: currentRoom.phase === "wall" ? wallCards(currentRoom) : null,
  };
}

function participantView(currentRoom, participantId) {
  if (!currentRoom) {
    return {
      role: "participant",
      phase: "idle",
      pickingStarted: false,
      code: null,
      me: null,
      slide: null,
      isYou: false,
      wall: null,
    };
  }
  const me = currentRoom.participants.find((p) => p.id === participantId) || null;
  const slide = currentSlide(currentRoom);
  return {
    role: "participant",
    phase: currentRoom.phase,
    pickingStarted: currentRoom.pickingStarted,
    code: currentRoom.code,
    me: me
      ? {
          id: me.id,
          name: me.name,
          submitted: isSubmitted(me),
          moodNow: me.moodNow,
          weekWent: me.weekWent,
          giphyApiKey: currentRoom.pickingStarted ? keyForIndex(me.giphyKeyIndex) : "",
        }
      : null,
    slide: currentRoom.phase === "presenting" ? slide : null,
    isYou: Boolean(slide && participantId && slide.participantId === participantId),
    wall: currentRoom.phase === "wall" ? wallCards(currentRoom) : null,
  };
}

const app = express();
app.set("trust proxy", 1);
app.disable("x-powered-by");
app.use(express.json({ limit: "32kb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/config", (_req, res) => {
  res.json({
    appName: "Неделя в гифках",
    keyCount: GIPHY_KEYS.length,
  });
});

const distDir = path.join(__dirname, "dist");
if (isProd && existsSync(path.join(distDir, "index.html"))) {
  app.use(express.static(distDir));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api") || req.path.startsWith("/socket.io")) {
      next();
      return;
    }
    res.sendFile(path.join(distDir, "index.html"));
  });
}

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: true },
});

function emitAll() {
  for (const socket of io.sockets.sockets.values()) {
    if (socket.data.isHost) {
      socket.emit("room:state", hostView(room));
    } else {
      socket.emit("room:state", participantView(room, socket.data.participantId));
    }
  }
}

function requireHost(socket) {
  return Boolean(socket.data.isHost);
}

io.on("connection", (socket) => {
  socket.data.isHost = false;
  socket.data.participantId = undefined;
  socket.emit("room:state", participantView(room, undefined));

  socket.on("host:hello", (payload, ack) => {
    const secret = String(payload?.secret || "");
    if (!HOST_SECRET) {
      ack?.({ ok: false, error: "На сервере не задан HOST_SECRET" });
      return;
    }
    if (secret !== HOST_SECRET) {
      ack?.({ ok: false, error: "Неверный секрет хоста" });
      return;
    }
    socket.data.isHost = true;
    socket.data.participantId = undefined;
    if (room) room.hostSocketId = socket.id;
    ack?.({ ok: true });
    socket.emit("room:state", hostView(room));
  });

  socket.on("host:create", (_payload, ack) => {
    if (!requireHost(socket)) {
      ack?.({ ok: false, error: "Нужен секрет хоста" });
      return;
    }
    if (room) {
      ack?.({ ok: false, error: "Комната уже идёт. Сначала завершите вечер." });
      return;
    }
    room = {
      code: makeCode(),
      phase: "lobby",
      pickingStarted: false,
      hostSocketId: socket.id,
      participants: [],
      order: [],
      currentIndex: 0,
    };
    ack?.({ ok: true, code: room.code });
    emitAll();
  });

  socket.on("host:startPicking", (_payload, ack) => {
    if (!requireHost(socket) || !room) {
      ack?.({ ok: false, error: "Комната не найдена" });
      return;
    }
    if (room.phase !== "lobby") {
      ack?.({ ok: false, error: "Выбор уже позади" });
      return;
    }
    if (room.pickingStarted) {
      ack?.({ ok: false, error: "Выбор уже начат" });
      return;
    }
    if (room.participants.length < 1) {
      ack?.({ ok: false, error: "Подождите хотя бы одного человека" });
      return;
    }
    assignKeysEvenly(room.participants);
    room.pickingStarted = true;
    ack?.({ ok: true });
    emitAll();
  });

  socket.on("host:startPresent", (_payload, ack) => {
    if (!requireHost(socket) || !room) {
      ack?.({ ok: false, error: "Комната не найдена" });
      return;
    }
    if (room.phase !== "lobby") {
      ack?.({ ok: false, error: "Показ уже начат" });
      return;
    }
    const readyIds = room.participants.filter(isSubmitted).map((p) => p.id);
    if (readyIds.length === 0) {
      ack?.({ ok: false, error: "Пока никто не отправил гифки" });
      return;
    }
    room.order = shuffle(readyIds);
    room.currentIndex = 0;
    room.phase = "presenting";
    ack?.({ ok: true });
    emitAll();
  });

  socket.on("host:next", (_payload, ack) => {
    if (!requireHost(socket) || !room || room.phase !== "presenting") {
      ack?.({ ok: false, error: "Сейчас не показ" });
      return;
    }
    if (room.currentIndex < room.order.length - 1) {
      room.currentIndex += 1;
    }
    ack?.({ ok: true });
    emitAll();
  });

  socket.on("host:prev", (_payload, ack) => {
    if (!requireHost(socket) || !room || room.phase !== "presenting") {
      ack?.({ ok: false, error: "Сейчас не показ" });
      return;
    }
    if (room.currentIndex > 0) {
      room.currentIndex -= 1;
    }
    ack?.({ ok: true });
    emitAll();
  });

  socket.on("host:wall", (_payload, ack) => {
    if (!requireHost(socket) || !room) {
      ack?.({ ok: false, error: "Комната не найдена" });
      return;
    }
    if (room.phase === "lobby") {
      ack?.({ ok: false, error: "Сначала начните показ" });
      return;
    }
    room.phase = "wall";
    ack?.({ ok: true });
    emitAll();
  });

  socket.on("host:end", (_payload, ack) => {
    if (!requireHost(socket)) {
      ack?.({ ok: false, error: "Нужен секрет хоста" });
      return;
    }
    room = null;
    ack?.({ ok: true });
    emitAll();
  });

  socket.on("join", (payload, ack) => {
    if (!room) {
      ack?.({ ok: false, error: "Вечер ещё не начался" });
      return;
    }
    const requestedCode = String(payload?.code || "").toUpperCase();
    if (requestedCode && requestedCode !== room.code) {
      ack?.({ ok: false, error: "Неверный код комнаты" });
      return;
    }
    if (socket.data.participantId) {
      const already = room.participants.find((p) => p.id === socket.data.participantId);
      if (already) {
        already.socketId = socket.id;
        if (room.pickingStarted && already.giphyKeyIndex == null) {
          already.giphyKeyIndex = leastUsedKeyIndex(
            room.participants.filter((p) => p.id !== already.id),
          );
        }
        ack?.({ ok: true, participantId: already.id, name: already.name });
        emitAll();
        return;
      }
    }
    const incomingId = String(payload?.participantId || "");
    const existing = incomingId ? room.participants.find((p) => p.id === incomingId) : null;
    if (existing) {
      existing.socketId = socket.id;
      if (room.pickingStarted && existing.giphyKeyIndex == null) {
        existing.giphyKeyIndex = leastUsedKeyIndex(
          room.participants.filter((p) => p.id !== existing.id),
        );
      }
      if (payload?.name) {
        existing.name = uniqueName(String(payload.name), room.participants, existing.id);
      }
      socket.data.participantId = existing.id;
      socket.data.isHost = false;
      ack?.({ ok: true, participantId: existing.id, name: existing.name });
      emitAll();
      return;
    }
    const name = uniqueName(String(payload?.name || ""), room.participants);
    if (name.length < 1) {
      ack?.({ ok: false, error: "Введите имя" });
      return;
    }
    const participant = {
      id: randomUUID(),
      name,
      socketId: socket.id,
      moodNow: null,
      weekWent: null,
      submittedAt: null,
      giphyKeyIndex: room.pickingStarted ? leastUsedKeyIndex(room.participants) : null,
    };
    room.participants.push(participant);
    socket.data.participantId = participant.id;
    socket.data.isHost = false;
    ack?.({ ok: true, participantId: participant.id, name: participant.name });
    emitAll();
  });

  socket.on("submit", (payload, ack) => {
    if (!room) {
      ack?.({ ok: false, error: "Вечер уже закончился" });
      return;
    }
    const participant = room.participants.find((p) => p.id === socket.data.participantId);
    if (!participant) {
      ack?.({ ok: false, error: "Сначала представьтесь" });
      return;
    }
    const moodNow = parseGif(payload?.moodNow);
    const weekWent = parseGif(payload?.weekWent);
    if (!moodNow || !weekWent) {
      ack?.({ ok: false, error: "Выберите обе гифки" });
      return;
    }
    const wasSubmitted = isSubmitted(participant);
    participant.moodNow = moodNow;
    participant.weekWent = weekWent;
    participant.submittedAt = new Date().toISOString();
    if (!wasSubmitted && (room.phase === "presenting" || room.phase === "wall")) {
      if (!room.order.includes(participant.id)) {
        room.order.push(participant.id);
      }
    }
    ack?.({ ok: true });
    emitAll();
  });

  socket.on("disconnect", () => {
    if (room && room.hostSocketId === socket.id) {
      room.hostSocketId = null;
    }
    if (room && socket.data.participantId) {
      const participant = room.participants.find((p) => p.id === socket.data.participantId);
      if (participant && participant.socketId === socket.id) {
        participant.socketId = undefined;
      }
    }
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Неделя в гифках слушает 0.0.0.0:${PORT}, ключей GIPHY: ${GIPHY_KEYS.length}`);
});
