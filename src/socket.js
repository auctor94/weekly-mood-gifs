import { io } from "socket.io-client";

export const socket = io({
  autoConnect: true,
  transports: ["websocket", "polling"],
});

export function emitAck(event, payload = {}) {
  return new Promise((resolve) => {
    socket.emit(event, payload, (response) => {
      resolve(response || { ok: false, error: "Нет ответа от сервера" });
    });
  });
}

let joinQueue = Promise.resolve();

export function joinRoom(payload) {
  const run = () => emitAck("join", payload);
  const next = joinQueue.then(run, run);
  joinQueue = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}
