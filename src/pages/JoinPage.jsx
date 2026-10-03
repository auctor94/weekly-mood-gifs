import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import GifPicker from "../components/GifPicker.jsx";
import SlideView from "../components/SlideView.jsx";
import WallView from "../components/WallView.jsx";
import { emitAck, joinRoom as requestJoin, socket } from "../socket.js";
import { useRoomState } from "../useRoomState.js";

const PID_KEY = "gifs-mood-pid";
const NAME_KEY = "gifs-mood-name";

export default function JoinPage() {
  const { code: codeFromRoute } = useParams();
  const state = useRoomState();
  const [name, setName] = useState(() => sessionStorage.getItem(NAME_KEY) || "");
  const [moodNow, setMoodNow] = useState(null);
  const [weekWent, setWeekWent] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const phase = state?.phase || "idle";
  const pickingStarted = Boolean(state?.pickingStarted);
  const roomCode = state?.code;
  const me = state?.me;
  const apiKey = me?.giphyApiKey || "";
  const routeCode = codeFromRoute?.toUpperCase();
  const codeMismatch = Boolean(routeCode && roomCode && routeCode !== roomCode);

  useEffect(() => {
    if (me?.moodNow) setMoodNow(me.moodNow);
    if (me?.weekWent) setWeekWent(me.weekWent);
  }, [me?.moodNow, me?.weekWent]);

  async function joinRoom(nextName = name) {
    const trimmed = nextName.trim();
    if (trimmed.length < 1) {
      setError("Введите имя");
      return;
    }
    setBusy(true);
    setError("");
    const result = await requestJoin({
      name: trimmed,
      code: routeCode || roomCode || "",
      participantId: sessionStorage.getItem(PID_KEY) || "",
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error || "Не удалось войти");
      return;
    }
    sessionStorage.setItem(PID_KEY, result.participantId);
    sessionStorage.setItem(NAME_KEY, result.name);
    setName(result.name);
  }

  useEffect(() => {
    function tryRestore() {
      const storedId = sessionStorage.getItem(PID_KEY);
      const storedName = sessionStorage.getItem(NAME_KEY);
      if (!storedId || !storedName) return;
      if (!roomCode && phase === "idle") return;
      requestJoin({
        name: storedName,
        code: routeCode || roomCode || "",
        participantId: storedId,
      }).then((result) => {
        if (result.ok) {
          sessionStorage.setItem(PID_KEY, result.participantId);
          sessionStorage.setItem(NAME_KEY, result.name);
          setName(result.name);
        }
      });
    }
    socket.on("connect", tryRestore);
    tryRestore();
    return () => socket.off("connect", tryRestore);
  }, [phase, roomCode, routeCode]);

  async function submitGifs() {
    if (!moodNow || !weekWent) return;
    setBusy(true);
    setError("");
    const result = await emitAck("submit", { moodNow, weekWent });
    setBusy(false);
    if (!result.ok) setError(result.error || "Не отправилось");
  }

  if (phase === "idle") {
    return (
      <main className="page empty">
        <p className="eyebrow">Неделя в гифках</p>
        <h1>Вечер ещё не начался</h1>
        <p className="lede">Подождите ведущего. Когда комната откроется, эта страница сама предложит ввести имя.</p>
      </main>
    );
  }

  if (codeMismatch) {
    return (
      <main className="page empty">
        <p className="eyebrow">Неделя в гифках</p>
        <h1>Другая комната</h1>
        <p className="lede">Сейчас идёт комната {roomCode}. Этот QR от прошлого вечера.</p>
      </main>
    );
  }

  if (!me) {
    return (
      <main className="page join">
        <p className="eyebrow">Неделя в гифках</p>
        <h1>Как тебя зовут?</h1>
        {roomCode ? <p className="code-pill">{roomCode}</p> : null}
        <form
          className="stack"
          onSubmit={(event) => {
            event.preventDefault();
            joinRoom();
          }}
        >
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Имя"
            maxLength={30}
            autoComplete="nickname"
          />
          <button className="primary" type="submit" disabled={busy || name.trim().length < 1}>
            Войти
          </button>
        </form>
        {error ? <p className="error">{error}</p> : null}
      </main>
    );
  }

  if (me && !pickingStarted && !me.submitted && phase === "lobby") {
    return (
      <main className="page empty">
        <p className="eyebrow">Неделя в гифках</p>
        <h1>Ты в комнате, {me.name}</h1>
        <p className="lede">Подожди ведущего. Когда все соберутся, начнём выбирать гифки.</p>
      </main>
    );
  }

  if (phase === "presenting" && me.submitted) {
    return (
      <main className="page show">
        <SlideView slide={state.slide} isYou={state.isYou} />
      </main>
    );
  }

  if (phase === "wall" && me.submitted) {
    return (
      <main className="page show">
        <h1 className="wall-title">Все вместе</h1>
        <WallView cards={state.wall} />
      </main>
    );
  }

  if (me.submitted && phase === "lobby") {
    return (
      <main className="page empty">
        <p className="eyebrow">Неделя в гифках</p>
        <h1>Отлично</h1>
        <p className="lede">Смотри на телефон — сейчас начнём показ.</p>
        <p className="you-name">{me.name}</p>
      </main>
    );
  }

  return (
    <main className="page pick">
      <header className="pick-head">
        <p className="eyebrow">Неделя в гифках</p>
        <h1>Привет, {me.name}</h1>
        {phase === "presenting" ? (
          <p className="lede">Идёт показ. Отправь гифки — ты будешь в конце очереди.</p>
        ) : (
          <p className="lede">
            Две гифки: как у тебя сейчас настроение и как прошла твоя неделя.
          </p>
        )}
        <ol className="howto">
          <li>В каждом блоке есть поле поиска — нажми на него и напиши запрос, например «кофе» или «ура».</li>
          <li>Появятся гифки. Нажми на ту, которая подходит.</li>
          <li>Когда обе выбраны — «Готово» внизу.</li>
        </ol>
      </header>
      <GifPicker label="Настроение сейчас" apiKey={apiKey} selected={moodNow} onSelect={setMoodNow} />
      <GifPicker label="Как прошла неделя" apiKey={apiKey} selected={weekWent} onSelect={setWeekWent} />
      <button
        className="primary sticky-submit"
        disabled={busy || !moodNow || !weekWent}
        onClick={submitGifs}
      >
        Готово
      </button>
      {error ? <p className="error">{error}</p> : null}
    </main>
  );
}
