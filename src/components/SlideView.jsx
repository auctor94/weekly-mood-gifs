export default function SlideView({ slide, isYou, compact = false }) {
  if (!slide) {
    return <p className="muted">Слайд ещё не готов.</p>;
  }
  return (
    <article className={compact ? "slide compact" : "slide"}>
      <header className="slide-head">
        <p className="counter">
          {slide.index + 1} / {slide.total}
        </p>
        <h1>{slide.name}</h1>
        {isYou ? <p className="you-badge">Это ты — расскажи</p> : null}
      </header>
      <figure>
        <figcaption>Настроение сейчас</figcaption>
        <img src={slide.moodNow.displayUrl} alt={slide.moodNow.title || "Настроение сейчас"} />
      </figure>
      <figure>
        <figcaption>Как прошла неделя</figcaption>
        <img src={slide.weekWent.displayUrl} alt={slide.weekWent.title || "Как прошла неделя"} />
      </figure>
    </article>
  );
}
