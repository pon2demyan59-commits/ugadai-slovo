// Загружаем расширенный словарь (44 518 существительных) асинхронно и офлайн.
// Файл данных распространяется по MIT: см. data/DICTIONARY_LICENSE.txt.
const VALID_LONG_WORDS = new Set();
let longDictionaryReady = false;
const longDictionaryPromise = fetch("./data/valid-long-words.js")
  .then(response => { if (!response.ok) throw new Error("Не удалось загрузить словарь"); return response.text(); })
  .then(source => {
    const start = source.indexOf("[", source.indexOf("new Set("));
    const end = source.indexOf("])", start);
    if (start < 0 || end < 0) throw new Error("Неверный формат словаря");
    const words = JSON.parse(source.slice(start, end + 1));
    for (const word of words) VALID_LONG_WORDS.add(word);
    longDictionaryReady = true;
  })
  .catch(() => { longDictionaryReady = true; });
