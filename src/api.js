export async function loadConfig() {
  const response = await fetch("/api/config");
  if (!response.ok) {
    throw new Error("Не удалось получить конфиг");
  }
  return response.json();
}
