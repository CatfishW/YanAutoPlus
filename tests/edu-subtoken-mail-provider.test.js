const test = require('node:test');
const assert = require('node:assert/strict');

const utils = require('../edu-subtoken-mail-utils.js');
require('../background/edu-subtoken-mail-provider.js');

function createProviderApi(options = {}) {
  const calls = [];
  const logs = [];
  const persistedSettings = [];
  const sessionStates = [];
  const broadcasts = [];
  const persistedEmails = [];
  const messages = options.messages || [{
    id: 'mail-1',
    to: 'subtoken001@edu.subtoken.vip',
    from: 'noreply@tm.openai.com',
    subject: 'OpenAI verification code',
    textBody: 'Your verification code is 123456.',
    receivedAt: '2026-05-20T21:53:14.000Z',
  }];
  const details = options.details || {};
  const fetchImpl = async (url, request = {}) => {
    calls.push({ url: String(url), request });
    const parsed = new URL(String(url));
    if (/\/register$/.test(parsed.pathname)) {
      const payload = JSON.parse(request.body || '{}');
      if (options.claimedUsernames?.has(payload.username)) {
        return {
          ok: false,
          status: 409,
          text: async () => JSON.stringify({ error: 'That notebook name is already claimed.' }),
        };
      }
      return {
        ok: true,
        status: 201,
        text: async () => JSON.stringify({
          user: {
            username: payload.username,
            email: `${payload.username}@edu.subtoken.vip`,
          },
        }),
      };
    }
    if (/\/login$/.test(parsed.pathname)) {
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ user: { email: 'subtoken001@edu.subtoken.vip' } }),
      };
    }
    if (/\/messages\/[^/]+$/.test(parsed.pathname)) {
      const id = decodeURIComponent(parsed.pathname.split('/').pop());
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify(details[id] || messages.find((message) => String(message.id) === id) || {}),
      };
    }
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ messages }),
    };
  };
  const api = globalThis.MultiPageBackgroundEduSubtokenMailProvider.createEduSubtokenMailProvider({
    addLog: async (message, level) => logs.push({ message, level }),
    buildEduSubtokenMailBasicAuthHeader: utils.buildEduSubtokenMailBasicAuthHeader,
    buildEduSubtokenMailHeaders: utils.buildEduSubtokenMailHeaders,
    buildEduSubtokenMailUsername: utils.buildEduSubtokenMailUsername,
    EDU_SUBTOKEN_MAIL_DEFAULT_PAGE_SIZE: 80,
    EDU_SUBTOKEN_MAIL_GENERATOR: 'edu-subtoken-mail-api',
    EDU_SUBTOKEN_MAIL_PROVIDER: 'edu-subtoken-mail-api',
    fetchImpl,
    generateEduSubtokenMailAccountPassword: () => 'GeneratedPassword123',
    getState: async () => ({}),
    isValidEduSubtokenMailUsername: utils.isValidEduSubtokenMailUsername,
    joinEduSubtokenMailUrl: utils.joinEduSubtokenMailUrl,
    normalizeEduSubtokenMailAccountPassword: utils.normalizeEduSubtokenMailAccountPassword,
    normalizeEduSubtokenMailAddress: utils.normalizeEduSubtokenMailAddress,
    normalizeEduSubtokenMailBaseUrl: utils.normalizeEduSubtokenMailBaseUrl,
    normalizeEduSubtokenMailCurrentAccount: utils.normalizeEduSubtokenMailCurrentAccount,
    normalizeEduSubtokenMailDomain: utils.normalizeEduSubtokenMailDomain,
    normalizeEduSubtokenMailMessages: utils.normalizeEduSubtokenMailMessages,
    normalizeEduSubtokenMailNextNumber: utils.normalizeEduSubtokenMailNextNumber,
    normalizeEduSubtokenMailNumberPadding: utils.normalizeEduSubtokenMailNumberPadding,
    normalizeEduSubtokenMailReceiveMailbox: utils.normalizeEduSubtokenMailReceiveMailbox,
    normalizeEduSubtokenMailUsernamePart: utils.normalizeEduSubtokenMailUsernamePart,
    persistRegistrationEmailState: async (state, email, persistOptions) => persistedEmails.push({ state, email, options: persistOptions }),
    pickVerificationMessageWithTimeFallback: options.pickVerificationMessageWithTimeFallback || ((currentMessages) => {
      const message = currentMessages.find((item) => /\b\d{6}\b/.test(String(item.bodyPreview || '')));
      return {
        match: message
          ? {
              code: String(message.bodyPreview).match(/\b(\d{6})\b/)[1],
              receivedAt: Date.parse(message.receivedDateTime),
              message,
            }
          : null,
        usedRelaxedFilters: false,
        usedTimeFallback: false,
      };
    }),
    setEmailState: async () => {},
    setPersistentSettings: async (updates) => persistedSettings.push(updates),
    setState: async (updates) => sessionStates.push(updates),
    broadcastDataUpdate: (updates) => broadcasts.push(updates),
    sleepWithStop: async () => {},
    throwIfStopped: () => {},
  });
  return {
    ...api,
    snapshot() {
      return { broadcasts, calls, logs, persistedEmails, persistedSettings, sessionStates };
    },
  };
}

test('fetchEduSubtokenMailAddress creates a real mailbox account from prefix and auto number', async () => {
  const api = createProviderApi();
  const state = {
    eduSubtokenMailAccountPrefix: 'subtoken',
    eduSubtokenMailNextNumber: 1,
    eduSubtokenMailNumberPadding: 3,
    eduSubtokenMailAccountSuffix: '',
  };

  const email = await api.fetchEduSubtokenMailAddress(state, { preserveAccountIdentity: true });

  assert.equal(email, 'subtoken001@edu.subtoken.vip');
  const registerCall = api.snapshot().calls[0];
  assert.equal(new URL(registerCall.url).pathname, '/mail/api/register');
  assert.equal(registerCall.request.headers.Authorization, undefined);
  assert.equal(registerCall.request.credentials, 'include');
  assert.deepEqual(JSON.parse(registerCall.request.body), {
    username: 'subtoken001',
    password: 'GeneratedPassword123',
  });
  assert.equal(api.snapshot().persistedSettings[0].eduSubtokenMailNextNumber, 2);
  assert.deepEqual(api.snapshot().persistedSettings[0].eduSubtokenMailCurrentAccount, {
    username: 'subtoken001',
    email: 'subtoken001@edu.subtoken.vip',
    password: 'GeneratedPassword123',
    createdAt: api.snapshot().persistedSettings[0].eduSubtokenMailCurrentAccount.createdAt,
  });
  assert.deepEqual(api.snapshot().sessionStates[0], api.snapshot().persistedSettings[0]);
  assert.deepEqual(api.snapshot().broadcasts[0], api.snapshot().persistedSettings[0]);
  assert.deepEqual(api.snapshot().persistedEmails[0], {
    state,
    email: 'subtoken001@edu.subtoken.vip',
    options: {
      source: 'generated:edu-subtoken-mail-api',
      preserveAccountIdentity: true,
    },
  });
});

test('fetchEduSubtokenMailAddress skips claimed usernames and keeps suffix configurable', async () => {
  const api = createProviderApi({ claimedUsernames: new Set(['subtoken001jp']) });

  const email = await api.fetchEduSubtokenMailAddress({
    eduSubtokenMailAccountPrefix: 'subtoken',
    eduSubtokenMailNextNumber: 1,
    eduSubtokenMailNumberPadding: 3,
    eduSubtokenMailAccountSuffix: 'jp',
  });

  assert.equal(email, 'subtoken002jp@edu.subtoken.vip');
  assert.equal(api.snapshot().calls.length, 2);
  assert.equal(JSON.parse(api.snapshot().calls[1].request.body).username, 'subtoken002jp');
  assert.equal(api.snapshot().persistedSettings[0].eduSubtokenMailNextNumber, 3);
});

test('pollEduSubtokenMailVerificationCode uses current account session auth and returns code from inbox', async () => {
  const api = createProviderApi();

  const result = await api.pollEduSubtokenMailVerificationCode(8, {
    mailProvider: 'edu-subtoken-mail-api',
    email: 'subtoken001@edu.subtoken.vip',
    eduSubtokenMailCurrentAccount: {
      username: 'subtoken001',
      email: 'subtoken001@edu.subtoken.vip',
      password: 'GeneratedPassword123',
    },
  }, {
    maxAttempts: 1,
    intervalMs: 1,
  });

  assert.equal(result.code, '123456');
  const firstCall = api.snapshot().calls[0];
  assert.equal(firstCall.request.headers.Authorization, utils.buildEduSubtokenMailBasicAuthHeader('subtoken001', 'GeneratedPassword123'));
  assert.equal(firstCall.request.credentials, 'include');
  assert.equal(new URL(firstCall.url).pathname, '/mail/api/messages');
  assert.equal(new URL(firstCall.url).searchParams.get('folder'), 'inbox');
});

test('pollEduSubtokenMailVerificationCode fetches detail when list preview has no code', async () => {
  const api = createProviderApi({
    messages: [{
      id: 'mail-2',
      to: 'subtoken001@edu.subtoken.vip',
      from: 'noreply@tm.openai.com',
      subject: 'OpenAI verification code',
      textBody: 'Open this message for the code.',
      receivedAt: '2026-05-20T21:53:14.000Z',
    }],
    details: {
      'mail-2': {
        id: 'mail-2',
        to: 'subtoken001@edu.subtoken.vip',
        from: 'noreply@tm.openai.com',
        subject: 'OpenAI verification code',
        textBody: 'Your verification code is 654321.',
        receivedAt: '2026-05-20T21:53:30.000Z',
      },
    },
  });

  const result = await api.pollEduSubtokenMailVerificationCode(4, {
    email: 'subtoken001@edu.subtoken.vip',
    eduSubtokenMailCurrentAccount: {
      username: 'subtoken001',
      email: 'subtoken001@edu.subtoken.vip',
      password: 'GeneratedPassword123',
    },
  }, {
    maxAttempts: 1,
    intervalMs: 1,
  });

  assert.equal(result.code, '654321');
  assert.ok(api.snapshot().calls.some((call) => /\/messages\/mail-2$/.test(new URL(call.url).pathname)));
});
