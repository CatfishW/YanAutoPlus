(function eduSubtokenMailUtilsModule(root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
    return;
  }

  root.EduSubtokenMailUtils = factory();
})(typeof self !== 'undefined' ? self : globalThis, function createEduSubtokenMailUtils() {
  const DEFAULT_EDU_SUBTOKEN_MAIL_BASE_URL = 'https://edu.subtoken.vip/mail/api';
  const DEFAULT_EDU_SUBTOKEN_MAIL_DOMAIN = 'edu.subtoken.vip';
  const DEFAULT_EDU_SUBTOKEN_MAIL_ACCOUNT_PREFIX = 'subtoken';
  const DEFAULT_EDU_SUBTOKEN_MAIL_NEXT_NUMBER = 1;
  const DEFAULT_EDU_SUBTOKEN_MAIL_NUMBER_PADDING = 3;
  const DEFAULT_MAIL_PAGE_SIZE = 80;

  function firstNonEmptyString(values) {
    for (const value of values) {
      if (value === undefined || value === null) continue;
      const normalized = String(value).trim();
      if (normalized) return normalized;
    }
    return '';
  }

  function normalizeEduSubtokenMailBaseUrl(rawValue = '') {
    const value = String(rawValue || '').trim() || DEFAULT_EDU_SUBTOKEN_MAIL_BASE_URL;
    const candidate = /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(value) ? value : `https://${value}`;
    try {
      const parsed = new URL(candidate);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        return DEFAULT_EDU_SUBTOKEN_MAIL_BASE_URL;
      }
      parsed.hash = '';
      parsed.search = '';
      let pathname = parsed.pathname.replace(/\/+$/, '');
      if (pathname.endsWith('/messages') || pathname.endsWith('/aliases') || pathname.endsWith('/health')) {
        pathname = pathname.replace(/\/(?:messages|aliases|health)$/i, '');
      }
      parsed.pathname = pathname || '/';
      return `${parsed.origin}${parsed.pathname === '/' ? '' : parsed.pathname}`.replace(/\/$/, '');
    } catch {
      return DEFAULT_EDU_SUBTOKEN_MAIL_BASE_URL;
    }
  }

  function normalizeEduSubtokenMailUsernamePart(value = '', fallback = '') {
    const normalized = String(value || '')
      .trim()
      .toLowerCase()
      .replace(/@.*$/g, '')
      .replace(/[^a-z0-9._-]/g, '');
    const clean = normalized.replace(/^[^a-z0-9]+/g, '').slice(0, 32);
    return clean || String(fallback || '').trim().toLowerCase().replace(/[^a-z0-9._-]/g, '').slice(0, 32);
  }

  function normalizeEduSubtokenMailNextNumber(value = DEFAULT_EDU_SUBTOKEN_MAIL_NEXT_NUMBER) {
    const parsed = Math.floor(Number(value));
    return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 999999999) : DEFAULT_EDU_SUBTOKEN_MAIL_NEXT_NUMBER;
  }

  function normalizeEduSubtokenMailNumberPadding(value = DEFAULT_EDU_SUBTOKEN_MAIL_NUMBER_PADDING) {
    const parsed = Math.floor(Number(value));
    return Number.isFinite(parsed) ? Math.min(Math.max(parsed, 0), 8) : DEFAULT_EDU_SUBTOKEN_MAIL_NUMBER_PADDING;
  }

  function buildEduSubtokenMailUsername(options = {}) {
    const nextNumber = normalizeEduSubtokenMailNextNumber(options.nextNumber);
    const numberPadding = normalizeEduSubtokenMailNumberPadding(options.numberPadding);
    const numberText = String(nextNumber).padStart(numberPadding, '0');
    const suffix = normalizeEduSubtokenMailUsernamePart(options.suffix || '');
    const fallbackPrefix = DEFAULT_EDU_SUBTOKEN_MAIL_ACCOUNT_PREFIX;
    const maxPrefixLength = Math.max(1, 32 - numberText.length - suffix.length);
    const prefix = normalizeEduSubtokenMailUsernamePart(options.prefix, fallbackPrefix).slice(0, maxPrefixLength);
    return `${prefix}${numberText}${suffix}`.slice(0, 32);
  }

  function isValidEduSubtokenMailUsername(username = '') {
    const normalized = String(username || '').trim().toLowerCase();
    return /^[a-z0-9][a-z0-9._-]{2,31}$/.test(normalized) && !normalized.includes('..');
  }

  function normalizeEduSubtokenMailAccountPassword(value = '') {
    const normalized = String(value || '');
    return normalized.length >= 10 ? normalized : '';
  }

  function generateEduSubtokenMailAccountPassword(username = '') {
    const alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let random = '';
    if (typeof crypto !== 'undefined' && crypto?.getRandomValues) {
      const bytes = new Uint8Array(12);
      crypto.getRandomValues(bytes);
      for (const byte of bytes) {
        random += alphabet[byte % alphabet.length];
      }
    } else {
      for (let index = 0; index < 12; index += 1) {
        random += alphabet[Math.floor(Math.random() * alphabet.length)];
      }
    }
    const cleanUsername = normalizeEduSubtokenMailUsernamePart(username, 'mail');
    return `YanAutoPlus-${cleanUsername}-${random}`;
  }

  function normalizeEduSubtokenMailCurrentAccount(value = {}) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }
    const email = normalizeEduSubtokenMailReceiveMailbox(value.email);
    const username = normalizeEduSubtokenMailUsernamePart(value.username || (email ? email.split('@')[0] : ''));
    const password = normalizeEduSubtokenMailAccountPassword(value.password);
    if (!email || !username || !password) {
      return null;
    }
    return {
      username,
      email,
      password,
      createdAt: String(value.createdAt || ''),
    };
  }

  function encodeBase64Utf8(value = '') {
    const source = String(value || '');
    if (typeof btoa === 'function') {
      return btoa(unescape(encodeURIComponent(source)));
    }
    if (typeof Buffer !== 'undefined') {
      return Buffer.from(source, 'utf8').toString('base64');
    }
    throw new Error('Base64 encoder unavailable.');
  }

  function buildEduSubtokenMailBasicAuthHeader(username = '', password = '') {
    return `Basic ${encodeBase64Utf8(`${username}:${password}`)}`;
  }

  function normalizeEduSubtokenMailAddress(value = '') {
    return String(value || '').trim().toLowerCase();
  }

  function normalizeEduSubtokenMailReceiveMailbox(value = '') {
    const normalized = normalizeEduSubtokenMailAddress(value);
    if (!normalized) return '';
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) ? normalized : '';
  }

  function normalizeEduSubtokenMailDomain(value = '') {
    let normalized = String(value || '').trim().toLowerCase();
    if (!normalized) return DEFAULT_EDU_SUBTOKEN_MAIL_DOMAIN;
    normalized = normalized.replace(/^@+/, '').replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    return /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(normalized)
      ? normalized
      : DEFAULT_EDU_SUBTOKEN_MAIL_DOMAIN;
  }

  function buildEduSubtokenMailHeaders(config = {}, options = {}) {
    const headers = {};
    if (options.json) {
      headers['Content-Type'] = 'application/json';
    }
    if (options.acceptJson !== false) {
      headers.Accept = 'application/json';
    }
    return headers;
  }

  function joinEduSubtokenMailUrl(baseUrl, path) {
    const normalizedBase = normalizeEduSubtokenMailBaseUrl(baseUrl);
    const normalizedPath = String(path || '').trim();
    if (!normalizedPath) return normalizedBase;
    return `${normalizedBase}${normalizedPath.startsWith('/') ? '' : '/'}${normalizedPath}`;
  }

  function getEduSubtokenMailRows(payload) {
    if (Array.isArray(payload)) return payload;
    if (!payload || typeof payload !== 'object') return [];

    const candidates = [
      payload.messages,
      payload.items,
      payload.results,
      payload.rows,
      payload.data,
      payload.list,
      payload?.data?.messages,
      payload?.data?.items,
      payload?.data?.results,
      payload?.data?.rows,
    ];

    for (const candidate of candidates) {
      if (Array.isArray(candidate)) {
        return candidate;
      }
    }

    return [];
  }

  function stripHtmlTags(value = '') {
    return String(value || '')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function parseEduSubtokenMailTime(value) {
    if (value === undefined || value === null || value === '') return '';
    if (typeof value === 'number' && Number.isFinite(value)) {
      const timestamp = value > 9999999999 ? value : value * 1000;
      return new Date(timestamp).toISOString();
    }
    const source = String(value).trim();
    if (!source) return '';
    const parsed = Date.parse(source);
    return Number.isFinite(parsed) ? new Date(parsed).toISOString() : source;
  }

  function normalizeEduSubtokenSender(value = '') {
    if (!value || typeof value !== 'object') {
      return normalizeEduSubtokenMailAddress(value);
    }
    return normalizeEduSubtokenMailAddress(firstNonEmptyString([
      value.emailAddress?.address,
      value.address,
      value.email,
      value.sender,
      value.from,
    ]));
  }

  function normalizeEduSubtokenBody(row = {}) {
    const bodyObject = row.body && typeof row.body === 'object' ? row.body : null;
    const textBody = firstNonEmptyString([
      row.textBody,
      row.text_body,
      row.plainText,
      row.plain_text,
      row.text,
      bodyObject?.contentType === 'text' ? bodyObject?.content : '',
    ]);
    const htmlBody = firstNonEmptyString([
      row.htmlBody,
      row.html_body,
      row.html,
      bodyObject?.contentType !== 'text' ? bodyObject?.content : '',
      row.bodyHtml,
      row.body_html,
    ]);
    const rawBody = firstNonEmptyString([
      row.body,
      row.content,
      row.raw,
      row.rawMime,
      row.raw_mime,
    ].filter((item) => typeof item !== 'object'));
    return firstNonEmptyString([
      textBody,
      stripHtmlTags(htmlBody),
      stripHtmlTags(rawBody),
    ]);
  }

  function normalizeEduSubtokenMailMessage(row = {}) {
    if (!row || typeof row !== 'object') return null;

    const bodyPreview = firstNonEmptyString([
      row.bodyPreview,
      row.preview,
      row.snippet,
      normalizeEduSubtokenBody(row),
    ]);
    const sender = normalizeEduSubtokenSender(firstNonEmptyString([
      row.from,
      row.sender,
      row.fromEmail,
      row.from_email,
      row.mailFrom,
      row.mail_from,
    ]));
    const address = normalizeEduSubtokenMailAddress(firstNonEmptyString([
      row.to,
      row.recipient,
      row.address,
      row.email,
      row.mailbox,
      row.deliveredTo,
      row.delivered_to,
    ]));

    return {
      id: firstNonEmptyString([row.id, row.messageId, row.message_id, row.mailId, row.mail_id]),
      address,
      subject: firstNonEmptyString([row.subject, row.title]),
      from: {
        emailAddress: {
          address: sender,
        },
      },
      bodyPreview,
      raw: firstNonEmptyString([row.raw, row.rawMime, row.raw_mime, row.content]),
      body: {
        contentType: 'text',
        content: bodyPreview,
      },
      receivedDateTime: parseEduSubtokenMailTime(firstNonEmptyString([
        row.receivedDateTime,
        row.received_at,
        row.receivedAt,
        row.createdAt,
        row.created_at,
        row.date,
        row.time,
      ])),
    };
  }

  function normalizeEduSubtokenMailMessages(payload) {
    return getEduSubtokenMailRows(payload)
      .map((row) => normalizeEduSubtokenMailMessage(row))
      .filter(Boolean);
  }

  return {
    DEFAULT_EDU_SUBTOKEN_MAIL_ACCOUNT_PREFIX,
    DEFAULT_EDU_SUBTOKEN_MAIL_BASE_URL,
    DEFAULT_EDU_SUBTOKEN_MAIL_DOMAIN,
    DEFAULT_EDU_SUBTOKEN_MAIL_NEXT_NUMBER,
    DEFAULT_EDU_SUBTOKEN_MAIL_NUMBER_PADDING,
    DEFAULT_MAIL_PAGE_SIZE,
    buildEduSubtokenMailBasicAuthHeader,
    buildEduSubtokenMailHeaders,
    buildEduSubtokenMailUsername,
    generateEduSubtokenMailAccountPassword,
    isValidEduSubtokenMailUsername,
    joinEduSubtokenMailUrl,
    normalizeEduSubtokenMailAccountPassword,
    normalizeEduSubtokenMailAddress,
    normalizeEduSubtokenMailBaseUrl,
    normalizeEduSubtokenMailCurrentAccount,
    normalizeEduSubtokenMailDomain,
    normalizeEduSubtokenMailMessage,
    normalizeEduSubtokenMailMessages,
    normalizeEduSubtokenMailNextNumber,
    normalizeEduSubtokenMailNumberPadding,
    normalizeEduSubtokenMailReceiveMailbox,
    normalizeEduSubtokenMailUsernamePart,
  };
});
