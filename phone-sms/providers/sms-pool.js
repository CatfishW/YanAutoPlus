(function attachSmsPoolProvider(root, factory) {
  root.PhoneSmsSmsPoolProvider = factory();
})(typeof self !== 'undefined' ? self : globalThis, function createSmsPoolProviderModule() {
  const PROVIDER_ID = 'smspool';
  const DEFAULT_BASE_URL = 'https://api.smspool.net';
  const DEFAULT_SERVICE_ID = '671';
  const DEFAULT_SERVICE_LABEL = 'OpenAI / ChatGPT';
  const DEFAULT_COUNTRY_ID = 'US';
  const DEFAULT_COUNTRY_LABEL = 'United States';
  const DEFAULT_POOL_ID = '7';
  const DEFAULT_POOL_LABEL = 'Foxtrot';
  const DEFAULT_REQUEST_TIMEOUT_MS = 20000;
  const DEFAULT_MAX_USES = 1;

  function normalizeSmsPoolCountryId(value = '', fallback = DEFAULT_COUNTRY_ID) {
    const normalized = String(value || '').trim().toUpperCase();
    if (normalized) {
      return normalized;
    }
    return String(fallback || DEFAULT_COUNTRY_ID).trim().toUpperCase() || DEFAULT_COUNTRY_ID;
  }

  function normalizeSmsPoolCountryLabel(value = '', fallback = DEFAULT_COUNTRY_LABEL) {
    return String(value || '').trim() || fallback;
  }

  function normalizeSmsPoolServiceId(value = '', fallback = DEFAULT_SERVICE_ID) {
    const normalized = String(value || '').trim();
    if (normalized) {
      return normalized;
    }
    return String(fallback || DEFAULT_SERVICE_ID).trim() || DEFAULT_SERVICE_ID;
  }

  function normalizeSmsPoolServiceLabel(value = '', fallback = DEFAULT_SERVICE_LABEL) {
    return String(value || '').trim() || fallback;
  }

  function normalizeSmsPoolPoolId(value = '', fallback = DEFAULT_POOL_ID) {
    const normalized = String(value || '').trim();
    if (normalized) {
      return normalized;
    }
    return String(fallback || DEFAULT_POOL_ID).trim() || DEFAULT_POOL_ID;
  }

  function normalizeSmsPoolPoolLabel(value = '', fallback = DEFAULT_POOL_LABEL) {
    return String(value || '').trim() || fallback;
  }

  function normalizeSmsPoolPrice(value = '') {
    const raw = String(value ?? '').trim();
    if (!raw) {
      return '';
    }
    const numeric = Number(raw);
    if (!Number.isFinite(numeric) || numeric <= 0) {
      return '';
    }
    return String(Math.round(numeric * 10000) / 10000);
  }

  function normalizeSmsPoolCountryFallback(value = []) {
    const source = Array.isArray(value)
      ? value
      : String(value || '')
        .split(/[\r\n,，;；]+/)
        .map((entry) => String(entry || '').trim())
        .filter(Boolean);
    const seen = new Set();
    const normalized = [];
    for (const entry of source) {
      let id = '';
      let label = '';
      if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
        id = normalizeSmsPoolCountryId(entry.id ?? entry.countryId ?? entry.short_name, '');
        label = String(entry.label ?? entry.countryLabel ?? entry.name ?? '').trim();
      } else {
        const text = String(entry || '').trim();
        const structured = text.match(/^([A-Za-z0-9_-]+)\s*(?:[:|/-]\s*(.+))?$/);
        id = normalizeSmsPoolCountryId(structured?.[1] || text, '');
        label = String(structured?.[2] || '').trim();
      }
      if (!id || seen.has(id)) {
        continue;
      }
      seen.add(id);
      normalized.push({
        id,
        label: normalizeSmsPoolCountryLabel(label, id),
      });
      if (normalized.length >= 20) {
        break;
      }
    }
    return normalized;
  }

  function normalizeBaseUrl(value = '') {
    const trimmed = String(value || '').trim() || DEFAULT_BASE_URL;
    try {
      return new URL(trimmed).toString().replace(/\/+$/, '');
    } catch {
      return DEFAULT_BASE_URL;
    }
  }

  function parsePayload(text) {
    const trimmed = String(text || '').trim();
    if (!trimmed) {
      return '';
    }
    if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
      try {
        return JSON.parse(trimmed);
      } catch {
        return trimmed;
      }
    }
    return trimmed;
  }

  function describePayload(raw) {
    if (typeof raw === 'string') {
      return raw.trim();
    }
    if (Array.isArray(raw)) {
      try {
        return JSON.stringify(raw);
      } catch {
        return String(raw);
      }
    }
    if (raw && typeof raw === 'object') {
      const direct = String(
        raw.message
        || raw.msg
        || raw.error
        || raw.description
        || raw.warning
        || raw.status
        || raw.type
        || ''
      ).trim();
      if (direct) {
        return direct;
      }
      if (Array.isArray(raw.errors) && raw.errors.length) {
        const messages = raw.errors
          .map((entry) => String(entry?.message || entry?.description || entry?.param || '').trim())
          .filter(Boolean);
        if (messages.length) {
          return messages.join(' | ');
        }
      }
      try {
        return JSON.stringify(raw);
      } catch {
        return String(raw);
      }
    }
    return String(raw || '').trim();
  }

  function resolveConfig(state = {}, deps = {}) {
    return {
      apiKey: String(state.smsPoolApiKey || '').trim(),
      baseUrl: normalizeBaseUrl(state.smsPoolBaseUrl || DEFAULT_BASE_URL),
      fetchImpl: deps.fetchImpl || (typeof fetch === 'function' ? fetch.bind(globalThis) : null),
      requestTimeoutMs: deps.requestTimeoutMs || DEFAULT_REQUEST_TIMEOUT_MS,
    };
  }

  async function fetchPayload(config, path, body = null, actionLabel = 'SMSPool request', options = {}) {
    if (!config.fetchImpl) {
      throw new Error('SMSPool 网络请求实现不可用。');
    }
    const url = new URL(path, `${config.baseUrl}/`);
    if (options.query && typeof options.query === 'object') {
      Object.entries(options.query).forEach(([key, value]) => {
        if (value === undefined || value === null || value === '') {
          return;
        }
        url.searchParams.set(key, String(value));
      });
    }
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timeoutId = controller
      ? setTimeout(() => controller.abort(), Number(config.requestTimeoutMs) || DEFAULT_REQUEST_TIMEOUT_MS)
      : null;
    try {
      const response = await config.fetchImpl(url.toString(), {
        method: body === null ? 'GET' : 'POST',
        headers: body === null ? undefined : {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body === null ? undefined : new URLSearchParams(body).toString(),
        signal: controller?.signal,
      });
      const text = await response.text();
      const payload = parsePayload(text);
      if (!response.ok) {
        const error = new Error(`${actionLabel}失败：${describePayload(payload) || response.status}`);
        error.payload = payload;
        error.status = response.status;
        throw error;
      }
      return payload;
    } catch (error) {
      if (error?.name === 'AbortError') {
        throw new Error(`${actionLabel}超时。`);
      }
      throw error;
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  }

  function resolveCountryConfig(state = {}) {
    return {
      id: normalizeSmsPoolCountryId(state.smsPoolCountryId, DEFAULT_COUNTRY_ID),
      label: normalizeSmsPoolCountryLabel(state.smsPoolCountryLabel, DEFAULT_COUNTRY_LABEL),
    };
  }

  function resolveCountryCandidates(state = {}) {
    const primary = resolveCountryConfig(state);
    const seen = new Set([primary.id]);
    const candidates = [primary];
    normalizeSmsPoolCountryFallback(state.smsPoolCountryFallback).forEach((entry) => {
      const id = normalizeSmsPoolCountryId(entry.id, '');
      if (!id || seen.has(id)) {
        return;
      }
      seen.add(id);
      candidates.push({
        id,
        label: normalizeSmsPoolCountryLabel(entry.label, id),
      });
    });
    return candidates;
  }

  function normalizeActivation(record, fallback = {}) {
    if (!record || typeof record !== 'object' || Array.isArray(record)) {
      return null;
    }
    const activationId = String(record.order_code ?? record.order_id ?? record.orderid ?? record.activationId ?? '').trim();
    const phoneNumberRaw = String(record.phonenumber ?? record.phoneNumber ?? record.number ?? '').trim();
    const phoneNumber = phoneNumberRaw
      ? `+${phoneNumberRaw.replace(/^\+/, '')}`
      : '';
    if (!activationId || !phoneNumber) {
      return null;
    }
    const countryId = normalizeSmsPoolCountryId(
      record.short_name ?? record.country_id ?? fallback.countryId,
      fallback.countryId || DEFAULT_COUNTRY_ID
    );
    const countryLabel = normalizeSmsPoolCountryLabel(
      record.country ?? record.countryLabel ?? fallback.countryLabel,
      fallback.countryLabel || DEFAULT_COUNTRY_LABEL
    );
    const serviceCode = normalizeSmsPoolServiceId(
      record.service_id ?? fallback.serviceCode,
      fallback.serviceCode || DEFAULT_SERVICE_ID
    );
    return {
      activationId,
      phoneNumber,
      provider: PROVIDER_ID,
      serviceCode,
      countryId,
      countryLabel,
      successfulUses: Math.max(0, Math.floor(Number(record.successfulUses) || 0)),
      maxUses: Math.max(1, Math.floor(Number(record.maxUses) || DEFAULT_MAX_USES)),
      ...(record.pool !== undefined ? { poolId: normalizeSmsPoolPoolId(record.pool, '') } : {}),
      ...(record.service ? { serviceLabel: normalizeSmsPoolServiceLabel(record.service, DEFAULT_SERVICE_LABEL) } : {}),
      ...(record.cost !== undefined ? { price: Number(record.cost) } : {}),
      ...(record.status ? { status: String(record.status) } : {}),
      ...(record.expiration !== undefined ? { expiresAt: Number(record.expiration) * 1000 } : {}),
    };
  }

  function extractVerificationCode(rawCodeOrText) {
    const trimmed = String(rawCodeOrText || '').trim();
    if (!trimmed) {
      return '';
    }
    const digitMatch = trimmed.match(/\b(\d{4,8})\b/);
    return digitMatch?.[1] || trimmed;
  }

  async function fetchBalance(state = {}, deps = {}) {
    const config = resolveConfig(state, deps);
    if (!config.apiKey) {
      throw new Error('SMSPool API Key 缺失，请先在侧边栏保存接码 API Key。');
    }
    const payload = await fetchPayload(
      config,
      '/request/balance',
      { key: config.apiKey },
      'SMSPool 余额查询'
    );
    const balance = Number(payload?.balance);
    return {
      balance: Number.isFinite(balance) ? balance : 0,
      raw: payload,
    };
  }

  async function fetchCountries(_state = {}, deps = {}) {
    const config = resolveConfig({}, deps);
    const payload = await fetchPayload(config, '/country/retrieve_all', null, 'SMSPool 国家列表');
    if (!Array.isArray(payload)) {
      return [];
    }
    return payload.map((entry) => ({
      id: normalizeSmsPoolCountryId(entry?.short_name || entry?.ID, ''),
      label: normalizeSmsPoolCountryLabel(entry?.name, entry?.short_name || ''),
      searchText: `${entry?.name || ''} ${entry?.short_name || ''} ${entry?.cc || ''} ${entry?.region || ''}`.trim(),
    })).filter((entry) => entry.id && entry.label);
  }

  async function fetchPrices(state = {}, countryConfig = resolveCountryConfig(state), deps = {}) {
    const config = resolveConfig(state, deps);
    const service = normalizeSmsPoolServiceId(state.smsPoolServiceId, DEFAULT_SERVICE_ID);
    return fetchPayload(
      config,
      '/pool/retrieve_valid',
      null,
      'SMSPool 有效池查询',
      {
        query: {
          country: normalizeSmsPoolCountryId(countryConfig?.id, DEFAULT_COUNTRY_ID),
          service,
        },
      }
    );
  }

  async function requestActivation(state = {}, options = {}, deps = {}) {
    const config = resolveConfig(state, deps);
    if (!config.apiKey) {
      throw new Error('SMSPool API Key 缺失，请先在侧边栏保存接码 API Key。');
    }
    const countryCandidates = resolveCountryCandidates(state);
    const blocked = new Set(
      (Array.isArray(options?.blockedCountryIds) ? options.blockedCountryIds : [])
        .map((entry) => normalizeSmsPoolCountryId(entry, ''))
        .filter(Boolean)
    );
    const candidates = countryCandidates.filter((entry) => !blocked.has(normalizeSmsPoolCountryId(entry.id, '')));
    const effectiveCandidates = candidates.length ? candidates : countryCandidates;
    if (!effectiveCandidates.length) {
      throw new Error('SMSPool 未选择国家，请先在接码设置中至少选择 1 个国家。');
    }
    const serviceId = normalizeSmsPoolServiceId(state.smsPoolServiceId, DEFAULT_SERVICE_ID);
    const poolId = normalizeSmsPoolPoolId(state.smsPoolPoolId, DEFAULT_POOL_ID);
    const maxPrice = normalizeSmsPoolPrice(state.smsPoolMaxPrice);
    let lastError = null;
    const failures = [];
    for (const countryConfig of effectiveCandidates) {
      try {
        const body = {
          key: config.apiKey,
          country: normalizeSmsPoolCountryId(countryConfig.id, DEFAULT_COUNTRY_ID),
          service: serviceId,
          pool: poolId,
        };
        if (maxPrice) {
          body.max_price = maxPrice;
        }
        const payload = await fetchPayload(config, '/purchase/sms', body, 'SMSPool 购买手机号');
        if (!payload?.success) {
          const error = new Error(describePayload(payload) || 'SMSPool 购买手机号失败');
          error.payload = payload;
          throw error;
        }
        const activation = normalizeActivation(payload, {
          countryId: countryConfig.id,
          countryLabel: countryConfig.label,
          serviceCode: serviceId,
        });
        if (!activation) {
          const error = new Error(`SMSPool 购买手机号返回不可用响应：${describePayload(payload) || '空响应'}`);
          error.payload = payload;
          throw error;
        }
        return activation;
      } catch (error) {
        lastError = error;
        failures.push(`${countryConfig.label}: ${describePayload(error?.payload || error?.message) || '未知错误'}`);
      }
    }
    if (failures.length) {
      throw new Error(`SMSPool 已尝试 ${effectiveCandidates.length} 个候选国家，均无可用号码：${failures.join(' | ')}。`);
    }
    throw lastError || new Error('SMSPool 获取手机号失败。');
  }

  async function finishActivation(_state = {}, _activation, _deps = {}) {
    return 'SMSPool complete skipped';
  }

  async function cancelActivation(state = {}, activation, deps = {}) {
    const config = resolveConfig(state, deps);
    if (!config.apiKey) {
      return '';
    }
    const normalizedActivation = normalizeActivation(activation);
    if (!normalizedActivation) {
      return '';
    }
    const payload = await fetchPayload(
      config,
      '/sms/cancel',
      {
        key: config.apiKey,
        orderid: normalizedActivation.activationId,
      },
      'SMSPool 取消订单'
    );
    return describePayload(payload);
  }

  async function banActivation(state = {}, activation, deps = {}) {
    return cancelActivation(state, activation, deps);
  }

  async function pollActivationCode(state = {}, activation, options = {}, deps = {}) {
    const config = resolveConfig(state, deps);
    if (!config.apiKey) {
      throw new Error('SMSPool API Key 缺失，请先在侧边栏保存接码 API Key。');
    }
    const normalizedActivation = normalizeActivation(activation);
    if (!normalizedActivation) {
      throw new Error('缺少 SMSPool 手机号订单。');
    }
    const timeoutMs = Math.max(1000, Number(options.timeoutMs) || 180000);
    const intervalMs = Math.max(1000, Number(options.intervalMs) || 5000);
    const maxRoundsRaw = Math.floor(Number(options.maxRounds));
    const maxRounds = Number.isFinite(maxRoundsRaw) && maxRoundsRaw > 0 ? maxRoundsRaw : 0;
    const start = Date.now();
    let pollCount = 0;
    let lastResponse = '';
    while (Date.now() - start < timeoutMs) {
      if (maxRounds > 0 && pollCount >= maxRounds) {
        break;
      }
      deps.throwIfStopped?.();
      const payload = await fetchPayload(
        config,
        '/sms/check',
        {
          key: config.apiKey,
          orderid: normalizedActivation.activationId,
        },
        'SMSPool 查询验证码'
      );
      pollCount += 1;
      lastResponse = describePayload(payload);
      const code = extractVerificationCode(payload?.sms) || extractVerificationCode(payload?.full_sms);
      if (code) {
        return code;
      }
      if (typeof options.onWaitingForCode === 'function') {
        await options.onWaitingForCode({
          activation: normalizedActivation,
          elapsedMs: Date.now() - start,
          pollCount,
          statusText: String(payload?.status || lastResponse || '未知'),
          timeoutMs,
        });
      }
      await deps.sleepWithStop?.(intervalMs);
    }
    const suffix = lastResponse ? ` SMSPool 最后状态：${lastResponse}` : '';
    throw new Error(`PHONE_CODE_TIMEOUT::等待手机验证码超时。${suffix}`);
  }

  function createProvider(deps = {}) {
    const providerDeps = {
      fetchImpl: deps.fetchImpl,
      sleepWithStop: deps.sleepWithStop || (async () => {}),
      throwIfStopped: deps.throwIfStopped || (() => {}),
      requestTimeoutMs: deps.requestTimeoutMs || DEFAULT_REQUEST_TIMEOUT_MS,
    };
    return {
      id: PROVIDER_ID,
      label: 'SMSPool',
      defaultCountryId: DEFAULT_COUNTRY_ID,
      defaultCountryLabel: DEFAULT_COUNTRY_LABEL,
      defaultServiceId: DEFAULT_SERVICE_ID,
      defaultServiceLabel: DEFAULT_SERVICE_LABEL,
      defaultPoolId: DEFAULT_POOL_ID,
      defaultPoolLabel: DEFAULT_POOL_LABEL,
      normalizeCountryId: normalizeSmsPoolCountryId,
      normalizeCountryLabel: normalizeSmsPoolCountryLabel,
      normalizeCountryFallback: normalizeSmsPoolCountryFallback,
      normalizeMaxPrice: normalizeSmsPoolPrice,
      normalizeServiceId: normalizeSmsPoolServiceId,
      normalizeServiceLabel: normalizeSmsPoolServiceLabel,
      resolveCountryCandidates,
      requestActivation: (state, options) => requestActivation(state, options, providerDeps),
      finishActivation: (state, activation) => finishActivation(state, activation, providerDeps),
      cancelActivation: (state, activation) => cancelActivation(state, activation, providerDeps),
      banActivation: (state, activation) => banActivation(state, activation, providerDeps),
      pollActivationCode: (state, activation, options) => pollActivationCode(state, activation, options, providerDeps),
      fetchBalance: (state) => fetchBalance(state, providerDeps),
      fetchCountries: (state) => fetchCountries(state, providerDeps),
      fetchPrices: (state, countryConfig) => fetchPrices(state, countryConfig, providerDeps),
      describePayload,
    };
  }

  return {
    PROVIDER_ID,
    DEFAULT_BASE_URL,
    DEFAULT_COUNTRY_ID,
    DEFAULT_COUNTRY_LABEL,
    DEFAULT_SERVICE_ID,
    DEFAULT_SERVICE_LABEL,
    DEFAULT_POOL_ID,
    DEFAULT_POOL_LABEL,
    createProvider,
    describePayload,
    normalizeSmsPoolCountryFallback,
    normalizeSmsPoolCountryId,
    normalizeSmsPoolCountryLabel,
    normalizeSmsPoolPoolId,
    normalizeSmsPoolPoolLabel,
    normalizeSmsPoolPrice,
    normalizeSmsPoolServiceId,
    normalizeSmsPoolServiceLabel,
  };
});
