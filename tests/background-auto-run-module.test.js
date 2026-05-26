const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('background imports auto-run controller module', () => {
  const source = fs.readFileSync('background.js', 'utf8');
  assert.match(source, /background\/auto-run-controller\.js/);
});

test('auto-run controller module exposes a factory', () => {
  const source = fs.readFileSync('background/auto-run-controller.js', 'utf8');
  const globalScope = {};

  const api = new Function('self', `${source}; return self.MultiPageBackgroundAutoRunController;`)(globalScope);

  assert.equal(typeof api?.createAutoRunController, 'function');
});

test('auto-run account record status preserves the real failed node instead of parsing guidance text', () => {
  const source = fs.readFileSync('background/auto-run-controller.js', 'utf8');
  const globalScope = {};
  const api = new Function('self', `${source}; return self.MultiPageBackgroundAutoRunController;`)(globalScope);
  const controller = api.createAutoRunController({});

  const state = {
    currentNodeId: 'fetch-login-code',
    nodeStatuses: {
      'submit-signup-email': 'completed',
      'oauth-login': 'completed',
      'fetch-login-code': 'failed',
    },
  };
  const error = new Error('缺少登录账号：请先完成步骤 2，或在侧栏填写账号后再执行当前步骤。');

  assert.equal(
    controller.resolveAutoRunAccountRecordStatus('failed', state, error),
    'node:fetch-login-code:failed'
  );

  error.failedNodeId = 'platform-verify';
  assert.equal(
    controller.resolveAutoRunAccountRecordStatus('failed', state, error),
    'node:platform-verify:failed'
  );
});

test('auto-run controller applies pre-start skipped nodes before selecting start node', async () => {
  const source = fs.readFileSync('background/auto-run-controller.js', 'utf8');
  const globalScope = {};
  const api = new Function('self', `${source}; return self.MultiPageBackgroundAutoRunController;`)(globalScope);
  const nodeIds = ['open-chatgpt', 'submit-signup-email', 'fill-password'];
  const createPendingNodeStatuses = () => Object.fromEntries(nodeIds.map((nodeId) => [nodeId, 'pending']));
  let currentState = {
    nodeStatuses: createPendingNodeStatuses(),
  };
  const runtimeState = {
    autoRunActive: false,
    autoRunTotalRuns: 0,
    autoRunCurrentRun: 0,
    autoRunAttemptRun: 0,
    autoRunSessionId: 0,
  };
  const logs = [];
  const runCalls = [];

  const cloneState = () => ({
    ...currentState,
    nodeStatuses: { ...(currentState.nodeStatuses || {}) },
  });
  const isDone = (status) => ['completed', 'manual_completed', 'skipped'].includes(String(status || ''));

  const controller = api.createAutoRunController({
    AUTO_RUN_MAX_RETRIES_PER_ROUND: 3,
    AUTO_RUN_RETRY_DELAY_MS: 0,
    AUTO_RUN_TIMER_KIND_BEFORE_RETRY: 'before_retry',
    AUTO_RUN_TIMER_KIND_BETWEEN_ROUNDS: 'between_rounds',
    addLog: async (message, level = 'info') => logs.push({ message, level }),
    appendAccountRunRecord: async () => null,
    broadcastAutoRunStatus: async () => {},
    broadcastStopToContentScripts: async () => {},
    cancelPendingCommands: () => {},
    clearStopRequest: () => {},
    createAutoRunSessionId: () => 42,
    getAutoRunStatusPayload: (phase, payload = {}) => ({
      autoRunPhase: phase,
      autoRunCurrentRun: payload.currentRun,
      autoRunTotalRuns: payload.totalRuns,
      autoRunAttemptRun: payload.attemptRun,
      autoRunSessionId: payload.sessionId,
    }),
    getErrorMessage: (error) => error?.message || String(error || ''),
    getFirstUnfinishedNodeId: (nodeStatuses = {}) => (
      nodeIds.find((nodeId) => !isDone(nodeStatuses[nodeId])) || null
    ),
    getNodeIdsForState: () => nodeIds,
    getPendingAutoRunTimerPlan: () => null,
    getRunningNodeIds: () => [],
    getState: async () => cloneState(),
    getStopRequested: () => false,
    hasSavedNodeProgress: (nodeStatuses = {}) => (
      Object.values(nodeStatuses).some((status) => String(status || 'pending') !== 'pending')
    ),
    isAddPhoneAuthFailure: () => false,
    isCloudCheckoutAlreadyPaidFailure: () => false,
    isGpcTaskEndedFailure: () => false,
    isHostedCheckoutGenericErrorFailure: () => false,
    isHostedCheckoutVerificationResendLimitFailure: () => false,
    isPhoneSmsPlatformRateLimitFailure: () => false,
    isPlusCheckoutNonFreeTrialFailure: () => false,
    isRestartCurrentAttemptError: () => false,
    isSignupUserAlreadyExistsFailure: () => false,
    isStep4Route405RecoveryLimitFailure: () => false,
    isStopError: () => false,
    launchAutoRunTimerPlan: async () => {},
    normalizeAutoRunFallbackThreadIntervalMinutes: (value) => Number(value) || 0,
    persistAutoRunTimerPlan: async () => {},
    resetState: async () => {
      currentState = { nodeStatuses: createPendingNodeStatuses() };
    },
    runAutoSequenceFromNode: async (startNodeId) => {
      runCalls.push(startNodeId);
      currentState.nodeStatuses[startNodeId] = 'completed';
    },
    runtime: {
      get: () => ({ ...runtimeState }),
      set: (updates) => Object.assign(runtimeState, updates || {}),
    },
    setState: async (updates = {}) => {
      currentState = {
        ...currentState,
        ...updates,
        nodeStatuses: updates.nodeStatuses
          ? { ...updates.nodeStatuses }
          : { ...(currentState.nodeStatuses || {}) },
      };
    },
    sleepWithStop: async () => {},
    throwIfAutoRunSessionStopped: () => {},
    waitForRunningNodesToFinish: async () => cloneState(),
    chrome: {
      runtime: {
        sendMessage: async () => {},
      },
    },
  });

  await controller.autoRunLoop(1, {
    autoRunPreStartSkippedNodeIds: ['open-chatgpt', 'submit-signup-email', 'missing-node'],
  });

  assert.deepEqual(runCalls, ['fill-password']);
  assert.equal(currentState.nodeStatuses['open-chatgpt'], 'skipped');
  assert.equal(currentState.nodeStatuses['submit-signup-email'], 'skipped');
  assert.match(logs.map((entry) => entry.message).join('\n'), /启动前已按配置跳过节点/);
});
