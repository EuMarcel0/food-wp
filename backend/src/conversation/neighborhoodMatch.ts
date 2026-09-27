import type { DeliveryNeighborhood } from "../types.js";

/** Remove acentos, pontuação e espaços extras. */
export function normalizeNeighborhoodText(text: string) {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const ABBREVIATIONS: Record<string, string> = {
  jd: "jardim",
  jdm: "jardim",
  jl: "jardim",
  vl: "vila",
  vila: "vila",
  sto: "santo",
  sta: "santa",
  s: "sao",
  sao: "sao",
  pe: "padre",
  pq: "parque",
  pk: "parque",
  cj: "conjunto",
  conj: "conjunto",
  res: "residencial",
  resid: "residencial",
  dist: "distrito",
  nub: "nossa senhora",
  nsa: "nossa senhora",
  ns: "nossa senhora",
  sn: "senhor",
  sr: "senhor",
  sra: "senhora",
};

const STOP_WORDS = new Set(["de", "da", "do", "das", "dos", "e", "o", "a", "bairro", "rua", "r", "av", "avenida", "travessa", "tv", "alameda", "rodovia", "rod", "numero", "n"]);

const ROMAN_OR_DIGIT: Record<string, string> = {
  i: "1",
  ii: "2",
  iii: "3",
  iv: "4",
  v: "5",
  vi: "6",
  ll: "2",
  lll: "3",
  um: "1",
  dois: "2",
  tres: "3",
  "01": "1",
  "02": "2",
  "03": "3",
  "04": "4",
  "05": "5",
};

function expandToken(token: string) {
  const abbreviated = ABBREVIATIONS[token] ?? token;
  return ROMAN_OR_DIGIT[abbreviated] ?? abbreviated;
}

function tokenize(text: string) {
  return normalizeNeighborhoodText(text)
    .split(" ")
    .map(expandToken)
    .filter(token => token.length > 0 && !STOP_WORDS.has(token));
}

function compact(text: string) {
  return tokenize(text).join("");
}

/** Levenshtein com transposição de letras vizinhas (Damerau/OSA). */
function levenshtein(left: string, right: string) {
  if (left === right) return 0;
  if (!left.length) return right.length;
  if (!right.length) return left.length;
  const rows = left.length + 1;
  const cols = right.length + 1;
  const matrix: number[][] = Array.from({ length: rows }, () => Array(cols).fill(0));
  for (let i = 0; i < rows; i++) matrix[i][0] = i;
  for (let j = 0; j < cols; j++) matrix[0][j] = j;
  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      );
      if (i > 1 && j > 1 && left[i - 1] === right[j - 2] && left[i - 2] === right[j - 1]) {
        matrix[i][j] = Math.min(matrix[i][j], matrix[i - 2][j - 2] + 1);
      }
    }
  }
  return matrix[left.length][right.length];
}

/** Palavras comuns em nomes de bairro que, sozinhas, não identificam nenhum. */
const GENERIC_NAME_TOKENS = new Set([
  "jardim",
  "vila",
  "parque",
  "residencial",
  "conjunto",
  "santo",
  "santa",
  "sao",
  "nossa",
  "senhora",
  "senhor",
  "distrito",
  "setor",
  "loteamento",
  "chacara",
  "chacaras",
  "recanto",
  "condominio",
  "cidade",
]);

/**
 * Mesma palavra com erro de digitação (ex.: gortado ≈ gotardo, mirnate ≈ mirante).
 * Exige a mesma inicial e tolera 1 erro de 5 a 6 letras, 2 erros a partir de 7.
 */
function tokensSimilar(query: string, name: string) {
  if (query === name) return true;
  if (query.length < 5 || name.length < 5) return false;
  if (/\d/.test(query) || /\d/.test(name)) return false;
  if (query[0] !== name[0]) return false;
  const maxLen = Math.max(query.length, name.length);
  const allowed = maxLen >= 7 ? 2 : 1;
  if (Math.abs(query.length - name.length) > allowed) return false;
  return levenshtein(query, name) <= allowed;
}

function containsConsecutiveTokensFuzzy(haystack: string[], needle: string[]) {
  if (!needle.length || haystack.length < needle.length) return false;
  for (let i = 0; i <= haystack.length - needle.length; i++) {
    if (needle.every((token, offset) => tokensSimilar(haystack[i + offset], token))) {
      return true;
    }
  }
  return false;
}

function similarity(left: string, right: string) {
  if (!left || !right) return 0;
  if (left === right) return 1;
  const distance = levenshtein(left, right);
  return 1 - distance / Math.max(left.length, right.length);
}

export type NeighborhoodMatch = {
  zone: DeliveryNeighborhood;
  score: number;
  reason: string;
};

function containsConsecutiveTokens(haystack: string[], needle: string[]) {
  if (!needle.length || haystack.length < needle.length) return false;
  for (let i = 0; i <= haystack.length - needle.length; i++) {
    if (needle.every((token, offset) => haystack[i + offset] === token)) {
      return true;
    }
  }
  return false;
}

/**
 * Cidade/UF no fim do endereço não são bairro — e "Bom Jesus da Lapa" colidiria
 * com os bairros "Bom Jesus" e "... Lapa".
 */
const CITY_MENTIONS = [
  /\bbom\s+jesus\s+(?:da\s+)?lapa\b/gi,
  /\bbj\s*(?:da\s*)?lapa\b/gi,
  /\bbjl\b/gi,
];
const STATE_SUFFIX = /(?:^|[\s,\-\/])(?:ba|bahia)\s*$/i;

function stripCityMentions(query: string) {
  let text = query.normalize("NFD").replace(/\p{Diacritic}/gu, "");
  for (const pattern of CITY_MENTIONS) text = text.replace(pattern, " ");
  text = text.replace(STATE_SUFFIX, " ");
  return text.replace(/\s+/g, " ").replace(/[\s,\-\/]+$/, "").trim();
}

const STREET_PREFIX = /^(rua|r|av|avenida|travessa|tv|alameda|al|rodovia|rod|estrada|est|via)\b/;

/** Trechos da mensagem que costumam trazer o bairro (endereço completo). */
function neighborhoodQueryHints(query: string) {
  const hints = [query];
  const afterBairro = query.match(/\bbairro\b\s*[:\-]?\s*(.+)$/i);
  if (afterBairro?.[1]?.trim()) hints.push(afterBairro[1].trim());
  for (const part of query.split(/[,;|/]+|\s[-–—]\s/)) {
    const trimmed = part.trim();
    if (trimmed.length < 3 || trimmed === query) continue;
    // Trecho "Rua das Flores" é logradouro, não bairro.
    if (STREET_PREFIX.test(normalizeNeighborhoodText(trimmed))) continue;
    hints.push(trimmed);
  }
  return hints;
}

function scoreNeighborhood(queryRaw: string, zone: DeliveryNeighborhood): NeighborhoodMatch | null {
  const queryNorm = normalizeNeighborhoodText(queryRaw);
  const nameNorm = normalizeNeighborhoodText(zone.name);
  if (!queryNorm || queryNorm.length < 2) return null;

  const queryTokens = tokenize(queryRaw);
  const nameTokens = tokenize(zone.name);
  const queryCompact = compact(queryRaw);
  const nameCompact = compact(zone.name);

  let score = 0;
  let reason = "parcial";

  if (queryNorm === nameNorm || queryCompact === nameCompact) {
    return { zone, score: 100, reason: "exato" };
  }

  if (nameNorm.startsWith(queryNorm) || queryNorm.startsWith(nameNorm)) {
    score = Math.max(score, 92);
    reason = "prefixo";
  }

  if (nameNorm.includes(queryNorm) || queryNorm.includes(nameNorm)) {
    score = Math.max(score, 88);
    reason = "contem";
  }

  if (queryCompact.length >= 4 && (nameCompact.includes(queryCompact) || queryCompact.includes(nameCompact))) {
    score = Math.max(score, 90);
    reason = "compacto";
  }

  if (queryTokens.length && nameTokens.length) {
    // Números soltos (nº da casa/rua) não contam como palavra do bairro;
    // o "1" de "Mirante da Lapa 1" só vale colado ao nome (regras abaixo).
    const isNumber = (token: string) => /^\d+$/.test(token);
    const nameSet = new Set(nameTokens.filter(token => !isNumber(token)));
    const queryWords = queryTokens.filter(token => !isNumber(token));
    const hit = queryWords.filter(token => nameSet.has(token)).length;
    const coverage = queryWords.length ? hit / queryWords.length : 0;
    const reverseCoverage = nameSet.size ? hit / nameSet.size : 0;
    if (containsConsecutiveTokens(queryTokens, nameTokens)) {
      const distinctive =
        nameTokens.length >= 2 || nameTokens.some(token => token.length >= 4);
      if (distinctive) {
        score = Math.max(score, 96);
        reason = "endereco-contem";
      }
    } else if (coverage === 1 && reverseCoverage >= 0.5) {
      score = Math.max(score, 95);
      reason = "tokens";
    } else if (reverseCoverage === 1 && nameTokens.some(token => token.length >= 4)) {
      // Todos os tokens do bairro aparecem no texto (ex.: endereço completo).
      score = Math.max(score, 93);
      reason = "tokens-no-endereco";
    } else if (coverage >= 0.7) {
      score = Math.max(score, 80 + Math.round(coverage * 10));
      reason = "tokens";
    } else if (hit > 0) {
      score = Math.max(score, 55 + Math.round(coverage * 20));
      reason = "tokens-parciais";
    }

    // Tokens com typo (ex.: calabreasa ≈ calabresa no nome do bairro).
    let fuzzyHits = 0;
    for (const q of queryTokens) {
      if (q.length < 4) continue;
      for (const n of nameTokens) {
        if (n.length < 4) continue;
        if (similarity(q, n) >= 0.8) {
          fuzzyHits += 1;
          break;
        }
      }
    }
    if (fuzzyHits && fuzzyHits === queryTokens.filter(t => t.length >= 4).length) {
      score = Math.max(score, 86);
      reason = "tokens-fuzzy";
    }

    // Nome do bairro inteiro dentro do endereço, com erro de digitação (ex.: "sao gortado").
    if (score < 94 && containsConsecutiveTokensFuzzy(queryTokens, nameTokens)) {
      const distinctive = nameTokens.some(token => token.length >= 4 && !GENERIC_NAME_TOKENS.has(token));
      if (distinctive) {
        score = 94;
        reason = "endereco-fuzzy";
      }
    }

    // Palavras que identificam o bairro presentes no endereço, mesmo sem o prefixo
    // (ex.: "bairro mirante casa 80" → "Jardim Mirante").
    const distinctiveTokens = nameTokens.filter(
      token => token.length >= 4 && !GENERIC_NAME_TOKENS.has(token) && !/^\d+$/.test(token),
    );
    if (
      score < 86 &&
      distinctiveTokens.length &&
      distinctiveTokens.every(name => queryTokens.some(q => tokensSimilar(q, name)))
    ) {
      const exact = distinctiveTokens.every(name => queryTokens.includes(name));
      score = Math.max(score, exact ? 86 : 84);
      reason = "tokens-distintivos";
    }

    // Parte marcante do nome (ex.: "mirante" → Mirante da Lapa 1 / 2): vira opção para o cliente escolher.
    if (
      score < 76 &&
      distinctiveTokens.length >= 2 &&
      distinctiveTokens.some(name => name.length >= 5 && queryTokens.some(q => tokensSimilar(q, name)))
    ) {
      score = 76;
      reason = "tokens-distintivos-parcial";

      // "mirante 1" → Mirante da Lapa 1: número logo após a parte marcante do nome.
      const nameNumber = nameTokens.find(token => /^\d+$/.test(token));
      if (nameNumber) {
        const followedByNumber = queryTokens.some(
          (q, index) =>
            queryTokens[index + 1] === nameNumber &&
            distinctiveTokens.some(name => name.length >= 5 && tokensSimilar(q, name)),
        );
        if (followedByNumber) score = 84;
      }
    }
  }

  const fullSim = Math.max(similarity(queryNorm, nameNorm), similarity(queryCompact, nameCompact));
  if (fullSim >= 0.9) {
    score = Math.max(score, Math.round(fullSim * 95));
    reason = "similaridade";
  } else if (fullSim >= 0.78) {
    score = Math.max(score, Math.round(fullSim * 85));
    reason = "similaridade";
  }

  if (score < 60) return null;
  return { zone, score, reason };
}

/**
 * Localiza bairro digitado pelo cliente.
 * - unique: um resultado claro
 * - ambiguous: vários candidatos (mostrar opções)
 * - none: não achou
 */
export function matchNeighborhoodQuery(
  query: string,
  zones: DeliveryNeighborhood[],
): { status: "unique"; match: NeighborhoodMatch } | { status: "ambiguous"; matches: NeighborhoodMatch[] } | { status: "none" } {
  const raw = query.trim();
  if (!raw || !zones.length) return { status: "none" };

  if (raw.startsWith("nbh:")) {
    const id = raw.slice(4);
    const zone = zones.find(item => item.id === id);
    return zone
      ? { status: "unique", match: { zone, score: 100, reason: "id" } }
      : { status: "none" };
  }

  const trimmed = stripCityMentions(raw);
  if (!trimmed) return { status: "none" };

  const scored = zones
    .flatMap(zone =>
      neighborhoodQueryHints(trimmed).map(hint => scoreNeighborhood(hint, zone)),
    )
    .filter((item): item is NeighborhoodMatch => item != null)
    .sort(
      (left, right) =>
        right.score - left.score ||
        right.zone.name.length - left.zone.name.length ||
        left.zone.name.localeCompare(right.zone.name, "pt-BR"),
    );

  const uniqueByZone = new Map<string, NeighborhoodMatch>();
  for (const item of scored) {
    const current = uniqueByZone.get(item.zone.id);
    if (!current || item.score > current.score) uniqueByZone.set(item.zone.id, item);
  }
  // "Jardim Mirante" inteiro no texto explica o "Mirante": descarta o bairro menor contido nele.
  const queryTokens = tokenize(trimmed);
  const fullNameHits = [...uniqueByZone.values()].filter(item =>
    containsConsecutiveTokens(queryTokens, tokenize(item.zone.name)),
  );
  for (const item of [...uniqueByZone.values()]) {
    const tokens = tokenize(item.zone.name);
    const words = tokens.filter(token => !/^\d+$/.test(token)).join(" ");
    const covered = fullNameHits.some(other => {
      if (other.zone.id === item.zone.id) return false;
      const otherTokens = tokenize(other.zone.name);
      if (otherTokens.length > tokens.length && containsConsecutiveTokens(otherTokens, tokens)) return true;
      // "Maravilha 2" inteiro no texto descarta o irmão "Maravilha 1".
      const otherWords = otherTokens.filter(token => !/^\d+$/.test(token)).join(" ");
      return otherWords === words && !containsConsecutiveTokens(queryTokens, tokens);
    });
    if (covered) uniqueByZone.delete(item.zone.id);
  }

  const ranked = [...uniqueByZone.values()].sort(
    (left, right) =>
      right.score - left.score ||
      right.zone.name.length - left.zone.name.length ||
      left.zone.name.localeCompare(right.zone.name, "pt-BR"),
  );

  if (!ranked.length) return { status: "none" };

  const best = ranked[0];
  if (best.score === 100 && (ranked[1]?.score ?? 0) < 100) {
    return { status: "unique", match: best };
  }
  const strong = ranked.filter(item => item.score >= 80 && item.score >= best.score - 8);

  if (best.score >= 90 && (strong.length === 1 || best.score - (ranked[1]?.score ?? 0) >= 8)) {
    return { status: "unique", match: best };
  }

  if (strong.length === 1 && best.score >= 80) {
    return { status: "unique", match: best };
  }

  if (strong.length > 1 || (best.score >= 60 && ranked.length > 1 && best.score < 90)) {
    const candidates = (strong.length > 1 ? strong : ranked).slice(0, 10);
    if (candidates.length === 1) return { status: "unique", match: candidates[0] };
    return { status: "ambiguous", matches: candidates };
  }

  if (best.score >= 75) return { status: "unique", match: best };
  return { status: "none" };
}
