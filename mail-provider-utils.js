(function attachMailProviderUtils(root, factory) {
  const api = factory();

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }

  if (root) {
    root.MailProviderUtils = api;
  }
})(typeof self !== 'undefined' ? self : globalThis, function createMailProviderUtils() {
  const HOTMAIL_PROVIDER = 'hotmail-api';
  const GMAIL_PROVIDER = 'gmail';
  const DEFAULT_GMAIL_MAILBOX_URL = 'https://mail.google.com/mail/u/0/#inbox';
  const EDU_SUBTOKEN_MAIL_PROVIDER = 'edu-subtoken-mail-api';
  const NETEASE_LIST_PATH = '/js6/main.jsp?df=mail163_letter#module=mbox.ListModule%7C%7B%22fid%22%3A1%2C%22order%22%3A%22date%22%2C%22desc%22%3Atrue%7D';
  const ICLOUD_TARGET_MAILBOX_TYPE_INBOX = 'icloud-inbox';
  const ICLOUD_TARGET_MAILBOX_TYPE_FORWARD = 'forward-mailbox';
  const ICLOUD_FORWARD_MAIL_PROVIDER_OPTIONS = [
    { value: 'qq', label: 'QQ 邮箱' },
    { value: '163', label: '163 邮箱' },
    { value: '163-vip', label: '163 VIP 邮箱' },
    { value: '126', label: '126 邮箱' },
    { value: GMAIL_PROVIDER, label: 'Gmail 邮箱' },
  ];

  function normalizeMailProvider(value = '') {
    const normalized = String(value || '').trim().toLowerCase();
    switch (normalized) {
      case HOTMAIL_PROVIDER:
      case GMAIL_PROVIDER:
      case EDU_SUBTOKEN_MAIL_PROVIDER:
      case '163':
      case '163-vip':
      case '126':
      case 'qq':
      case 'inbucket':
        return normalized;
      default:
        return '163';
    }
  }

  function normalizeIcloudTargetMailboxType(value = '') {
    return String(value || '').trim().toLowerCase() === ICLOUD_TARGET_MAILBOX_TYPE_FORWARD
      ? ICLOUD_TARGET_MAILBOX_TYPE_FORWARD
      : ICLOUD_TARGET_MAILBOX_TYPE_INBOX;
  }

  function normalizeIcloudForwardMailProvider(value = '') {
    const normalized = String(value || '').trim().toLowerCase();
    return ICLOUD_FORWARD_MAIL_PROVIDER_OPTIONS.some((option) => option.value === normalized)
      ? normalized
      : 'qq';
  }

  function getIcloudForwardMailProviderOptions() {
    return ICLOUD_FORWARD_MAIL_PROVIDER_OPTIONS.map((option) => ({ ...option }));
  }

  function normalizeGmailMailboxUrl(value = '') {
    const raw = String(value || '').trim();
    if (!raw) {
      return DEFAULT_GMAIL_MAILBOX_URL;
    }
    if (/^\d+$/.test(raw)) {
      return `https://mail.google.com/mail/u/${raw}/#inbox`;
    }
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)) {
      return `https://mail.google.com/mail/u/${encodeURIComponent(raw)}/#inbox`;
    }
    try {
      const parsed = new URL(raw);
      if (parsed.protocol !== 'https:' || parsed.hostname !== 'mail.google.com') {
        return DEFAULT_GMAIL_MAILBOX_URL;
      }
      if (!/^\/mail\/u\/[^/]+\/?$/.test(parsed.pathname)) {
        return DEFAULT_GMAIL_MAILBOX_URL;
      }
      const hash = parsed.hash && /^#(?:inbox|search\/[^#]+|all|sent|spam|trash|category\/[^#]+)$/i.test(parsed.hash)
        ? parsed.hash
        : '#inbox';
      parsed.search = '';
      parsed.hash = hash;
      return parsed.toString();
    } catch {
      return DEFAULT_GMAIL_MAILBOX_URL;
    }
  }

  function getIcloudForwardMailConfig(provider = 'qq') {
    const normalizedProvider = normalizeIcloudForwardMailProvider(provider);
    if (normalizedProvider === GMAIL_PROVIDER) {
      return {
        source: 'gmail-mail',
        url: 'https://mail.google.com/mail/u/0/#inbox',
        label: 'Gmail 邮箱',
        inject: ['content/activation-utils.js', 'content/utils.js', 'content/gmail-mail.js'],
        injectSource: 'gmail-mail',
      };
    }

    return getMailProviderConfig({ mailProvider: normalizedProvider });
  }

  function getMailProviderConfig(state = {}, options = {}) {
    const provider = normalizeMailProvider(state.mailProvider);
    const normalizeInbucketOrigin = options.normalizeInbucketOrigin || (() => '');

    if (provider === HOTMAIL_PROVIDER) {
      return { provider: HOTMAIL_PROVIDER, label: 'Hotmail（微软 Graph）' };
    }
    if (provider === EDU_SUBTOKEN_MAIL_PROVIDER) {
      return { provider: EDU_SUBTOKEN_MAIL_PROVIDER, label: 'Edu Subtoken Mail API' };
    }
    if (provider === GMAIL_PROVIDER) {
      return {
        source: 'gmail-mail',
        url: normalizeGmailMailboxUrl(state.gmailMailboxUrl),
        label: 'Gmail 邮箱',
        inject: ['content/activation-utils.js', 'content/utils.js', 'content/gmail-mail.js'],
        injectSource: 'gmail-mail',
      };
    }
    if (provider === '163') {
      return {
        source: 'mail-163',
        url: `https://mail.163.com${NETEASE_LIST_PATH}`,
        label: '163 邮箱',
      };
    }
    if (provider === '163-vip') {
      return {
        source: 'mail-163',
        url: `https://webmail.vip.163.com${NETEASE_LIST_PATH}`,
        label: '163 VIP 邮箱',
      };
    }
    if (provider === '126') {
      return {
        source: 'mail-163',
        url: `https://mail.126.com${NETEASE_LIST_PATH}`,
        label: '126 邮箱',
      };
    }
    if (provider === 'inbucket') {
      const host = normalizeInbucketOrigin(state.inbucketHost);
      const mailbox = String(state.inbucketMailbox || '').trim();
      if (!host) {
        return { error: 'Inbucket 主机地址为空或无效。' };
      }
      if (!mailbox) {
        return { error: 'Inbucket 邮箱名称为空。' };
      }
      return {
        source: 'inbucket-mail',
        url: `${host}/m/${encodeURIComponent(mailbox)}/`,
        label: `Inbucket 邮箱（${mailbox}）`,
        navigateOnReuse: true,
        inject: ['content/activation-utils.js', 'content/utils.js', 'content/inbucket-mail.js'],
        injectSource: 'inbucket-mail',
      };
    }
    return { source: 'qq-mail', url: 'https://wx.mail.qq.com/', label: 'QQ 邮箱' };
  }

  return {
    DEFAULT_GMAIL_MAILBOX_URL,
    EDU_SUBTOKEN_MAIL_PROVIDER,
    GMAIL_PROVIDER,
    HOTMAIL_PROVIDER,
    getIcloudForwardMailConfig,
    getIcloudForwardMailProviderOptions,
    getMailProviderConfig,
    normalizeIcloudForwardMailProvider,
    normalizeIcloudTargetMailboxType,
    normalizeGmailMailboxUrl,
    normalizeMailProvider,
  };
});
