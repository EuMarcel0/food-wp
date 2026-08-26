export const DEFAULT_PAGE_LIMIT = 20;
export const MAX_PAGE_LIMIT = 100;

export type PageQuery = {
  page: number;
  limit: number;
  offset: number;
};

export type PageResult<T> = {
  items: T[];
  total: number;
  page: number;
  limit: number;
};

export function parsePageQuery(query: {
  page?: unknown;
  limit?: unknown;
}): PageQuery {
  const page = Math.max(1, Math.trunc(Number(query.page)) || 1);
  const rawLimit = Math.trunc(Number(query.limit));
  const limit = Math.min(
    MAX_PAGE_LIMIT,
    Math.max(
      1,
      Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : DEFAULT_PAGE_LIMIT,
    ),
  );
  return { page, limit, offset: (page - 1) * limit };
}

export function paginateItems<T>(
  items: T[],
  page: number,
  limit: number,
): PageResult<T> {
  const start = (page - 1) * limit;
  return {
    items: items.slice(start, start + limit),
    total: items.length,
    page,
    limit,
  };
}
