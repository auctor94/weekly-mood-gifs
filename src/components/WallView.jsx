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
              <figcaption>Настроение сейчас</figcaption>
              <img src={card.moodNow.displayUrl} alt={card.moodNow.title || "Настроение сейчас"} />
            </figure>
            <figure>
              <figcaption>Как прошла неделя</figcaption>
              <img src={card.weekWent.displayUrl} alt={card.weekWent.title || "Как прошла неделя"} />
            </figure>
          </div>
        </article>
      ))}
    </div>
  );
}
