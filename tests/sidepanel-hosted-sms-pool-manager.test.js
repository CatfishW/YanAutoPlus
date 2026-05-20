const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('hosted sms pool manager deletes all entries and clears old fallback fields', async () => {
  const source = fs.readFileSync('sidepanel/hosted-sms-pool-manager.js', 'utf8');
  const windowObject = {};
  const api = new Function('window', `${source}; return window.SidepanelHostedSmsPoolManager;`)(windowObject);

  let text = '+15822452843----http://a.62-us.com/api/get_sms?key=old';
  let usage = { [text]: { useCount: 2, usedAt: 1, lastError: 'failed' } };
  let fallbackCleared = false;
  const handlers = {};
  const manager = api.createHostedSmsPoolManager({
    dom: {
      btnHostedSmsPoolRefresh: { disabled: false, addEventListener() {} },
      btnHostedSmsPoolClearUsed: { disabled: false, addEventListener() {} },
      btnHostedSmsPoolDeleteAll: {
        disabled: false,
        addEventListener(type, handler) {
          handlers[type] = handler;
        },
      },
      inputHostedSmsPoolImport: { disabled: false, addEventListener() {} },
      btnHostedSmsPoolImport: { disabled: false, addEventListener() {} },
      hostedSmsPoolSummary: { textContent: '' },
      hostedSmsPoolList: { innerHTML: '' },
    },
    helpers: {
      openConfirmModal: async () => true,
      showToast() {},
    },
    state: {
      getText: () => text,
      setText: (nextText) => {
        text = nextText;
      },
      getUsage: () => usage,
      setUsage: (nextUsage) => {
        usage = nextUsage;
      },
      getCurrentEntry: () => null,
      isVisible: () => true,
    },
    actions: {
      persistPool: async () => {},
      clearFallback: () => {
        fallbackCleared = true;
      },
    },
  });

  manager.bindEvents();
  await handlers.click();

  assert.equal(text, '');
  assert.deepEqual(usage, {});
  assert.equal(fallbackCleared, true);
});

test('hosted sms pool manager accepts phone and relay url as two-line import hint format', async () => {
  const source = fs.readFileSync('sidepanel/hosted-sms-pool-manager.js', 'utf8');
  const windowObject = {};
  const originalDocument = global.document;
  global.document = {
    createElement() {
      return {
        className: '',
        innerHTML: '',
        appendChild() {},
        querySelector() {
          return { addEventListener() {} };
        },
      };
    },
  };
  try {
    const api = new Function('window', `${source}; return window.SidepanelHostedSmsPoolManager;`)(windowObject);
    let text = '';
    let usage = {};
    const handlers = {};
    const manager = api.createHostedSmsPoolManager({
      dom: {
        btnHostedSmsPoolRefresh: { disabled: false, addEventListener() {} },
        btnHostedSmsPoolClearUsed: { disabled: false, addEventListener() {} },
        btnHostedSmsPoolDeleteAll: { disabled: false, addEventListener() {} },
        inputHostedSmsPoolImport: {
          value: '1234567890\n\nhttps://mail.test.com/api/text-relay/eca_tr_xxxxxxxxx',
          disabled: false,
          addEventListener() {},
        },
        btnHostedSmsPoolImport: {
          disabled: false,
          addEventListener(type, handler) {
            handlers[type] = handler;
          },
        },
        hostedSmsPoolSummary: { textContent: '' },
        hostedSmsPoolList: { innerHTML: '', appendChild() {} },
        inputHostedSmsPoolSearch: { value: '', addEventListener() {} },
        selectHostedSmsPoolFilter: { value: 'all', addEventListener() {} },
      },
      helpers: {
        openConfirmModal: async () => true,
        showToast() {},
      },
      state: {
        getText: () => text,
        setText: (nextText) => {
          text = nextText;
        },
        getUsage: () => usage,
        setUsage: (nextUsage) => {
          usage = nextUsage;
        },
        getCurrentEntry: () => null,
        isVisible: () => true,
      },
      actions: {
        persistPool: async () => {},
        clearFallback() {},
      },
    });

    manager.bindEvents();
    await handlers.click();

    assert.equal(text, '1234567890----https://mail.test.com/api/text-relay/eca_tr_xxxxxxxxx');
    assert.deepEqual(usage, {});
  } finally {
    global.document = originalDocument;
  }
});

test('hosted sms pool manager normalizes imported US numbers to 10 local digits', async () => {
  const source = fs.readFileSync('sidepanel/hosted-sms-pool-manager.js', 'utf8');
  const windowObject = {};
  const originalDocument = global.document;
  global.document = {
    createElement() {
      return {
        className: '',
        innerHTML: '',
        appendChild() {},
        querySelector() {
          return { addEventListener() {} };
        },
      };
    },
  };
  try {
    const api = new Function('window', `${source}; return window.SidepanelHostedSmsPoolManager;`)(windowObject);
    let text = '';
    let usage = {};
    const handlers = {};
    const manager = api.createHostedSmsPoolManager({
      dom: {
        btnHostedSmsPoolRefresh: { disabled: false, addEventListener() {} },
        btnHostedSmsPoolClearUsed: { disabled: false, addEventListener() {} },
        btnHostedSmsPoolDeleteAll: { disabled: false, addEventListener() {} },
        inputHostedSmsPoolImport: {
          value: '+15828228115\nhttps://mail.test.com/api/text-relay/us-plus',
          disabled: false,
          addEventListener() {},
        },
        btnHostedSmsPoolImport: {
          disabled: false,
          addEventListener(type, handler) {
            handlers[type] = handler;
          },
        },
        hostedSmsPoolSummary: { textContent: '' },
        hostedSmsPoolList: { innerHTML: '', appendChild() {} },
        inputHostedSmsPoolSearch: { value: '', addEventListener() {} },
        selectHostedSmsPoolFilter: { value: 'all', addEventListener() {} },
      },
      helpers: {
        openConfirmModal: async () => true,
        showToast() {},
      },
      state: {
        getText: () => text,
        setText: (nextText) => {
          text = nextText;
        },
        getUsage: () => usage,
        setUsage: (nextUsage) => {
          usage = nextUsage;
        },
        getCurrentEntry: () => null,
        isVisible: () => true,
      },
      actions: {
        persistPool: async () => {},
        clearFallback() {},
      },
    });

    manager.bindEvents();
    await handlers.click();

    assert.equal(text, '5828228115----https://mail.test.com/api/text-relay/us-plus');
    assert.deepEqual(usage, {});
  } finally {
    global.document = originalDocument;
  }
});
