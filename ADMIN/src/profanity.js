export const BANNED_WORDS = [
  "fuck",
  "shit",
  "bitch",
  "asshole",
  "damn",
  "gago",
  "gaga",
  "tanga",
  "bobo",
  "bobita",
  "putangina",
  "putang ina",
  "puta",
  "pota",
  "pakshet",
  "pakshit",
  "ulol",
  "tarantado",
  "tarantada",
  "tanginamo",
  "hayop ka",
  "leche",
  "lintik",
  "bwisit",
  "buwisit",
  "punyeta",
  "puke",
  "kantot",
  "iyot",
];

function normalizeText(value) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[@]/g, "a")
    .replace(/[!1|]/g, "i")
    .replace(/[$5]/g, "s")
    .replace(/[0]/g, "o")
    .replace(/[3]/g, "e")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/([a-z])\1+/g, "$1")
    .trim();
}

export function findBannedWord(value) {
  if (!value) return null;

  const normalized = ` ${normalizeText(value)} `;
  const compact = normalized.replace(/\s+/g, "");

  return BANNED_WORDS.find((word) => {
    const cleanWord = normalizeText(word);
    const spaced = ` ${cleanWord} `;
    return normalized.includes(spaced) || compact.includes(cleanWord.replace(/\s+/g, ""));
  }) ?? null;
}

export function containsProfanity(value) {
  return Boolean(findBannedWord(value));
}

export const PROFANITY_ERROR = "Please remove inappropriate words before continuing.";
