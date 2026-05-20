const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('sidepanel/sidepanel.js', 'utf8');

function extractFunction(name) {
  const markers = [`async function ${name}(`, `function ${name}(`];
  const start = markers
    .map((marker) => source.indexOf(marker))
    .find((index) => index >= 0);
  if (start < 0) {
    throw new Error(`missing function ${name}`);
  }

  let parenDepth = 0;
  let signatureEnded = false;
  let braceStart = -1;
  for (let i = start; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '(') {
      parenDepth += 1;
    } else if (ch === ')') {
      parenDepth -= 1;
      if (parenDepth === 0) {
        signatureEnded = true;
      }
    } else if (ch === '{' && signatureEnded) {
      braceStart = i;
      break;
    }
  }

  let depth = 0;
  let end = braceStart;
  for (; end < source.length; end += 1) {
    const ch = source[end];
    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        end += 1;
        break;
      }
    }
  }

  return source.slice(start, end);
}

function createRow(initialDisplay = 'none') {
  return {
    style: { display: initialDisplay },
  };
}

function buildUpdateMailProviderUiApi() {
  const bundle = extractFunction('updateMailProviderUI');
  return new Function('createRow', `
let latestState = {};
let cloudflareDomainEditMode = false;
let cloudflareTempEmailDomainEditMode = false;
const ICLOUD_PROVIDER = 'icloud';
const GMAIL_PROVIDER = 'gmail';
const GMAIL_ALIAS_GENERATOR = 'gmail-alias';
const CUSTOM_EMAIL_POOL_GENERATOR = 'custom-pool';
const HOTMAIL_SERVICE_MODE_REMOTE = 'remote';
const HOTMAIL_SERVICE_MODE_LOCAL = 'local';
const CLOUDFLARE_TEMP_EMAIL_LOOKUP_MODE_REGISTRATION_EMAIL = 'registration-email';
const rowMail2925Mode = createRow();
const rowMail2925PoolSettings = createRow();
const rowCustomMailProviderPool = createRow();
const rowEmailPrefix = createRow();
const rowInbucketHost = createRow();
const rowInbucketMailbox = createRow();
const rowEmailGenerator = createRow();
const rowCfDomain = createRow();
const rowTempEmailBaseUrl = createRow();
const rowTempEmailAdminAuth = createRow();
const rowTempEmailCustomAuth = createRow();
const rowTempEmailLookupMode = createRow();
const rowTempEmailReceiveMailbox = createRow();
const rowTempEmailRandomSubdomainToggle = createRow();
const rowTempEmailDomain = createRow();
const cloudflareTempEmailSection = createRow();
const hotmailSection = createRow();
const mail2925Section = createRow();
const luckmailSection = createRow();
const icloudSection = createRow();
const labelEmailPrefix = { textContent: '' };
const inputEmailPrefix = { placeholder: '', style: { display: '' }, readOnly: false };
const labelMail2925UseAccountPool = createRow();
const selectMail2925PoolAccount = { style: { display: 'none' }, disabled: false };
const btnFetchEmail = { hidden: false, disabled: false, textContent: '' };
const btnMailLogin = { disabled: false, textContent: '', title: '' };
const inputEmail = { readOnly: false, placeholder: '', value: '' };
const autoHintText = { textContent: '' };
const rowHotmailServiceMode = createRow();
const rowHotmailRemoteBaseUrl = createRow();
const rowHotmailLocalBaseUrl = createRow();
const inputMail2925UseAccountPool = { checked: false };
const selectMailProvider = { value: 'hotmail-api' };
const selectEmailGenerator = {
  value: 'duck',
  disabled: false,
  options: [
    { value: 'gmail-alias', hidden: false },
    { value: 'duck', hidden: false },
    { value: 'custom-pool', hidden: false },
    { value: 'cloudflare', hidden: false },
    { value: 'icloud', hidden: false },
    { value: 'cloudflare-temp-email', hidden: false },
    { value: 'cloudmail', hidden: false },
  ],
};
const inputTempEmailUseRandomSubdomain = { checked: false };
const inputRunCount = { disabled: false };
const currentAutoRun = { autoRunning: false };
function resolveCurrentSidepanelCapabilities() { return { canShowLuckmail: true }; }
function isLuckmailProvider() { return false; }
function isCustomMailProvider() { return false; }
function isIcloudMailProvider() { return false; }
function usesCustomMailProviderPool() { return false; }
function usesGeneratedAliasMailProvider() { return false; }
function getSelectedMail2925Mode() { return 'provide'; }
function getSelectedCloudflareTempEmailLookupMode() { return 'receive-mailbox'; }
function getManagedAliasProviderUiCopy() { return null; }
function getCurrentRegistrationEmailUiCopy() {
  return {
    buttonLabel: '生成 Temp',
    placeholder: '点击生成 Cloudflare Temp Email，或手动粘贴邮箱',
    label: 'Cloudflare Temp Email',
  };
}
function updateMailLoginButtonState() {}
function getSelectedHotmailServiceMode() { return 'local'; }
function getCurrentHotmailEmail() { return ''; }
function getCurrentLuckmailEmail() { return ''; }
function getCloudflareDomainsFromState() { return { domains: [], activeDomain: '' }; }
function setCloudflareDomainEditMode() {}
function getCloudflareTempEmailDomainsFromState() { return { domains: [], activeDomain: '' }; }
function setCloudflareTempEmailDomainEditMode() {}
function queueIcloudAliasRefresh() {}
function hideIcloudLoginHelp() {}
function syncMail2925PoolAccountOptions() {}
function getMail2925Accounts() { return []; }
function renderPayPalAccounts() {}
function renderHotmailAccounts() {}
function renderMail2925Accounts() {}
function renderLuckmailPurchases() {}
function getSelectedEmailGenerator() { return String(selectEmailGenerator.value || '').trim().toLowerCase(); }
function isAutoRunLockedPhase() { return false; }
function getCustomEmailPoolSize() { return 0; }
function getCustomMailProviderPoolSize() { return 0; }
function syncRunCountFromCustomEmailPool() {}
function syncRunCountFromCustomMailProviderPool() {}
function shouldLockRunCountToEmailPool() { return false; }
function normalizeIcloudTargetMailboxType(value) { return String(value || '').trim().toLowerCase() === 'forward-mailbox' ? 'forward-mailbox' : 'icloud-inbox'; }
function normalizeIcloudForwardMailProvider(value) { return String(value || '').trim().toLowerCase() === 'gmail' ? 'gmail' : 'qq'; }
${bundle}
return {
  updateMailProviderUI,
  rowEmailGenerator,
  selectMailProvider,
  selectEmailGenerator,
};
  `)(createRow);
}

function buildNormalizeSupportedMailProviderApi() {
  const bundle = extractFunction('normalizeSupportedMailProvider');
  return new Function(`
const HOTMAIL_PROVIDER = 'hotmail-api';
const CLOUDFLARE_TEMP_EMAIL_PROVIDER = 'cloudflare-temp-email';
const CLOUD_MAIL_PROVIDER = 'cloudmail';
${bundle}
return {
  normalizeSupportedMailProvider,
};
  `)();
}

test('sidepanel html hides and disables email generator by default', () => {
  const html = fs.readFileSync('sidepanel/sidepanel.html', 'utf8');
  assert.match(html, /id="row-email-generator"[^>]*style="display:none;"/);
  assert.match(html, /id="select-email-generator"[^>]*disabled/);
});

test('sidepanel html defaults registration email placeholder to hotmail pool allocation', () => {
  const html = fs.readFileSync('sidepanel/sidepanel.html', 'utf8');
  assert.match(html, /id="input-email"[^>]*placeholder="由 Hotmail 账号池自动分配"/);
});

test('sidepanel html keeps cloudmail as a selectable mail provider', () => {
  const html = fs.readFileSync('sidepanel/sidepanel.html', 'utf8');
  assert.match(
    html,
    /<select id="select-mail-provider"[\s\S]*?<option value="cloudmail">Cloud Mail<\/option>/
  );
});

test('sidepanel restores state without waiting for phone country loaders', () => {
  const restoreIndex = source.indexOf('void restoreState().then(() => {');
  const loadIndex = source.indexOf('Promise.allSettled([');

  assert.notEqual(restoreIndex, -1);
  assert.notEqual(loadIndex, -1);
  assert.ok(
    restoreIndex < loadIndex,
    'restoreState should run before async phone country loaders settle'
  );
});

test('updateMailProviderUI hides all email generator choices for hotmail provider', () => {
  const api = buildUpdateMailProviderUiApi();

  api.selectMailProvider.value = 'hotmail-api';
  api.selectEmailGenerator.value = 'duck';
  api.updateMailProviderUI();

  assert.equal(api.rowEmailGenerator.style.display, 'none');
  assert.equal(api.selectEmailGenerator.disabled, true);
  assert.deepEqual(
    api.selectEmailGenerator.options.map((option) => option.hidden),
    [true, true, true, true, true, true, true]
  );
});

test('updateMailProviderUI locks cloudflare temp email provider to its own generator', () => {
  const api = buildUpdateMailProviderUiApi();

  api.selectMailProvider.value = 'cloudflare-temp-email';
  api.selectEmailGenerator.value = 'duck';
  api.updateMailProviderUI();

  assert.equal(api.rowEmailGenerator.style.display, '');
  assert.equal(api.selectEmailGenerator.disabled, true);
  assert.equal(api.selectEmailGenerator.value, 'cloudflare-temp-email');
  assert.deepEqual(
    api.selectEmailGenerator.options.map((option) => option.hidden),
    [true, true, true, true, true, false, true]
  );
});

test('updateMailProviderUI locks cloudmail provider to its own generator', () => {
  const api = buildUpdateMailProviderUiApi();

  api.selectMailProvider.value = 'cloudmail';
  api.selectEmailGenerator.value = 'duck';
  api.updateMailProviderUI();

  assert.equal(api.rowEmailGenerator.style.display, '');
  assert.equal(api.selectEmailGenerator.disabled, true);
  assert.equal(api.selectEmailGenerator.value, 'cloudmail');
  assert.deepEqual(
    api.selectEmailGenerator.options.map((option) => option.hidden),
    [true, true, true, true, true, true, false]
  );
});

test('normalizeSupportedMailProvider keeps cloudmail provider available', () => {
  const api = buildNormalizeSupportedMailProviderApi();

  assert.equal(api.normalizeSupportedMailProvider('cloudmail'), 'cloudmail');
  assert.equal(api.normalizeSupportedMailProvider('cloudflare-temp-email'), 'cloudflare-temp-email');
  assert.equal(api.normalizeSupportedMailProvider('hotmail-api'), 'hotmail-api');
  assert.equal(api.normalizeSupportedMailProvider('unknown-provider'), 'hotmail-api');
});
