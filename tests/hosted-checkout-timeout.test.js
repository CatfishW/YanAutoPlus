const assert = require('assert');
const fs = require('fs');

const source = fs.readFileSync('background.js', 'utf8');

function extractFunction(name) {
  const start = source.indexOf(`function ${name}(`);
  if (start < 0) {
    throw new Error(`missing function ${name}`);
  }

  const paramsStart = source.indexOf('(', start);
  let paramsDepth = 0;
  let paramsEnd = paramsStart;
  for (; paramsEnd < source.length; paramsEnd += 1) {
    const ch = source[paramsEnd];
    if (ch === '(') paramsDepth += 1;
    if (ch === ')') {
      paramsDepth -= 1;
      if (paramsDepth === 0) {
        break;
      }
    }
  }

  const braceStart = source.indexOf('{', paramsEnd);
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

const bundle = [
  'const AUTO_RUN_SIGNAL_COMPLETION_TIMEOUT_MS = 120000;',
  'const HOSTED_CHECKOUT_FINAL_WAIT_TIMEOUT_MS = 30 * 60 * 1000;',
  'const STEP_COMPLETION_SIGNAL_TIMEOUTS_BY_STEP_KEY = new Map();',
  'function getNodeDefinitionForState(nodeId, state = {}) { return state.nodeDefinitions?.[nodeId] || { executeKey: String(nodeId || "").trim() }; }',
  extractFunction('getNodeExecutionKeyForState'),
  extractFunction('isPlusCheckoutRestartStep'),
  extractFunction('isHostedCheckoutUploadCompletionNode'),
  extractFunction('getNodeCompletionSignalTimeoutMs'),
  extractFunction('getAutoRunNodeIdleLogTimeoutMs'),
].join('\n');

const api = new Function(`${bundle}; return { isPlusCheckoutRestartStep, isHostedCheckoutUploadCompletionNode, getNodeCompletionSignalTimeoutMs, getAutoRunNodeIdleLogTimeoutMs };`)();

const hostedCheckoutState = {
  plusModeEnabled: true,
  plusPaymentMethod: 'paypal',
  plusHostedCheckoutIsFinalStep: true,
  nodeDefinitions: {
    'plus-checkout-create': { executeKey: 'plus-checkout-create' },
  },
};

assert.strictEqual(
  api.isHostedCheckoutUploadCompletionNode('plus-checkout-create', hostedCheckoutState),
  true,
  'hosted PayPal checkout should be treated as the long-wait plus-checkout-create path'
);

assert.strictEqual(
  api.getNodeCompletionSignalTimeoutMs('plus-checkout-create', hostedCheckoutState),
  30 * 60 * 1000,
  'hosted PayPal checkout should use the extended completion timeout'
);

assert.strictEqual(
  api.getAutoRunNodeIdleLogTimeoutMs('plus-checkout-create', hostedCheckoutState),
  30 * 60 * 1000,
  'hosted PayPal checkout should use the extended idle watchdog timeout'
);

assert.strictEqual(
  api.getNodeCompletionSignalTimeoutMs('plus-checkout-create', {
    plusModeEnabled: true,
    plusPaymentMethod: 'gpc-helper',
    nodeDefinitions: {
      'plus-checkout-create': { executeKey: 'plus-checkout-create' },
    },
  }),
  120000,
  'non-PayPal checkout should keep the normal completion timeout'
);

assert.strictEqual(
  api.isPlusCheckoutRestartStep(7, 'oauth-login', {
    plusModeEnabled: true,
    plusPaymentMethod: 'paypal',
  }),
  false,
  'hosted checkout oauth-login should not be mistaken for a Plus Checkout restart step'
);

console.log('hosted checkout timeout tests passed');
