const test = require('node:test');
const assert = require('node:assert/strict');

const {
  EDU_SUBTOKEN_MAIL_PROVIDER,
  GMAIL_PROVIDER,
  HOTMAIL_PROVIDER,
  getIcloudForwardMailConfig,
  getIcloudForwardMailProviderOptions,
  getMailProviderConfig,
  normalizeGmailMailboxUrl,
  normalizeIcloudForwardMailProvider,
  normalizeIcloudTargetMailboxType,
  normalizeMailProvider,
} = require('../mail-provider-utils.js');

test('normalizeMailProvider accepts 126 and falls back to 163', () => {
  assert.equal(normalizeMailProvider('126'), '126');
  assert.equal(normalizeMailProvider('163-vip'), '163-vip');
  assert.equal(normalizeMailProvider('gmail'), GMAIL_PROVIDER);
  assert.equal(normalizeMailProvider('edu-subtoken-mail-api'), EDU_SUBTOKEN_MAIL_PROVIDER);
  assert.equal(normalizeMailProvider('unknown-provider'), '163');
});

test('getMailProviderConfig returns the shared NetEase source for 126 mail', () => {
  assert.deepEqual(
    getMailProviderConfig({ mailProvider: '126' }),
    {
      source: 'mail-163',
      url: 'https://mail.126.com/js6/main.jsp?df=mail163_letter#module=mbox.ListModule%7C%7B%22fid%22%3A1%2C%22order%22%3A%22date%22%2C%22desc%22%3Atrue%7D',
      label: '126 邮箱',
    }
  );
});

test('getMailProviderConfig preserves the hotmail provider sentinel', () => {
  assert.deepEqual(
    getMailProviderConfig({ mailProvider: HOTMAIL_PROVIDER }),
    {
      provider: HOTMAIL_PROVIDER,
      label: 'Hotmail（微软 Graph）',
    }
  );
});

test('getMailProviderConfig preserves the edu subtoken provider sentinel', () => {
  assert.deepEqual(
    getMailProviderConfig({ mailProvider: EDU_SUBTOKEN_MAIL_PROVIDER }),
    {
      provider: EDU_SUBTOKEN_MAIL_PROVIDER,
      label: 'Edu Subtoken Mail API',
    }
  );
});

test('getMailProviderConfig returns Gmail tab polling config', () => {
  assert.deepEqual(getMailProviderConfig({ mailProvider: GMAIL_PROVIDER }), {
    source: 'gmail-mail',
    url: 'https://mail.google.com/mail/u/0/#inbox',
    label: 'Gmail 邮箱',
    inject: ['content/activation-utils.js', 'content/utils.js', 'content/gmail-mail.js'],
    injectSource: 'gmail-mail',
  });
});

test('Gmail mailbox URL accepts account index, email, and safe Gmail URLs', () => {
  assert.equal(normalizeGmailMailboxUrl(''), 'https://mail.google.com/mail/u/0/#inbox');
  assert.equal(normalizeGmailMailboxUrl('1'), 'https://mail.google.com/mail/u/1/#inbox');
  assert.equal(normalizeGmailMailboxUrl('name@gmail.com'), 'https://mail.google.com/mail/u/name%40gmail.com/#inbox');
  assert.equal(
    normalizeGmailMailboxUrl('https://mail.google.com/mail/u/2/#search/openai'),
    'https://mail.google.com/mail/u/2/#search/openai'
  );
  assert.equal(normalizeGmailMailboxUrl('https://example.com/mail/u/2/#inbox'), 'https://mail.google.com/mail/u/0/#inbox');
});

test('getMailProviderConfig uses configured Gmail mailbox target', () => {
  assert.deepEqual(getMailProviderConfig({ mailProvider: 'gmail', gmailMailboxUrl: '1' }), {
    source: 'gmail-mail',
    url: 'https://mail.google.com/mail/u/1/#inbox',
    label: 'Gmail 邮箱',
    inject: ['content/activation-utils.js', 'content/utils.js', 'content/gmail-mail.js'],
    injectSource: 'gmail-mail',
  });
});

test('iCloud forward mailbox helpers normalize and expose supported providers', () => {
  assert.equal(normalizeIcloudTargetMailboxType('forward-mailbox'), 'forward-mailbox');
  assert.equal(normalizeIcloudTargetMailboxType('unknown'), 'icloud-inbox');
  assert.equal(normalizeIcloudForwardMailProvider('GMAIL'), 'gmail');
  assert.equal(normalizeIcloudForwardMailProvider('unknown'), 'qq');
  assert.deepEqual(
    getIcloudForwardMailProviderOptions().map((option) => option.value),
    ['qq', '163', '163-vip', '126', 'gmail']
  );
});

test('getIcloudForwardMailConfig reuses shared mailbox provider configs', () => {
  assert.deepEqual(getIcloudForwardMailConfig('126'), {
    source: 'mail-163',
    url: 'https://mail.126.com/js6/main.jsp?df=mail163_letter#module=mbox.ListModule%7C%7B%22fid%22%3A1%2C%22order%22%3A%22date%22%2C%22desc%22%3Atrue%7D',
    label: '126 邮箱',
  });
  assert.deepEqual(getIcloudForwardMailConfig('gmail'), {
    source: 'gmail-mail',
    url: 'https://mail.google.com/mail/u/0/#inbox',
    label: 'Gmail 邮箱',
    inject: ['content/activation-utils.js', 'content/utils.js', 'content/gmail-mail.js'],
    injectSource: 'gmail-mail',
  });
});
