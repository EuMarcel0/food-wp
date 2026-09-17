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
    }
  }
  return matrix[left.length][right.length];
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

/** Trechos da mensagem que costumam trazer o bairro (endereço completo). */
function neighborhoodQueryHints(query: string) {
  const hints = [query];
  const afterBairro = query.match(/\bbairro\b\s*[:\-]?\s*(.+)$/i);
  if (afterBairro?.[1]?.trim()) hints.push(afterBairro[1].trim());
  for (const part of query.split(/[,;|/]+/)) {
    const trimmed = part.trim();
    if (trimmed.length >= 3 && trimmed !== query) hints.push(trimmed);
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
    const nameSet = new Set(nameTokens);
    const hit = queryTokens.filter(token => nameSet.has(token)).length;
    const coverage = hit / queryTokens.length;
    const reverseCoverage = hit / nameTokens.length;
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
  const trimmed = query.trim();
  if (!trimmed || !zones.length) return { status: "none" };

  if (trimmed.startsWith("nbh:")) {
    const id = trimmed.slice(4);
    const zone = zones.find(item => item.id === id);
    return zone
      ? { status: "unique", match: { zone, score: 100, reason: "id" } }
      : { status: "none" };
  }

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
  const ranked = [...uniqueByZone.values()].sort(
    (left, right) =>
      right.score - left.score ||
      right.zone.name.length - left.zone.name.length ||
      left.zone.name.localeCompare(right.zone.name, "pt-BR"),
  );

  if (!ranked.length) return { status: "none" };

  const best = ranked[0];
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
