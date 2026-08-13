'use strict';

/**
 * Veloflix ( Veloflix Website Nonton Film Gratis )
 */

const { setTimeout: sleep } = require('timers/promises');
const fs = require('fs/promises');
const path = require('path');

const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Mobile Safari/537.36';

const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p';

function escapeRegExp(value = '') {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function decodeHtmlEntities(value = '') {
  return String(value)
    .replace(/&#(x[0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex.slice(1), 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}

function normalizeTmdbImage(value, width = 'w500') {
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith('/')) return `${TMDB_IMAGE_BASE}/${width}${value}`;
  return `${TMDB_IMAGE_BASE}/${width}/${value}`;
}

function extractTitle(html = '') {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? decodeHtmlEntities(match[1]).trim() : null;
}

function extractMetaContent(html = '', value, attr = 'name') {
  if (!html || !value) return null;

  const safeValue = escapeRegExp(value);
  const patterns = [
    new RegExp(`<meta[^>]+${attr}=["']${safeValue}["'][^>]+content=["']([^"']*)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+${attr}=["']${safeValue}["']`, 'i'),
  ];

  for (const re of patterns) {
    const match = html.match(re);
    if (match) return decodeHtmlEntities(match[1]).trim();
  }

  return null;
}

function extractLinkHref(html = '', rel) {
  if (!html || !rel) return null;

  const safeRel = escapeRegExp(rel);
  const patterns = [
    new RegExp(`<link[^>]+rel=["']${safeRel}["'][^>]+href=["']([^"']*)["']`, 'i'),
    new RegExp(`<link[^>]+href=["']([^"']*)["'][^>]+rel=["']${safeRel}["']`, 'i'),
  ];

  for (const re of patterns) {
    const match = html.match(re);
    if (match) return decodeHtmlEntities(match[1]).trim();
  }

  return null;
}

function cleanTitleText(title = '') {
  return String(title)
    .replace(/^Nonton\s+(Streaming\s+)?(Film|TV Series|Serial TV|Series)\s*/i, '')
    .replace(/\s*Sub Indo.*$/i, '')
    .replace(/\s*\|\s*Veloflix\s*$/i, '')
    .trim();
}

function parseTitleYear(rawTitle = '') {
  let title = String(rawTitle || '').replace(/\s*\|\s*Veloflix\s*$/i, '').trim();

  const withYear = title.match(/^(.*?)\s*\((\d{4})\)/);
  if (withYear) {
    return {
      title: cleanTitleText(withYear[1]),
      year: Number(withYear[2]),
    };
  }

  const yearAnywhere = title.match(/\((\d{4})\)/);
  if (yearAnywhere) {
    return {
      title: cleanTitleText(title.replace(yearAnywhere[0], '')),
      year: Number(yearAnywhere[1]),
    };
  }

  return {
    title: cleanTitleText(title),
    year: null,
  };
}

function parseHtmlMetadata(html = '') {
  return {
    title: extractTitle(html),
    description:
      extractMetaContent(html, 'description') ||
      extractMetaContent(html, 'og:description', 'property'),
    ogTitle: extractMetaContent(html, 'og:title', 'property'),
    ogDescription: extractMetaContent(html, 'og:description', 'property'),
    ogImage: extractMetaContent(html, 'og:image', 'property'),
    ogType: extractMetaContent(html, 'og:type', 'property'),
    canonical: extractLinkHref(html, 'canonical'),
  };
}

function extractJsonArrayByKey(text, key) {
  if (!text || !key) return null;

  const needle = `"${key}":`;
  let searchFrom = 0;

  while (true) {
    const idx = text.indexOf(needle, searchFrom);
    if (idx === -1) return null;

    const start = text.indexOf('[', idx + needle.length);
    if (start === -1) return null;

    let inString = false;
    let escaped = false;
    let depth = 0;

    for (let i = start; i < text.length; i++) {
      const ch = text[i];

      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (ch === '\\') {
          escaped = true;
        } else if (ch === '"') {
          inString = false;
        }
        continue;
      }

      if (ch === '"') {
        inString = true;
      } else if (ch === '[' || ch === '{') {
        depth++;
      } else if (ch === ']' || ch === '}') {
        depth--;
      }

      if (depth === 0 && ch === ']') {
        const slice = text.slice(start, i + 1);
        try {
          return JSON.parse(slice);
        } catch {
          // lanjut cari occurrence berikutnya jika parse gagal
          break;
        }
      }
    }

    searchFrom = idx + needle.length;
  }
}

function extractNumberByKey(text, key) {
  if (!text || !key) return null;
  const re = new RegExp(`"${escapeRegExp(key)}"\\s*:\\s*(\\d+)`);
  const match = text.match(re);
  return match ? Number(match[1]) : null;
}

class VeloflixError extends Error {
  constructor(message, context = {}) {
    super(message);
    this.name = 'VeloflixError';
    Object.assign(this, context);
  }
}

class Veloflix {
  constructor(options = {}) {
    if (typeof fetch !== 'function' && typeof options.fetchFn !== 'function') {
      throw new VeloflixError(
        'Global fetch tidak tersedia. Gunakan Node.js >= 18 atau sediakan options.fetchFn.'
      );
    }

    this.baseUrl = (options.baseUrl || 'https://veloflix.my.id').replace(/\/+$/, '');
    this.lang = options.lang || 'id';
    this.userAgent = options.userAgent || DEFAULT_USER_AGENT;
    this.referer = options.referer || `${this.baseUrl}/`;

    if (options.cookie && typeof options.cookie === 'object') {
      this.cookie = Object.entries(options.cookie)
        .map(([k, v]) => `${k}=${v}`)
        .join('; ');
    } else {
      this.cookie = options.cookie || '';
    }

    this.timeoutMs = options.timeoutMs ?? 30000;
    this.retries = options.retries ?? 3;
    this.retryDelayMs = options.retryDelayMs ?? 1200;
    this.delayMs = options.delayMs ?? 450;
    this.jitterMs = options.jitterMs ?? 550;
    this.cacheTtlMs = options.cacheTtlMs ?? 0;
    this.includeRaw = options.includeRaw ?? false;

    this.fetchFn = options.fetchFn || ((...args) => fetch(...args));
    this.cache = new Map();
    this.queue = Promise.resolve();
  }

  setCookie(cookie) {
    if (cookie && typeof cookie === 'object') {
      this.cookie = Object.entries(cookie)
        .map(([k, v]) => `${k}=${v}`)
        .join('; ');
    } else {
      this.cookie = cookie || '';
    }
    return this;
  }

  clearCache() {
    this.cache.clear();
    return this;
  }

  buildUrl(pathname, params = {}) {
    const url = new URL(pathname, this.baseUrl);

    for (const [key, value] of Object.entries(params || {})) {
      if (value === undefined || value === null || value === '') continue;
      url.searchParams.set(key, String(value));
    }

    return url;
  }

  enqueue(task) {
    const run = this.queue.then(() => task());
    this.queue = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  }

  async throttle() {
    const delay = this.delayMs + Math.floor(Math.random() * this.jitterMs);
    if (delay > 0) await sleep(delay);
  }

  cacheGet(key) {
    if (this.cacheTtlMs <= 0) return undefined;
    const entry = this.cache.get(key);
    if (!entry) return undefined;

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return undefined;
    }

    return entry.value;
  }

  cacheSet(key, value) {
    if (this.cacheTtlMs <= 0) return;
    this.cache.set(key, {
      value,
      expiresAt: Date.now() + this.cacheTtlMs,
    });
  }


  get baseHeaders() {
    const headers = {
      'User-Agent': this.userAgent,
      'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
      Referer: this.referer,
      Origin: this.baseUrl,
    };

    if (this.cookie) {
      headers.Cookie = this.cookie;
    }

    return headers;
  }

  get pageHeaders() {
    return {
      ...this.baseHeaders,
      Accept:
        'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Upgrade-Insecure-Requests': '1',
    };
  }

  get apiHeaders() {
    return {
      ...this.baseHeaders,
      Accept: 'application/json',
    };
  }

  jsonHeaders() {
    return {
      ...this.apiHeaders,
      'Content-Type': 'application/json',
    };
  }

  getRouterStateTree(pathname = '/') {
    const rootTree = '["",{"children":["__PAGE__",{}]},null,null,true]';

    const categoryTree = (type) =>
      `["",{"children":["category",{"children":[["type","${type}","d"],{"children":["__PAGE__",{}]}]}]},null,null,true]`;

    if (pathname.startsWith('/category/movie')) {
      return encodeURIComponent(categoryTree('movie'));
    }

    if (pathname.startsWith('/category/tv')) {
      return encodeURIComponent(categoryTree('tv'));
    }

    return encodeURIComponent(rootTree);
  }

  rscHeaders(pathname, nextUrl = '/') {
    return {
      ...this.baseHeaders,
      Accept: 'text/x-component',
      RSC: '1',
      'Next-Router-Prefetch': '1',
      'Next-Url': nextUrl,
      'Next-Router-State-Tree': this.getRouterStateTree(pathname),
    };
  }

  async fetchWithTimeout(url, options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    const headers = {
      ...this.baseHeaders,
      ...(options.headers || {}),
    };

    if (options.body && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }

    try {
      return await this.fetchFn(url.toString(), {
        ...options,
        headers,
        signal: controller.signal,
        redirect: options.redirect || 'follow',
      });
    } finally {
      clearTimeout(timer);
    }
  }

  async request(url, options = {}) {
    return this.enqueue(async () => {
      let lastError;

      for (let attempt = 0; attempt <= this.retries; attempt++) {
        try {
          if (attempt === 0) {
            await this.throttle();
          } else {
            await sleep(this.retryDelayMs * attempt);
          }

          const res = await this.fetchWithTimeout(url, options);

          if ((res.status === 429 || res.status >= 500) && attempt < this.retries) {
            continue;
          }

          if (!res.ok) {
            const body = await res.text().catch(() => '');
            throw new VeloflixError(
              `HTTP ${res.status} ${res.statusText || ''}`.trim(),
              {
                status: res.status,
                url: url.toString(),
                body: body.slice(0, 1000),
              }
            );
          }

          return res;
        } catch (err) {
          lastError = err;

          const retryableStatus =
            err instanceof VeloflixError
              ? [429, 500, 502, 503, 504].includes(err.status)
              : true;

          const retryableNetwork =
            err.name === 'AbortError' ||
            /fetch failed|network|ETIMEDOUT|ECONNRESET|ECONNREFUSED/i.test(err.message || '');

          if (attempt < this.retries && (retryableStatus || retryableNetwork)) {
            continue;
          }

          throw err;
        }
      }

      throw lastError;
    });
  }

  async requestText(pathname, params = {}, options = {}) {
    const url = this.buildUrl(pathname, params);
    const method = (options.method || 'GET').toUpperCase();
    const cacheKey = url.toString();

    if (method === 'GET') {
      const cached = this.cacheGet(cacheKey);
      if (cached !== undefined) return cached;
    }

    const res = await this.request(url, options);
    const text = await res.text();

    if (method === 'GET') {
      this.cacheSet(cacheKey, text);
    }

    return text;
  }

  async requestJson(pathname, params = {}, options = {}) {
    const url = this.buildUrl(pathname, params);
    const method = (options.method || 'GET').toUpperCase();
    const cacheKey = url.toString();

    if (method === 'GET') {
      const cached = this.cacheGet(cacheKey);
      if (cached !== undefined) return cached;
    }

    const res = await this.request(url, options);
    const text = await res.text();

    if (!text) {
      return { ok: true };
    }

    let json;
    try {
      json = JSON.parse(text);
    } catch {
      throw new VeloflixError(`Response bukan JSON dari ${url}`, {
        url: url.toString(),
        body: text.slice(0, 1000),
      });
    }

    if (json && json.error) {
      const message =
        typeof json.error === 'string'
          ? json.error
          : json.error.message || 'API mengembalikan error';

      throw new VeloflixError(message, {
        url: url.toString(),
        data: json,
      });
    }

    if (method === 'GET') {
      this.cacheSet(cacheKey, json);
    }

    return json;
  }

  async apiGet(pathname, params = {}) {
    return this.requestJson(pathname, params, {
      headers: this.apiHeaders,
    });
  }

  async apiPost(pathname, body = {}, params = {}) {
    return this.requestJson(pathname, params, {
      method: 'POST',
      headers: this.jsonHeaders(),
      body: JSON.stringify(body),
    });
  }

  async apiDelete(pathname, body = null, params = {}) {
    return this.requestJson(pathname, params, {
      method: 'DELETE',
      headers: this.jsonHeaders(),
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  requireAuth(featureName = 'Endpoint ini') {
    if (!this.cookie) {
      throw new VeloflixError(
        `${featureName} membutuhkan cookie sesi/login. ` +
          `Contoh: new Veloflix({ cookie: 'next-auth.session-token=...; __Secure-next-auth.session-token=...' })`
      );
    }
  }

  normalizeItem(raw) {
    if (!raw) return raw;

    if (typeof raw === 'string') {
      return { title: raw };
    }

    if (typeof raw !== 'object') {
      return raw;
    }

    const id = raw.id ?? raw.tmdbId ?? raw.tmdb_id ?? raw.movieId ?? raw.tvId;
    const mediaType =
      raw.mediaType ??
      raw.media_type ??
      raw.type ??
      (raw.tvId || raw.first_air_date ? 'tv' : 'movie');

    const title =
      raw.title ??
      raw.name ??
      raw.label ??
      raw.original_title ??
      raw.original_name ??
      null;

    const year =
      raw.year ??
      (raw.releaseDate
        ? Number(String(raw.releaseDate).slice(0, 4))
        : raw.release_date
        ? Number(String(raw.release_date).slice(0, 4))
        : null);

    const item = {
      id: id ?? null,
      mediaType,
      title,
      year,
      rating: raw.rating ?? raw.vote_average ?? raw.voteAverage ?? raw.score ?? null,
      voteCount: raw.voteCount ?? raw.vote_count ?? null,
      posterUrl: normalizeTmdbImage(raw.posterUrl ?? raw.poster_path ?? raw.poster, 'w500'),
      backdropUrl: normalizeTmdbImage(
        raw.backdropUrl ?? raw.backdrop_path ?? raw.backdrop,
        'w1280'
      ),
      overview: raw.overview ?? raw.description ?? raw.synopsis ?? null,
      genres: raw.genres ?? raw.genreIds ?? raw.genre_ids ?? [],
      releaseDate: raw.releaseDate ?? raw.release_date ?? raw.first_air_date ?? null,
      logoUrl: raw.logoUrl ?? raw.logo ?? null,
      originalLanguage: raw.originalLanguage ?? raw.original_language ?? null,
      originCountry: raw.originCountry ?? raw.origin_country ?? null,
      imdbId: raw.imdbId ?? raw.imdb_id ?? null,
      url:
        id && mediaType
          ? `${this.baseUrl}/title/${mediaType}/${id}`
          : null,
      watchUrl:
        id && mediaType
          ? `${this.baseUrl}/watch/${mediaType}/${id}?play=1`
          : null,
    };

    if (this.includeRaw) {
      item.raw = raw;
    }

    return item;
  }

  normalizeDetail(data, fallbackType, fallbackId) {
    const base = this.normalizeItem(data || {});

    return {
      ...base,
      id: data?.id ?? fallbackId ?? base.id,
      mediaType: data?.mediaType ?? fallbackType ?? base.mediaType,
      cast: Array.isArray(data?.cast)
        ? data.cast.map((c) => ({
            id: c.id ?? null,
            name: c.name ?? null,
            character: c.character ?? c.role ?? null,
            profileUrl: normalizeTmdbImage(c.profileUrl ?? c.profile_path, 'w185'),
          }))
        : [],
      recommendations: Array.isArray(data?.recommendations)
        ? data.recommendations.map((r) => this.normalizeItem(r))
        : [],
      seasons: Array.isArray(data?.seasons) ? data.seasons : [],
      nextEpisodeToAir: data?.nextEpisodeToAir ?? null,
      trailerYoutubeId: data?.trailerYoutubeId ?? data?.trailer ?? null,
      providers: data?.providers ?? [],
      imdbId: data?.imdbId ?? data?.imdb_id ?? base.imdbId,
    };
  }

  extractListAndMeta(json) {
    if (!json) {
      return { list: [], meta: {} };
    }

    if (Array.isArray(json)) {
      return { list: json, meta: {} };
    }

    const candidates = [json, json.data, json.result, json.results, json.response].filter(Boolean);

    for (const candidate of candidates) {
      if (Array.isArray(candidate)) {
        return { list: candidate, meta: {} };
      }

      if (candidate && typeof candidate === 'object') {
        const possibleKeys = ['items', 'results', 'data', 'list', 'titles', 'records'];
        for (const key of possibleKeys) {
          if (Array.isArray(candidate[key])) {
            return { list: candidate[key], meta: candidate };
          }
        }
      }
    }

    if (typeof json === 'object') {
      return { list: [json], meta: json };
    }

    return { list: [], meta: {} };
  }

  parseCategoryPayload(text, fallbackPage = 1) {
    if (!text) {
      return {
        items: [],
        currentPage: fallbackPage,
        totalPages: 1,
        totalResults: 0,
      };
    }

    let items = extractJsonArrayByKey(text, 'initialItems');

    if (!items) {
      try {
        const json = JSON.parse(text);
        const { list, meta } = this.extractListAndMeta(json);

        if (Array.isArray(list) && list.length) {
          return {
            items: list.map((item) => this.normalizeItem(item)),
            currentPage: meta.currentPage ?? fallbackPage,
            totalPages: meta.totalPages ?? 1,
            totalResults: meta.totalResults ?? list.length,
          };
        }
      } catch {
      }
    }

    if (!items || !Array.isArray(items)) {
      return {
        items: [],
        currentPage: fallbackPage,
        totalPages: 1,
        totalResults: 0,
      };
    }

    return {
      items: items.map((item) => this.normalizeItem(item)),
      currentPage: extractNumberByKey(text, 'currentPage') ?? fallbackPage,
      totalPages: extractNumberByKey(text, 'totalPages') ?? 1,
      totalResults: extractNumberByKey(text, 'totalResults') ?? items.length,
    };
  }

  parseTitleLinksFromHtml(html = '', defaultType = 'movie') {
    const items = [];
    const seen = new Set();
    const re = /href="\/title\/(movie|tv)\/(\d+)"/g;

    let match;
    while ((match = re.exec(html)) !== null) {
      const mediaType = match[1] || defaultType;
      const id = Number(match[2]);
      const key = `${mediaType}-${id}`;

      if (seen.has(key)) continue;
      seen.add(key);

      items.push(
        this.normalizeItem({
          id,
          mediaType,
        })
      );
    }

    return items;
  }

  /* =========================
   * SEARCH
   * ========================= */

  async search(query, params = {}) {
    if (!query) return [];

    const json = await this.apiGet('/api/search', {
      q: query,
      ...params,
    });

    const { list } = this.extractListAndMeta(json);

    return list.map((item) =>
      typeof item === 'string' ? { title: item } : this.normalizeItem(item)
    );
  }

  async getSearchTrending(limit = 10) {
    const json = await this.apiGet('/api/search/trending', { limit });
    const { list } = this.extractListAndMeta(json);

    return list.map((item) => {
      if (typeof item === 'string') return { label: item };
      if (item && item.label) return item;
      return this.normalizeItem(item);
    });
  }

  /* =========================
   * TRENDING
   * ========================= */

  async getTrendingCountry(options = {}) {
    const {
      country = 'ID',
      type = 'movie', // movie | tv
      page = 1,
      limit,
      lang = this.lang,
    } = options;

    const params = {
      country,
      type,
      page,
      lang,
    };

    if (limit) params.limit = limit;

    const json = await this.apiGet('/api/trending/country', params);
    const { list, meta } = this.extractListAndMeta(json);

    return {
      items: list.map((item) => this.normalizeItem(item)),
      currentPage: meta.currentPage ?? page,
      totalPages: meta.totalPages ?? null,
      totalResults: meta.totalResults ?? list.length,
      meta,
    };
  }

  async getHomeFeed({ country = 'ID' } = {}) {
    const movies = await this.getTrendingCountry({ country, type: 'movie' });
    const series = await this.getTrendingCountry({ country, type: 'tv' });

    return {
      movies: movies.items,
      series: series.items,
      meta: {
        movies,
        series,
      },
    };
  }

  async getCategoryPage(options = {}) {
    const {
      type = 'movie', // movie | tv
      page = 1,
      genre,
      sort,
      year,
      minRating,
      rating,
      country,
      q,
      search,
      lang,
    } = options;

    const params = {
      page,
      genre,
      sort,
      year,
      country,
      q: q ?? search,
      lang: lang ?? this.lang,
    };

    const effectiveMinRating = minRating ?? rating;
    if (effectiveMinRating !== undefined && effectiveMinRating !== null) {
      params.minRating = effectiveMinRating;
    }

    const pathname = `/category/${type}`;
    const errors = [];

    try {
      const text = await this.requestText(pathname, params, {
        headers: this.rscHeaders(pathname, pathname),
      });

      const parsed = this.parseCategoryPayload(text, page);
      if (parsed.items.length) {
        return {
          ...parsed,
          source: 'rsc',
        };
      }
    } catch (err) {
      errors.push(err);
    }

    try {
      const html = await this.requestText(pathname, params, {
        headers: this.pageHeaders,
      });

      const parsed = this.parseCategoryPayload(html, page);
      if (parsed.items.length) {
        return {
          ...parsed,
          source: 'html',
        };
      }

      const fallbackItems = this.parseTitleLinksFromHtml(html, type);
      if (fallbackItems.length) {
        return {
          items: fallbackItems,
          currentPage: page,
          totalPages: 1,
          totalResults: fallbackItems.length,
          source: 'html-links',
        };
      }
    } catch (err) {
      errors.push(err);
    }

    throw new VeloflixError(
      `Gagal mengambil kategori ${type}. Kemungkinan struktur berubah atau diblokir. ` +
        `Errors: ${errors.map((e) => e.message).join(' | ')}`,
      { errors }
    );
  }

  async *iterateCategory(options = {}) {
    const maxPages = options.maxPages ?? Infinity;
    let page = options.page ?? 1;

    while (page <= maxPages) {
      const data = await this.getCategoryPage({
        ...options,
        page,
      });

      yield data;

      if (!data.items.length) break;
      if (page >= (data.totalPages ?? page)) break;

      page += 1;
    }
  }

  async collectCategory(options = {}) {
    const items = [];

    for await (const pageData of this.iterateCategory(options)) {
      items.push(...pageData.items);

      if (options.limit && items.length >= options.limit) {
        break;
      }
    }

    return options.limit ? items.slice(0, options.limit) : items;
  }

  async getTitle(type, id) {
    try {
      const json = await this.apiGet(`/api/title/${type}/${id}`);
      const payload = json?.data ?? json;

      if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
        return this.normalizeDetail(payload, type, id);
      }

      if (Array.isArray(payload) && payload.length) {
        return this.normalizeDetail(payload[0], type, id);
      }
    } catch {
    }

    return this.scrapeTitleMeta(type, id);
  }

  async scrapeTitleMeta(type, id) {
    const html = await this.requestText(`/title/${type}/${id}`, {}, {
      headers: this.pageHeaders,
    });

    const meta = parseHtmlMetadata(html);
    const parsed = parseTitleYear(meta.ogTitle || meta.title || '');

    return {
      id: Number(id),
      mediaType: type,
      title: parsed.title || meta.ogTitle || meta.title || null,
      year: parsed.year,
      description: meta.description || meta.ogDescription || null,
      posterUrl: normalizeTmdbImage(meta.ogImage, 'w1280'),
      canonical: meta.canonical,
      ogType: meta.ogType,
      source: 'html',
    };
  }

  async getWatchPage(type, id, options = {}) {
    const params = {
      play: options.play ?? 1,
    };

    const html = await this.requestText(`/watch/${type}/${id}`, params, {
      headers: this.pageHeaders,
    });

    const meta = parseHtmlMetadata(html);
    const parsed = parseTitleYear(meta.title || meta.ogTitle || '');

    return {
      id: Number(id),
      mediaType: type,
      title: parsed.title || meta.ogTitle || meta.title || null,
      year: parsed.year,
      description: meta.description || meta.ogDescription || null,
      posterUrl: normalizeTmdbImage(meta.ogImage, 'w1280'),
      canonical: meta.canonical,
      note:
        'URL stream tidak tersedia di HTML awal. Player kemungkinan dimuat lewat request client-side.',
    };
  }

  /* =========================
   * WATCHLIST (butuh login)
   * ========================= */

  async getWatchlist() {
    this.requireAuth('getWatchlist()');
    return this.apiGet('/api/watchlist');
  }

  async addWatchlist({ tmdbId, mediaType, title, posterUrl, type } = {}) {
    this.requireAuth('addWatchlist()');

    return this.apiPost('/api/watchlist', {
      tmdbId,
      mediaType: mediaType ?? type,
      title,
      posterUrl,
    });
  }

  async removeWatchlist({ tmdbId, mediaType, type } = {}) {
    this.requireAuth('removeWatchlist()');

    return this.apiDelete('/api/watchlist', {
      tmdbId,
      mediaType: mediaType ?? type,
    });
  }

  async getReaction({ tmdbId, mediaType } = {}) {
    return this.apiGet('/api/user/reactions', {
      tmdbId,
      mediaType,
    });
  }

  async getCommunityFavorites(params = {}) {
    return this.apiGet('/api/user/reactions', {
      mode: 'community',
      ...params,
    });
  }

  async setReaction(payload = {}) {
    const body = {
      tmdbId: payload.tmdbId ?? payload.id,
      mediaType: payload.mediaType ?? payload.type,
      reaction: payload.reaction ?? null, // 'like' | 'dislike' | null
      title: payload.title,
      posterUrl: payload.posterUrl,
      backdropUrl: payload.backdropUrl,
      rating: payload.rating,
      year: payload.year,
      genres: payload.genres,
    };

    return this.apiPost('/api/user/reactions', body);
  }

  async like(payload = {}) {
    return this.setReaction({ ...payload, reaction: 'like' });
  }

  async dislike(payload = {}) {
    return this.setReaction({ ...payload, reaction: 'dislike' });
  }

  async removeReaction(payload = {}) {
    return this.setReaction({ ...payload, reaction: null });
  }

  /* =========================
   * CONTINUE WATCHING
   * ========================= */

  async getContinueWatching() {
    this.requireAuth('getContinueWatching()');
    return this.apiGet('/api/continue-watching');
  }

  async saveContinueWatching(payload = {}) {
    this.requireAuth('saveContinueWatching()');

    return this.apiPost('/api/continue-watching', {
      tmdbId: payload.tmdbId ?? payload.id,
      mediaType: payload.mediaType ?? payload.type,
      positionSeconds: payload.positionSeconds ?? 0,
      durationSeconds: payload.durationSeconds ?? null,
      title: payload.title,
      posterUrl: payload.posterUrl,
    });
  }

  async deleteContinueWatching(payload = {}) {
    this.requireAuth('deleteContinueWatching()');

    return this.apiDelete('/api/continue-watching', {
      tmdbId: payload.tmdbId ?? payload.id,
      mediaType: payload.mediaType ?? payload.type,
    });
  }

  /* =========================
   * NOBAR ROOMS
   * ========================= */

  async getNobarRooms() {
    return this.apiGet('/api/nobar/rooms');
  }

  async downloadFile(url, filePath) {
    const res = await this.request(new URL(url), {
      headers: {
        Accept: '*/*',
      },
    });

    const buffer = Buffer.from(await res.arrayBuffer());
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, buffer);

    return filePath;
  }

  static async writeJson(filePath, data) {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
    return filePath;
  }

  /* =========================
   * GENRE STATIS DARI DATA
   * ========================= */

  static get movieGenres() {
    return [
      { id: 28, name: 'Action' },
      { id: 12, name: 'Adventure' },
      { id: 16, name: 'Animation' },
      { id: 35, name: 'Comedy' },
      { id: 80, name: 'Crime' },
      { id: 99, name: 'Documentary' },
      { id: 18, name: 'Drama' },
      { id: 10751, name: 'Family' },
      { id: 14, name: 'Fantasy' },
      { id: 36, name: 'History' },
      { id: 27, name: 'Horror' },
      { id: 10402, name: 'Music' },
      { id: 9648, name: 'Mystery' },
      { id: 10749, name: 'Romance' },
      { id: 878, name: 'Sci-Fi' },
      { id: 10770, name: 'TV Movie' },
      { id: 53, name: 'Thriller' },
      { id: 10752, name: 'War' },
      { id: 37, name: 'Western' },
    ];
  }

  static get tvGenres() {
    return [
      { id: 10759, name: 'Action & Adventure' },
      { id: 16, name: 'Animation' },
      { id: 35, name: 'Comedy' },
      { id: 80, name: 'Crime' },
      { id: 99, name: 'Documentary' },
      { id: 18, name: 'Drama' },
      { id: 10751, name: 'Family' },
      { id: 10762, name: 'Kids' },
      { id: 9648, name: 'Mystery' },
      { id: 10763, name: 'News' },
      { id: 10764, name: 'Reality' },
      { id: 10765, name: 'Sci-Fi & Fantasy' },
      { id: 10766, name: 'Soap' },
      { id: 10767, name: 'Talk' },
      { id: 10768, name: 'War & Politics' },
      { id: 37, name: 'Western' },
    ];
  }

  static get animeGenres() {
    return [
      { id: 28, name: 'Action' },
      { id: 12, name: 'Adventure' },
      { id: 35, name: 'Comedy' },
      { id: 18, name: 'Drama' },
      { id: 14, name: 'Fantasy' },
      { id: 27, name: 'Horror' },
      { id: 9648, name: 'Mystery' },
      { id: 10749, name: 'Romance' },
      { id: 878, name: 'Sci-Fi' },
      { id: 53, name: 'Thriller' },
      { id: 10751, name: 'Slice of Life' },
    ];
  }

  static findGenre(type, query) {
    const list =
      type === 'tv'
        ? Veloflix.tvGenres
        : type === 'anime'
        ? Veloflix.animeGenres
        : Veloflix.movieGenres;

    const q = String(query).toLowerCase();

    return list.find(
      (g) =>
        g.id === Number(query) ||
        g.name.toLowerCase().includes(q)
    );
  }
}

module.exports = {
  Veloflix,
  VeloflixError,
};

if (require.main === module) {
  (async () => {
    try {
      const scraper = new Veloflix({
        lang: 'id',
        delayMs: 700,
        jitterMs: 600,
        cacheTtlMs: 60_000,
        includeRaw: false,
        // cookie: 'next-auth.session-token=...; __Secure-next-auth.session-token=...'
      });

      // 1) Kategori movie genre Action
      console.log('Mengambil kategori movie genre Action...');
      const category = await scraper.getCategoryPage({
        type: 'movie',
        genre: 28,
        page: 1,
      });

      console.log(`Total halaman: ${category.totalPages}`);
      console.log(`Item di halaman ini: ${category.items.length}`);
      console.log(category.items.slice(0, 2));

      // 2) Detail title
      console.log('Mengambil detail title...');
      const detail = await scraper.getTitle('movie', 969681);
      console.log(detail);

      // 3) Search
      console.log('Mengambil hasil search...');
      const searchResults = await scraper.search('spider-man');
      console.log(searchResults.slice(0, 3));

      // 4) Trending country
      console.log('Mengambil trending movie ID...');
      const trending = await scraper.getTrendingCountry({
        country: 'ID',
        type: 'movie',
        page: 1,
      });
      console.log(trending.items.slice(0, 3));

    } catch (err) {
      console.error('ERROR:', err);
      process.exit(1);
    }
  })();
}
