const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

function loadIpProxyCore({ accountListEnabled = true, fetchImpl = globalThis.fetch } = {}) {
  const providerSource = fs.readFileSync('background/ip-proxy-provider-711proxy.js', 'utf8');
  const coreSource = fs.readFileSync('background/ip-proxy-core.js', 'utf8');
  return new Function('fetchImpl', `
const self = {};
const chrome = {};
const fetch = fetchImpl;
let __state = {};
const DEFAULT_IP_PROXY_SERVICE = '711proxy';
const IP_PROXY_SERVICE_VALUES = ['711proxy', 'lumiproxy', 'iproyal', 'omegaproxy', 'clash'];
const IP_PROXY_ENABLED_SERVICE_VALUES = ['711proxy', 'clash'];
const DEFAULT_IP_PROXY_MODE = 'account';
const IP_PROXY_MODE_VALUES = ['api', 'account'];
const DEFAULT_IP_PROXY_PROTOCOL = 'http';
const IP_PROXY_PROTOCOL_VALUES = ['http', 'https', 'socks4', 'socks5'];
const DEFAULT_CLASH_PROXY_HOST = '127.0.0.1';
const DEFAULT_CLASH_PROXY_PORT = '7890';
const DEFAULT_CLASH_PROXY_PROTOCOL = 'http';
const IP_PROXY_FETCH_TIMEOUT_MS = 20000;
const IP_PROXY_SETTINGS_SCOPE = 'regular';
const IP_PROXY_BYPASS_LIST = ['<local>', 'localhost', '127.0.0.1'];
const IP_PROXY_ROUTE_ALL_TRAFFIC = true;
const IP_PROXY_FORCE_DIRECT_HOST_PATTERNS = [
  'pm-redirects.stripe.com',
  '*.pm-redirects.stripe.com',
  'hwork.pro',
  '*.hwork.pro',
  'auth.openai.com',
  'auth0.openai.com',
  'accounts.openai.com',
  'luckyous.com',
  '*.luckyous.com',
];
const IP_PROXY_FORCE_DIRECT_FALLBACK = 'PROXY 127.0.0.1:7897';
const IP_PROXY_ACCOUNT_LIST_ENABLED = ${accountListEnabled ? 'true' : 'false'};
const IP_PROXY_TARGET_HOST_PATTERNS = [
  'openai.com',
  '*.openai.com',
  'chatgpt.com',
  '*.chatgpt.com',
];
${providerSource}
const transformIpProxyAccountEntryByProvider = self.transformIpProxyAccountEntryByProvider;
async function getState() { return __state; }
async function setState(patch = {}) { __state = { ...__state, ...(patch || {}) }; return __state; }
function broadcastDataUpdate() {}
async function addLog() {}
${coreSource}
return {
  applyIpProxySettingsFromState,
  applyExitRegionExpectation,
  buildClashUsSelectionPlan,
  buildIpProxyPacScript,
  chrome,
  createAutomationScopedTab,
  buildIpProxyRoutingStatePatch,
  applyTargetReachabilityExpectation,
  getAccountModeProxyPoolFromState,
  normalizeIpProxyProviderValue,
  normalizeIpProxyServiceProfiles,
  normalizeIpProxyAccountList,
  normalizeProxyPoolEntries,
  parseProxyExitProbePayload,
  parseIpProxyLine,
  queryAutomationScopedTabs,
  restoreIpProxySettingsOnWorkerStart,
  resolveExitProbeEndpoints,
  resolveIpProxyAutoSwitchThreshold,
  resolveTargetReachabilityEndpoints,
  isClashUsNodeName,
  setTestState(nextState = {}) { __state = { ...(nextState || {}) }; },
  shouldEnableIpProxyLeakGuardForStatus,
};
`)(fetchImpl);
}

test('IP proxy parser ignores disabled lines and normalizes proxy entries', () => {
  const api = loadIpProxyCore();

  assert.equal(
    api.normalizeIpProxyAccountList([
      '# disabled',
      ' // disabled',
      '; disabled',
      'global.rotgb.711proxy.com:10000:user:pass',
      '',
    ].join('\n')),
    'global.rotgb.711proxy.com:10000:user:pass'
  );

  const pool = api.normalizeProxyPoolEntries([
    'http://global.rotgb.711proxy.com:10000:user:pa:ss',
    'http://global.rotgb.711proxy.com:10000:user:pa:ss',
    { host: 'us.proxy.example', port: '8080', username: 'u2', password: 'p2' },
  ]);

  assert.equal(pool.length, 2);
  assert.deepStrictEqual(pool[0], {
    host: 'global.rotgb.711proxy.com',
    port: 10000,
    username: 'user',
    password: 'pa:ss',
    protocol: 'http',
    region: '',
    provider: '711proxy',
  });
  assert.equal(pool[1].host, 'us.proxy.example');
  assert.equal(pool[1].port, 8080);
});

test('IP proxy probe payload parser extracts country from common probe endpoints', () => {
  const api = loadIpProxyCore();

  assert.deepEqual(
    api.parseProxyExitProbePayload('ip=219.104.171.52\nloc=JP\ncolo=NRT', 'text/plain'),
    { ip: '219.104.171.52', region: 'JP' }
  );
  assert.deepEqual(
    api.parseProxyExitProbePayload(JSON.stringify({
      ip: '219.104.171.52',
      country: 'JP',
      city: 'Osaka',
    }), 'application/json'),
    { ip: '219.104.171.52', region: 'JP' }
  );
  assert.deepEqual(
    api.parseProxyExitProbePayload(JSON.stringify({
      ip: '219.104.171.52',
      country_code: 'JP',
      country: 'Japan',
    }), 'application/json'),
    { ip: '219.104.171.52', region: 'JP' }
  );
});

test('IP proxy routing state patch keeps exit probe endpoint for diagnostics', () => {
  const api = loadIpProxyCore();
  const patch = api.buildIpProxyRoutingStatePatch({
    applied: true,
    reason: 'applied',
    provider: '711proxy',
    exitIp: '219.104.171.52',
    exitRegion: 'JP',
    exitSource: 'page_context',
    exitEndpoint: 'https://ipinfo.io/json',
  });

  assert.equal(patch.ipProxyAppliedExitIp, '219.104.171.52');
  assert.equal(patch.ipProxyAppliedExitRegion, 'JP');
  assert.equal(patch.ipProxyAppliedExitEndpoint, 'https://ipinfo.io/json');
});

test('IP proxy page probes do not fall back to other windows when the locked window is unavailable', async () => {
  const api = loadIpProxyCore();
  const created = [];
  const queries = [];
  api.chrome.tabs = {
    create: async (payload) => {
      created.push(payload);
      if (payload.windowId === 77) {
        throw new Error('No window with id: 77');
      }
      return { id: 12, windowId: payload.windowId, url: payload.url };
    },
    query: async (queryInfo) => {
      queries.push(queryInfo);
      if (queryInfo.windowId === 77) {
        throw new Error('No window with id: 77');
      }
      return [{ id: 99, windowId: 1, url: 'https://ipinfo.io/json' }];
    },
  };

  await assert.rejects(
    () => api.createAutomationScopedTab(
      { url: 'https://ipinfo.io/json', active: false },
      { state: { automationWindowId: 77 } }
    ),
    /自动任务窗口已不可用/
  );
  await assert.rejects(
    () => api.queryAutomationScopedTabs(
      { url: 'https://ipinfo.io/*' },
      { state: { automationWindowId: 77 } }
    ),
    /自动任务窗口已不可用/
  );

  assert.deepEqual(created, [{ url: 'https://ipinfo.io/json', active: false, windowId: 77 }]);
  assert.deepEqual(queries, [{ url: 'https://ipinfo.io/*', windowId: 77 }]);
});

test('711 fixed-account mode applies region and sticky session parameters', () => {
  const api = loadIpProxyCore();
  const pool = api.getAccountModeProxyPoolFromState({
    ipProxyService: '711proxy',
    ipProxyMode: 'account',
    ipProxyHost: 'global.rotgb.711proxy.com',
    ipProxyPort: '10000',
    ipProxyProtocol: 'http',
    ipProxyUsername: 'USER047152-zone-custom',
    ipProxyPassword: 'secret',
    ipProxyRegion: 'US',
    ipProxyAccountSessionPrefix: 'sticky_001',
    ipProxyAccountLifeMinutes: '30',
  });

  assert.equal(pool.length, 1);
  assert.equal(pool[0].host, 'global.rotgb.711proxy.com');
  assert.equal(pool[0].port, 10000);
  assert.equal(pool[0].region, 'US');
  assert.match(pool[0].username, /region-US/);
  assert.match(pool[0].username, /session-sticky_001/);
  assert.match(pool[0].username, /sessTime-30/);
});

test('Clash proxy service defaults to local dynamic global endpoint', () => {
  const api = loadIpProxyCore();

  assert.equal(api.normalizeIpProxyProviderValue('clash'), 'clash');
  const profiles = api.normalizeIpProxyServiceProfiles({}, {});

  assert.equal(profiles.clash.mode, 'account');
  assert.equal(profiles.clash.host, '127.0.0.1');
  assert.equal(profiles.clash.port, '7890');
  assert.equal(profiles.clash.protocol, 'http');

  const pool = api.getAccountModeProxyPoolFromState({
    ipProxyService: 'clash',
    ipProxyMode: 'account',
    ipProxyHost: profiles.clash.host,
    ipProxyPort: profiles.clash.port,
    ipProxyProtocol: profiles.clash.protocol,
  }, 'clash');

  assert.equal(pool.length, 1);
  assert.deepEqual(pool[0], {
    host: '127.0.0.1',
    port: 7890,
    username: '',
    password: '',
    protocol: 'http',
    region: 'US',
    provider: 'clash',
  });
});

test('Clash US-node matcher and selection plan avoid non-US nodes', () => {
  const api = loadIpProxyCore();
  const plan = api.buildClashUsSelectionPlan({
    proxies: {
      GLOBAL: { type: 'Selector', now: '🇯🇵 JP Tokyo', all: ['🇯🇵 JP Tokyo', '🇺🇸 US Los Angeles'] },
      '🚀 节点选择': { type: 'Selector', now: '🇯🇵 JP Tokyo', all: ['🇯🇵 JP Tokyo', '🇺🇸 US Los Angeles'] },
      '🇯🇵 JP Tokyo': { type: 'Trojan' },
      '🇺🇸 US Los Angeles': { type: 'Trojan' },
    },
  });

  assert.equal(api.isClashUsNodeName('status check'), false);
  assert.equal(api.isClashUsNodeName('business proxy'), false);
  assert.equal(api.isClashUsNodeName('United States 01'), true);
  assert.equal(api.isClashUsNodeName('🇺🇸 US Los Angeles'), true);
  assert.equal(plan.selectedNodeNames.includes('🇯🇵 JP Tokyo'), false);
  assert.deepEqual(
    plan.selections.filter((selection) => selection.groupName === 'GLOBAL'),
    [{ groupName: 'GLOBAL', choiceName: '🇺🇸 US Los Angeles' }]
  );
});

test('Clash apply selects a US node through local controller before applying PAC', async () => {
  const fetchCalls = [];
  const api = loadIpProxyCore({
    fetchImpl: async (url, options = {}) => {
      fetchCalls.push({ url: String(url), method: options.method || 'GET', body: options.body || '' });
      if (String(url).endsWith('/proxies') && String(options.method || 'GET').toUpperCase() === 'GET') {
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({
            proxies: {
              GLOBAL: { type: 'Selector', now: '🇯🇵 JP Tokyo', all: ['🇯🇵 JP Tokyo', '🇺🇸 US Los Angeles'] },
              '🇯🇵 JP Tokyo': { type: 'Trojan' },
              '🇺🇸 US Los Angeles': { type: 'Trojan' },
            },
          }),
        };
      }
      if (/\/proxies\/GLOBAL$/.test(String(url)) && String(options.method || '').toUpperCase() === 'PUT') {
        return { ok: true, status: 204, text: async () => '' };
      }
      return { ok: false, status: 404, text: async () => 'not found' };
    },
  });
  api.chrome.proxy = {
    settings: {
      clear(_details, callback) { callback(); },
      set(details, callback) {
        fetchCalls.push({ url: 'chrome.proxy.settings.set', method: 'SET', body: JSON.stringify(details) });
        callback();
      },
      get(_details, callback) {
        callback({
          levelOfControl: 'controlled_by_this_extension',
          value: {
            mode: 'pac_script',
            pacScript: { data: 'function FindProxyForURL(){ return "PROXY 127.0.0.1:7890"; }' },
          },
        });
      },
    },
    onProxyError: { addListener() {} },
  };
  api.chrome.webRequest = {
    onAuthRequired: { addListener() {} },
    handlerBehaviorChanged(callback) { callback?.(); },
  };
  api.chrome.browsingData = { remove: async () => {} };
  api.chrome.runtime = {};

  const status = await api.applyIpProxySettingsFromState({
    ipProxyEnabled: true,
    ipProxyService: 'clash',
    ipProxyMode: 'account',
    ipProxyHost: '127.0.0.1',
    ipProxyPort: '7890',
    ipProxyProtocol: 'http',
  }, { skipExitProbe: true });

  const putCall = fetchCalls.find((call) => call.method === 'PUT');
  assert.equal(status.applied, true);
  assert.equal(status.region, 'US');
  assert.equal(status.clashNode, '🇺🇸 US Los Angeles');
  assert.equal(status.warning, '');
  assert.ok(putCall);
  assert.match(putCall.body, /US Los Angeles/);
  assert.doesNotMatch(putCall.body, /JP Tokyo/);
});

test('Clash controller failures warn but keep local proxy flow applied', async () => {
  const api = loadIpProxyCore({
    fetchImpl: async () => {
      throw new Error('connection refused');
    },
  });
  api.chrome.proxy = {
    settings: {
      clear(_details, callback) { callback(); },
      set(_details, callback) { callback(); },
      get(_details, callback) {
        callback({
          levelOfControl: 'controlled_by_this_extension',
          value: {
            mode: 'pac_script',
            pacScript: { data: 'function FindProxyForURL(){ return "PROXY 127.0.0.1:7890"; }' },
          },
        });
      },
    },
    onProxyError: { addListener() {} },
  };
  api.chrome.webRequest = {
    onAuthRequired: { addListener() {} },
  };
  api.chrome.runtime = {};

  const status = await api.applyIpProxySettingsFromState({
    ipProxyEnabled: true,
    ipProxyService: 'clash',
    ipProxyMode: 'account',
    ipProxyHost: '127.0.0.1',
    ipProxyPort: '7890',
    ipProxyProtocol: 'http',
  }, { skipExitProbe: true });

  assert.equal(status.applied, true);
  assert.equal(status.region, 'US');
  assert.match(status.warning, /Clash 控制器不可用/);
});

test('IP proxy PAC keeps local traffic direct and routes target traffic through proxy', () => {
  const api = loadIpProxyCore();
  const pac = api.buildIpProxyPacScript({
    host: 'global.rotgb.711proxy.com',
    port: 10000,
    protocol: 'http',
  });

  assert.match(pac, /FindProxyForURL/);
  assert.match(pac, /localhost/);
  assert.match(pac, /isInNet\(host, "192\.168\.0\.0", "255\.255\.0\.0"\)/);
  assert.match(pac, /isInNet\(host, "10\.0\.0\.0", "255\.0\.0\.0"\)/);
  assert.match(pac, /PROXY global\.rotgb\.711proxy\.com:10000/);
  assert.match(pac, /chatgpt\.com/);
  assert.match(pac, /openai\.com/);
  assert.match(pac, /pm-redirects\.stripe\.com/);
  assert.match(pac, /hwork\.pro/);
  assert.match(pac, /auth\.openai\.com/);
  assert.match(pac, /auth0\.openai\.com/);
  assert.match(pac, /accounts\.openai\.com/);
  assert.match(pac, /luckyous\.com/);
  assert.match(pac, /forceDirectPatterns/);
  assert.match(pac, /PROXY 127\.0\.0\.1:7897/);
  assert.doesNotMatch(pac, /PROXY 127\.0\.0\.1:7897; DIRECT/);
});

test('startup restore clears stale controlled proxy when IP proxy is disabled', async () => {
  const api = loadIpProxyCore();
  const proxyCalls = [];
  api.setTestState({
    ipProxyEnabled: false,
    ipProxyService: '711proxy',
  });
  api.chrome.proxy = {
    settings: {
      get(details, callback) {
        callback({
          levelOfControl: 'controlled_by_this_extension',
          value: {
            mode: 'pac_script',
            pacScript: { data: 'function FindProxyForURL(){ return "PROXY 54.186.216.13:15678"; }' },
          },
        });
      },
      clear(details, callback) {
        proxyCalls.push({ type: 'clear', details });
        callback();
      },
    },
  };

  const status = await api.restoreIpProxySettingsOnWorkerStart({ autoApply: false });

  assert.equal(proxyCalls.length, 1);
  assert.equal(proxyCalls[0].type, 'clear');
  assert.equal(status.reason, 'startup_cleared_stale_proxy');
});

test('startup restore reapplies controlled proxy to restore auth credentials when IP proxy is enabled', async () => {
  const api = loadIpProxyCore();
  const proxyCalls = [];
  api.setTestState({
    ipProxyEnabled: true,
    ipProxyService: '711proxy',
    ipProxyMode: 'account',
    ipProxyHost: '54.186.216.13',
    ipProxyPort: '15678',
    ipProxyProtocol: 'http',
    ipProxyUsername: 'user_demo',
    ipProxyPassword: 'pass_demo',
  });
  api.chrome.proxy = {
    settings: {
      get(details, callback) {
        callback({
          levelOfControl: 'controlled_by_this_extension',
          value: {
            mode: 'pac_script',
            pacScript: { data: 'function FindProxyForURL(){ return "PROXY 54.186.216.13:15678"; }' },
          },
        });
      },
      clear(details, callback) {
        proxyCalls.push({ type: 'clear', details });
        callback();
      },
      set(details, callback) {
        proxyCalls.push({ type: 'set', details });
        callback();
      },
    },
    onProxyError: { addListener() {} },
  };
  api.chrome.webRequest = {
    onAuthRequired: { addListener() {} },
  };
  api.chrome.runtime = {};

  const status = await api.restoreIpProxySettingsOnWorkerStart({ autoApply: false });

  assert.equal(proxyCalls.some((call) => call.type === 'set'), true);
  assert.equal(status.applied, true);
  assert.equal(status.reason, 'applied');
});

test('sidepanel loads IP proxy scripts before sidepanel bootstrap', () => {
  const html = fs.readFileSync('sidepanel/sidepanel.html', 'utf8');
  const providerIndex = html.indexOf('<script src="ip-proxy-provider-711proxy.js"></script>');
  const panelIndex = html.indexOf('<script src="ip-proxy-panel.js"></script>');
  const sidepanelIndex = html.indexOf('<script src="sidepanel.js"></script>');

  assert.notEqual(providerIndex, -1);
  assert.notEqual(panelIndex, -1);
  assert.notEqual(sidepanelIndex, -1);
  assert.ok(providerIndex < panelIndex);
  assert.ok(panelIndex < sidepanelIndex);
});

test('IP proxy auto-switch threshold is clamped to the supported range', () => {
  const api = loadIpProxyCore();

  assert.equal(api.resolveIpProxyAutoSwitchThreshold({ ipProxyPoolTargetCount: '0' }), 1);
  assert.equal(api.resolveIpProxyAutoSwitchThreshold({ ipProxyPoolTargetCount: '25' }), 25);
  assert.equal(api.resolveIpProxyAutoSwitchThreshold({ ipProxyPoolTargetCount: '9999' }), 500);
});

test('711 proxy region mismatch with missing auth challenge keeps routing as warning instead of hard failure', () => {
  const api = loadIpProxyCore();

  const status = api.applyExitRegionExpectation({
    applied: true,
    reason: 'applied',
    provider: '711proxy',
    hasAuth: true,
    username: 'USER047152-zone-custom-region-US',
    entrySource: 'fixed_account',
    exitIp: '1.2.3.4',
    exitRegion: 'BR',
    authDiagnostics: 'auth(challenge=0,provided=0,isProxy=n/a,status=0,host=unknown)',
    error: '',
    warning: '',
  }, 'US');

  assert.equal(status.applied, true);
  assert.equal(status.reason, 'applied_with_warning');
  assert.equal(status.error, '');
  assert.match(
    String(status.warning || ''),
    /地区校验未通过且未触发代理鉴权挑战，疑似匿名链路；先保留代理接管并给出强告警/
  );
  assert.match(String(status.warning || ''), /期望 US，实际 BR/);
});

test('711 sticky session keeps IP probe on ipinfo but separately checks ChatGPT target', () => {
  const api = loadIpProxyCore();

  assert.deepStrictEqual(
    api.resolveExitProbeEndpoints({
      provider: '711proxy',
      username: 'USER794331-zone-custom-region-TH-session-69381850-sessTime-5',
    }),
    ['https://ipinfo.io/json']
  );

  assert.deepStrictEqual(api.resolveTargetReachabilityEndpoints(), ['https://chatgpt.com/']);
});

test('target reachability failure turns detected exit IP into connectivity_failed', () => {
  const api = loadIpProxyCore();
  const status = api.applyTargetReachabilityExpectation({
    applied: true,
    reason: 'applied',
    exitIp: '58.10.48.73',
    exitRegion: 'TH',
  }, {
    reachable: false,
    endpoint: 'https://chatgpt.com/',
    error: 'target:page_context:https://chatgpt.com/:net::ERR_EMPTY_RESPONSE',
  });

  assert.equal(status.applied, false);
  assert.equal(status.reason, 'connectivity_failed');
  assert.match(status.error, /已检测到出口 IP 58\.10\.48\.73 \[TH\]/);
  assert.match(status.error, /真实目标 chatgpt\.com 不可达/);
  assert.match(status.error, /ERR_EMPTY_RESPONSE/);
});

test('connectivity_failed keeps DNR leak guard off so ChatGPT shows proxy error instead of blocked by extension', () => {
  const api = loadIpProxyCore();

  assert.equal(api.shouldEnableIpProxyLeakGuardForStatus({
    enabled: true,
    applied: false,
    reason: 'connectivity_failed',
  }), false);

  assert.equal(api.shouldEnableIpProxyLeakGuardForStatus({
    enabled: true,
    applied: false,
    reason: 'missing_proxy_entry',
  }), true);
});
