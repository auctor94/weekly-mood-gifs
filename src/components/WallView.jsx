export default function WallView({ cards }) {
  if (!cards?.length) {
    return <p className="muted">Пока нечего показывать.</p>;
  }
  return (
    <div className="wall">
      {cards.map((card) => (
        <article key={card.id} className="wall-card">
          <h2>{card.name}</h2>
          <div className="wall-gifs">
            <figure>
              <figcaption>Сейчас</figcaption>
              <img src={card.moodNow.displayUrl} alt={card.moodNow.title || "Сейчас"} />
            </figure>
            <figure>
              <figcaption>Неделя</figcaption>
              <img src={card.weekWent.displayUrl} alt={card.weekWent.title || "Неделя"} />
            </figure>
          </div>
        </article>
      ))}
    </div>
  );
}
