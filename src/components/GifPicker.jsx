import { useEffect, useState } from "react";

const DEMO_GIFS = [
  {
    giphyId: "3o7abKhOpu0NwenH3O",
    title: "Аплодисменты",
    previewUrl: "https://media.giphy.com/media/3o7abKhOpu0NwenH3O/200w.gif",
    displayUrl: "https://media.giphy.com/media/3o7abKhOpu0NwenH3O/giphy.gif",
  },
  {
    giphyId: "JIX9t2j0ZTN9S",
    title: "Кот печатает",
    previewUrl: "https://media.giphy.com/media/JIX9t2j0ZTN9S/200w.gif",
    displayUrl: "https://media.giphy.com/media/JIX9t2j0ZTN9S/giphy.gif",
  },
  {
    giphyId: "l0MYt5jPR6QX5pnqM",
    title: "Это нормально",
    previewUrl: "https://media.giphy.com/media/l0MYt5jPR6QX5pnqM/200w.gif",
    displayUrl: "https://media.giphy.com/media/l0MYt5jPR6QX5pnqM/giphy.gif",
  },
  {
    giphyId: "d3mlE7uhX8KFgEmY",
    title: "Взрыв мозга",
    previewUrl: "https://media.giphy.com/media/d3mlE7uhX8KFgEmY/200w.gif",
    displayUrl: "https://media.giphy.com/media/d3mlE7uhX8KFgEmY/giphy.gif",
  },
  {
    giphyId: "26BRuo6sSmvKLdgIM",
    title: "Кофе",
    previewUrl: "https://media.giphy.com/media/26BRuo6sSmvKLdgIM/200w.gif",
    displayUrl: "https://media.giphy.com/media/26BRuo6sSmvKLdgIM/giphy.gif",
  },
  {
    giphyId: "xT0xeJpnrWC4XWblEk",
    title: "Пятница",
    previewUrl: "https://media.giphy.com/media/xT0xeJpnrWC4XWblEk/200w.gif",
    displayUrl: "https://media.giphy.com/media/xT0xeJpnrWC4XWblEk/giphy.gif",
  },
];

function toGifRef(item) {
  const preview =
    item.images?.fixed_width?.url ||
    item.images?.preview_gif?.url ||
    item.images?.downsized_small?.url;
  const display =
    item.images?.downsized_medium?.url ||
    item.images?.fixed_height?.url ||
    item.images?.original?.url ||
    preview;
  if (!preview || !display) return null;
  return {
    giphyId: item.id,
    title: item.title || "",
    previewUrl: preview,
    displayUrl: display,
  };
}

export default function GifPicker({ label, apiKey, selected, onSelect }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState(apiKey ? [] : DEMO_GIFS);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!apiKey) {
      setResults(DEMO_GIFS);
      return undefined;
    }
    const q = query.trim();
    if (!q) {
      setResults([]);
      setError("");
      return undefined;
    }
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams({
          api_key: apiKey,
          q,
          limit: "24",
          rating: "pg",
          lang: "ru",
        });
        const response = await fetch(`https://api.giphy.com/v1/gifs/search?${params}`);
        if (!response.ok) {
          throw new Error("GIPHY не ответил");
        }
        const body = await response.json();
        setResults((body.data || []).map(toGifRef).filter(Boolean));
      } catch (err) {
        setError(err.message || "Поиск не удался");
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => window.clearTimeout(timer);
  }, [apiKey, query]);

  return (
    <section className="picker">
      <div className="picker-head">
        <h2>{label}</h2>
        {selected ? (
          <button type="button" className="text-btn" onClick={() => onSelect(null)}>
            Сбросить
          </button>
        ) : null}
      </div>
      <input
        className="search"
        type="search"
        placeholder={apiKey ? "Напиши сюда запрос, например: устал" : "Ключа нет — выбери демо"}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        autoCapitalize="none"
        autoCorrect="off"
      />
      {loading ? <p className="muted">Ищем…</p> : null}
      {error ? <p className="error">{error}</p> : null}
      <div className="gif-grid">
        {(selected && !results.some((gif) => gif.giphyId === selected.giphyId)
          ? [selected, ...results]
          : results
        ).map((gif) => (
          <button
            key={gif.giphyId}
            type="button"
            className={selected?.giphyId === gif.giphyId ? "gif-cell selected" : "gif-cell"}
            onClick={() => onSelect(gif)}
          >
            <img src={gif.previewUrl} alt={gif.title || "GIF"} loading="lazy" />
          </button>
        ))}
      </div>
      <a className="giphy-mark" href="https://giphy.com/" target="_blank" rel="noreferrer">
        <span>Powered by</span>
        <strong>GIPHY</strong>
      </a>
    </section>
  );
}
