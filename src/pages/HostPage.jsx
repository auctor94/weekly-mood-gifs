import { useEffect, useMemo, useState } from "react";
import QrCard from "../components/QrCard.jsx";
import SlideView from "../components/SlideView.jsx";
import WallView from "../components/WallView.jsx";
import { emitAck, socket } from "../socket.js";
import { useRoomState } from "../useRoomState.js";

const SECRET_KEY = "gifs-mood-host-secret";

export default function HostPage() {
  const state = useRoomState();
  const [secret, setSecret] = useState(() => sessionStorage.getItem(SECRET_KEY) || "");
  const [authed, setAuthed] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const isHostView = state?.role === "host";
  const phase = isHostView ? state.phase : "idle";
  const readyCount = state?.participants?.filter((p) => p.submitted).length || 0;
  const totalCount = state?.participants?.length || 0;

  async function hello(value = secret) {
    setBusy(true);
    setError("");
    const result = await emitAck("host:hello", { secret: value });
    setBusy(false);
    if (!result.ok) {
      setAuthed(false);
      setError(result.error || "Не вышло войти");
      return false;
    }
    sessionStorage.setItem(SECRET_KEY, value);
    setAuthed(true);
    return true;
  }

  useEffect(() => {
    if (!secret) return undefined;
    hello(secret);
    function onConnect() {
      hello(secret);
    }
    socket.on("connect", onConnect);
    return () => socket.off("connect", onConnect);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- restore host session once
  }, []);

  async function run(event, payload) {
    setBusy(true);
    setError("");
    const result = await emitAck(event, payload);
    setBusy(false);
    if (!result.ok) setError(result.error || "Ошибка");
    return result.ok;
  }

  useEffect(() => {
    if (!authed || phase !== "presenting") return undefined;
    function onKey(event) {
      if (event.target instanceof HTMLElement && event.target.matches("input, textarea")) return;
      if (event.key === "ArrowRight" || event.key === " ") {
        event.preventDefault();
        emitAck("host:next");
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        emitAck("host:prev");
      } else if (event.key === "s" || event.key === "S" || event.key === "ы" || event.key === "Ы") {
        event.preventDefault();
        emitAck("host:wall");
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [authed, phase]);

  const people = useMemo(() => state?.participants || [], [state]);

  if (!authed) {
    return (
      <main className="page host-gate">
        <p className="eyebrow">Неделя в гифках</p>
        <h1>Пульт ведущего</h1>
        <p className="lede">Секрет из переменной HOST_SECRET. Зрители сюда не ходят.</p>
        <form
          className="stack"
          onSubmit={(event) => {
            event.preventDefault();
            hello();
          }}
        >
          <input
            type="password"
            value={secret}
            onChange={(event) => setSecret(event.target.value)}
            placeholder="Секрет хоста"
            autoComplete="current-password"
          />
          <button type="submit" className="primary" disabled={busy || !secret}>
            Войти
          </button>
        </form>
        {error ? <p className="error">{error}</p> : null}
      </main>
    );
  }

  return (
    <main className="page host-layout">
      <aside className="host-side">
        <p className="eyebrow">Неделя в гифках</p>
        <h1>Пульт</h1>
        {phase === "idle" ? (
          <button className="primary" disabled={busy} onClick={() => run("host:create")}>
            Начать вечер
          </button>
        ) : null}
        {phase === "lobby" && !state?.pickingStarted ? (
          <>
            <p className="stat">В комнате {totalCount}</p>
            <p className="muted">
              Ключей GIPHY: {state.keyCount ?? 0}. Сначала соберите людей, потом раздадим ключи.
            </p>
            <button
              className="primary"
              disabled={busy || totalCount < 1}
              onClick={() => run("host:startPicking")}
            >
              Начать выбор
            </button>
          </>
        ) : null}
        {phase === "lobby" && state?.pickingStarted ? (
          <>
            <p className="stat">
              Готовы {readyCount} из {totalCount}
            </p>
            <button
              className="primary"
              disabled={busy || readyCount < 1}
              onClick={() => run("host:startPresent")}
            >
              Начать показ
            </button>
          </>
        ) : null}
        {phase === "presenting" ? (
          <div className="host-controls">
            <button disabled={busy} onClick={() => run("host:prev")}>
              Назад
            </button>
            <button className="primary" disabled={busy} onClick={() => run("host:next")}>
              Дальше
            </button>
            <button disabled={busy} onClick={() => run("host:wall")}>
              Общая стена
            </button>
            <p className="muted">Пробел / → дальше, ← назад, S — стена</p>
          </div>
        ) : null}
        {phase === "wall" ? (
          <button className="danger" disabled={busy} onClick={() => run("host:end")}>
            Завершить вечер
          </button>
        ) : null}
        {phase !== "idle" && phase !== "wall" ? (
          <button className="ghost" disabled={busy} onClick={() => run("host:end")}>
            Отменить вечер
          </button>
        ) : null}
        {error ? <p className="error">{error}</p> : null}
        <ul className="people">
          {people.map((person) => (
            <li key={person.id} className={person.submitted ? "ready" : ""}>
              <span>{person.name}</span>
              <small>
                {person.submitted ? "готово" : state?.pickingStarted ? "выбирает" : "ждёт"}
              </small>
            </li>
          ))}
        </ul>
      </aside>
      <section className="host-stage">
        {phase === "idle" ? (
          <div className="empty-stage">
            <h2>Комнаты нет</h2>
            <p>Нажмите «Начать вечер», когда люди садятся.</p>
          </div>
        ) : null}
        {phase === "lobby" && state.code ? <QrCard code={state.code} /> : null}
        {phase === "presenting" ? <SlideView slide={state.slide} isYou={false} /> : null}
        {phase === "wall" ? (
          <>
            <h2 className="wall-title">Все вместе</h2>
            <WallView cards={state.wall} />
          </>
        ) : null}
      </section>
    </main>
  );
}
