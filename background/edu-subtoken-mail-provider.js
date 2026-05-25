(function eduSubtokenMailProviderModule(root, factory) {
  root.MultiPageBackgroundEduSubtokenMailProvider = factory();
})(typeof self !== 'undefined' ? self : globalThis, function createEduSubtokenMailProviderModule() {
  function createEduSubtokenMailProvider(deps = {}) {
    const {
      addLog = async () => {},
      buildEduSubtokenMailBasicAuthHeader,
      buildEduSubtokenMailHeaders,
      buildEduSubtokenMailUsername,
      EDU_SUBTOKEN_MAIL_DEFAULT_PAGE_SIZE = 80,
      EDU_SUBTOKEN_MAIL_GENERATOR = 'edu-subtoken-mail-api',
      EDU_SUBTOKEN_MAIL_PROVIDER = 'edu-subtoken-mail-api',
      fetchImpl = typeof fetch === 'function' ? fetch.bind(globalThis) : null,
      generateEduSubtokenMailAccountPassword,
      getState = async () => ({}),
      isValidEduSubtokenMailUsername,
      joinEduSubtokenMailUrl,
      normalizeEduSubtokenMailAccountPassword,
      normalizeEduSubtokenMailAddress,
      normalizeEduSubtokenMailBaseUrl,
      normalizeEduSubtokenMailCurrentAccount,
      normalizeEduSubtokenMailDomain,
      normalizeEduSubtokenMailMessages,
      normalizeEduSubtokenMailNextNumber,
      normalizeEduSubtokenMailNumberPadding,
      normalizeEduSubtokenMailReceiveMailbox,
      normalizeEduSubtokenMailUsernamePart,
      persistRegistrationEmailState = null,
      broadcastDataUpdate = null,
      pickVerificationMessageWithTimeFallback,
      setEmailState = async () => {},
      setPersistentSettings = async () => {},
      setState = async () => {},
      sleepWithStop = async () => {},
      throwIfStopped = () => {},
    } = deps;

    async function persistResolvedEmailState(state = null, email, options = {}) {
      if (typeof persistRegistrationEmailState === 'function') {
        await persistRegistrationEmailState(state, email, options);
        return;
      }
      await setEmailState(email, options);
    }

    async function persistGeneratedAccountState(updates = {}) {
      await setPersistentSettings(updates);
      await setState(updates);
      if (typeof broadcastDataUpdate === 'function') {
        broadcastDataUpdate(updates);
      }
    }

    function getEduSubtokenMailConfig(state = {}) {
      return {
        baseUrl: normalizeEduSubtokenMailBaseUrl(state.eduSubtokenMailBaseUrl),
        domain: normalizeEduSubtokenMailDomain(state.eduSubtokenMailDomain),
        accountPrefix: normalizeEduSubtokenMailUsernamePart(state.eduSubtokenMailAccountPrefix, 'subtoken'),
        accountSuffix: normalizeEduSubtokenMailUsernamePart(state.eduSubtokenMailAccountSuffix, ''),
        nextNumber: normalizeEduSubtokenMailNextNumber(state.eduSubtokenMailNextNumber),
        numberPadding: normalizeEduSubtokenMailNumberPadding(state.eduSubtokenMailNumberPadding),
        accountPassword: normalizeEduSubtokenMailAccountPassword(state.eduSubtokenMailAccountPassword),
        currentAccount: normalizeEduSubtokenMailCurrentAccount(state.eduSubtokenMailCurrentAccount),
      };
    }

    function ensureEduSubtokenMailConfig(state, options = {}) {
      const { requireCurrentAccount = false } = options;
      const config = getEduSubtokenMailConfig(state);
      if (!config.baseUrl) {
        throw new Error('Edu Subtoken Mail API 地址为空或格式无效。');
      }
      if (requireCurrentAccount && !config.currentAccount) {
        throw new Error('Edu Subtoken Mail 当前邮箱账号为空，请先点击生成邮箱账号。');
      }
      return config;
    }

    function buildSessionAuthHeaders(config = {}, options = {}) {
      const headers = buildEduSubtokenMailHeaders({}, {
        json: options.json,
        acceptJson: options.acceptJson,
      });
      const username = options.username || config.currentAccount?.username || '';
      const password = options.password || config.currentAccount?.password || '';
      if (username && password && typeof buildEduSubtokenMailBasicAuthHeader === 'function') {
        headers.Authorization = buildEduSubtokenMailBasicAuthHeader(username, password);
      }
      return headers;
    }

    async function requestEduSubtokenMailJson(config, path, options = {}) {
      if (!fetchImpl) {
        throw new Error('Edu Subtoken Mail 当前运行环境不支持 fetch。');
      }
      const {
        method = 'GET',
        payload,
        searchParams,
        timeoutMs = 20000,
      } = options;
      const url = new URL(joinEduSubtokenMailUrl(config.baseUrl, path));
      if (searchParams && typeof searchParams === 'object') {
        for (const [key, value] of Object.entries(searchParams)) {
          if (value === undefined || value === null || value === '') continue;
          url.searchParams.set(key, String(value));
        }
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(new Error('timeout')), timeoutMs);
      let response;
      try {
        response = await fetchImpl(url.toString(), {
          method,
          headers: options.headers || buildSessionAuthHeaders(config, {
            json: payload !== undefined,
          }),
          credentials: options.credentials || 'include',
          body: payload !== undefined ? JSON.stringify(payload) : undefined,
          signal: controller.signal,
        });
      } catch (err) {
        const errorMessage = err?.name === 'AbortError'
          ? `Edu Subtoken Mail 请求超时（>${Math.round(timeoutMs / 1000)} 秒）`
          : `Edu Subtoken Mail 请求失败：${err.message}`;
        throw new Error(errorMessage);
      } finally {
        clearTimeout(timeoutId);
      }

      const text = await response.text();
      let parsed;
      try {
        parsed = text ? JSON.parse(text) : {};
      } catch {
        parsed = text;
      }

      if (!response.ok) {
        const payloadError = typeof parsed === 'object' && parsed
          ? (parsed.message || parsed.error || parsed.msg)
          : '';
        throw new Error(`Edu Subtoken Mail 请求失败：${payloadError || text || `HTTP ${response.status}`}`);
      }
      return parsed;
    }

    function resolveEduSubtokenMailPollTargetEmail(state = {}, pollPayload = {}, config = getEduSubtokenMailConfig(state)) {
      const requestedTarget = normalizeEduSubtokenMailReceiveMailbox(pollPayload.targetEmail);
      if (requestedTarget) {
        return requestedTarget;
      }

      return normalizeEduSubtokenMailReceiveMailbox(state.email) || config.currentAccount?.email || '';
    }

    async function listEduSubtokenMailMessages(state, options = {}) {
      const latestState = state || await getState();
      const config = ensureEduSubtokenMailConfig(latestState, { requireCurrentAccount: true });
      const address = normalizeEduSubtokenMailReceiveMailbox(options.address);
      const limit = Math.max(1, Math.min(100, Number(options.limit) || EDU_SUBTOKEN_MAIL_DEFAULT_PAGE_SIZE));
      const payload = await requestEduSubtokenMailJson(config, '/messages', {
        method: 'GET',
        searchParams: {
          folder: options.folder || 'inbox',
          limit,
          q: options.query || '',
          cursor: options.cursor || '',
        },
      });
      const messages = normalizeEduSubtokenMailMessages(payload).filter((message) => {
        if (!address) return true;
        const messageAddress = normalizeEduSubtokenMailAddress(message.address);
        return !messageAddress || messageAddress === address;
      });
      return { config, messages };
    }

    async function getEduSubtokenMailMessage(state, messageId) {
      const latestState = state || await getState();
      const config = ensureEduSubtokenMailConfig(latestState, { requireCurrentAccount: true });
      const id = String(messageId || '').trim();
      if (!id) {
        throw new Error('Edu Subtoken Mail 邮件 ID 为空。');
      }
      const payload = await requestEduSubtokenMailJson(config, `/messages/${encodeURIComponent(id)}`, {
        method: 'GET',
      });
      return normalizeEduSubtokenMailMessages([payload?.message || payload?.data || payload])[0] || null;
    }

    function summarizeEduSubtokenMailMessagesForLog(messages) {
      return (messages || [])
        .slice()
        .sort((left, right) => {
          const leftTime = Date.parse(left.receivedDateTime || '') || 0;
          const rightTime = Date.parse(right.receivedDateTime || '') || 0;
          return rightTime - leftTime;
        })
        .slice(0, 3)
        .map((message) => {
          const receivedAt = message?.receivedDateTime || '未知时间';
          const sender = message?.from?.emailAddress?.address || '未知发件人';
          const subject = message?.subject || '（无主题）';
          const preview = String(message?.bodyPreview || '').replace(/\s+/g, ' ').trim().slice(0, 80);
          const address = message?.address || '未知地址';
          return `[${address}] ${receivedAt} | ${sender} | ${subject} | ${preview}`;
        })
        .join(' || ');
    }

    async function pollEduSubtokenMailVerificationCode(step, state, pollPayload = {}) {
      const latestState = state || await getState();
      const config = ensureEduSubtokenMailConfig(latestState, { requireCurrentAccount: true });
      const targetEmail = resolveEduSubtokenMailPollTargetEmail(latestState, pollPayload, config);
      const registrationEmail = normalizeEduSubtokenMailReceiveMailbox(latestState.email);
      if (!targetEmail) {
        throw new Error('Edu Subtoken Mail 轮询前缺少目标邮箱地址，请先生成邮箱账号。');
      }
      if (registrationEmail && registrationEmail !== targetEmail) {
        await addLog(`步骤 ${step}：正在轮询 Edu Subtoken Mail 接收邮箱（${targetEmail}），注册邮箱为 ${registrationEmail}...`, 'info');
      } else {
        await addLog(`步骤 ${step}：正在轮询 Edu Subtoken Mail 邮件（${targetEmail}）...`, 'info');
      }
      const maxAttempts = Number(pollPayload.maxAttempts) || 5;
      const intervalMs = Number(pollPayload.intervalMs) || 3000;
      let lastError = null;
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        throwIfStopped();
        try {
          const { messages } = await listEduSubtokenMailMessages(latestState, {
            address: targetEmail,
            limit: pollPayload.limit || EDU_SUBTOKEN_MAIL_DEFAULT_PAGE_SIZE,
            query: pollPayload.query || '',
          });
          let matchResult = pickVerificationMessageWithTimeFallback(messages, {
            afterTimestamp: pollPayload.filterAfterTimestamp || 0,
            senderFilters: pollPayload.senderFilters || [],
            subjectFilters: pollPayload.subjectFilters || [],
            requiredKeywords: pollPayload.requiredKeywords || [],
            codePatterns: pollPayload.codePatterns || [],
            excludeCodes: pollPayload.excludeCodes || [],
          });
          let match = matchResult.match;
          if (!match?.code) {
            const detailMessages = [];
            for (const message of messages.slice(0, 5)) {
              if (!message?.id) continue;
              const detail = await getEduSubtokenMailMessage(latestState, message.id).catch(() => null);
              if (detail) {
                detailMessages.push({
                  ...message,
                  ...detail,
                  address: detail.address || message.address,
                  receivedDateTime: detail.receivedDateTime || message.receivedDateTime,
                });
              }
            }
            if (detailMessages.length) {
              matchResult = pickVerificationMessageWithTimeFallback(detailMessages, {
                afterTimestamp: pollPayload.filterAfterTimestamp || 0,
                senderFilters: pollPayload.senderFilters || [],
                subjectFilters: pollPayload.subjectFilters || [],
                requiredKeywords: pollPayload.requiredKeywords || [],
                codePatterns: pollPayload.codePatterns || [],
                excludeCodes: pollPayload.excludeCodes || [],
              });
              match = matchResult.match;
            }
          }
          if (match?.code) {
            if (matchResult.usedRelaxedFilters) {
              const fallbackLabel = matchResult.usedTimeFallback ? '宽松匹配 + 时间回退' : '宽松匹配';
              await addLog(`步骤 ${step}：严格规则未命中，已改用 ${fallbackLabel} 并命中 Edu Subtoken Mail 验证码。`, 'warn');
            }
            return {
              ok: true,
              code: match.code,
              emailTimestamp: match.receivedAt || Date.now(),
              mailId: match.message?.id || '',
            };
          }
          lastError = new Error(`步骤 ${step}：暂未在 Edu Subtoken Mail 中找到匹配验证码（${attempt}/${maxAttempts}）。`);
          await addLog(lastError.message, attempt === maxAttempts ? 'warn' : 'info');
          const sample = summarizeEduSubtokenMailMessagesForLog(messages);
          if (sample) {
            await addLog(`步骤 ${step}：最近邮件样本：${sample}`, 'info');
          }
        } catch (err) {
          lastError = err;
          await addLog(`步骤 ${step}：Edu Subtoken Mail 轮询失败：${err.message}`, 'warn');
        }
        if (attempt < maxAttempts) {
          await sleepWithStop(intervalMs);
        }
      }
      throw lastError || new Error(`步骤 ${step}：未在 Edu Subtoken Mail 中找到新的匹配验证码。`);
    }

    async function loginEduSubtokenMailAccount(state, account = null) {
      const latestState = state || await getState();
      const config = ensureEduSubtokenMailConfig(latestState);
      const normalizedAccount = normalizeEduSubtokenMailCurrentAccount(account || config.currentAccount);
      if (!normalizedAccount) {
        throw new Error('Edu Subtoken Mail 登录前缺少邮箱账号或密码。');
      }
      await requestEduSubtokenMailJson(config, '/login', {
        method: 'POST',
        payload: {
          username: normalizedAccount.username,
          password: normalizedAccount.password,
        },
        headers: buildEduSubtokenMailHeaders({}, { json: true }),
      });
      return normalizedAccount;
    }

    async function registerEduSubtokenMailAccount(state, username, password) {
      const config = ensureEduSubtokenMailConfig(state);
      return requestEduSubtokenMailJson(config, '/register', {
        method: 'POST',
        payload: { username, password },
        headers: buildEduSubtokenMailHeaders({}, { json: true }),
      });
    }

    async function fetchEduSubtokenMailAddress(state, options = {}) {
      throwIfStopped();
      const latestState = state || await getState();
      const config = ensureEduSubtokenMailConfig(latestState);
      const maxAttempts = Math.max(1, Math.min(20, Number(options.maxAttempts) || 8));
      let nextNumber = normalizeEduSubtokenMailNextNumber(options.nextNumber ?? config.nextNumber);
      let lastError = null;
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        throwIfStopped();
        const username = buildEduSubtokenMailUsername({
          prefix: config.accountPrefix,
          suffix: config.accountSuffix,
          nextNumber,
          numberPadding: config.numberPadding,
        });
        if (!isValidEduSubtokenMailUsername(username)) {
          throw new Error(`Edu Subtoken Mail 用户名无效：${username}`);
        }
        const password = normalizeEduSubtokenMailAccountPassword(config.accountPassword)
          || generateEduSubtokenMailAccountPassword(username);
        try {
          const response = await registerEduSubtokenMailAccount(latestState, username, password);
          const email = normalizeEduSubtokenMailReceiveMailbox(response?.user?.email || `${username}@${config.domain}`);
          if (!email) {
            throw new Error('Edu Subtoken Mail 注册响应缺少邮箱地址。');
          }
          const account = {
            username,
            email,
            password,
            createdAt: new Date().toISOString(),
          };
          await persistGeneratedAccountState({
            eduSubtokenMailNextNumber: nextNumber + 1,
            eduSubtokenMailAccountPassword: password,
            eduSubtokenMailCurrentAccount: account,
          });
          await persistResolvedEmailState(latestState, email, {
            source: 'generated:edu-subtoken-mail-api',
            preserveAccountIdentity: Boolean(options?.preserveAccountIdentity),
          });
          await addLog(`Edu Subtoken Mail：已创建邮箱账号 ${email}`, 'ok');
          return email;
        } catch (err) {
          lastError = err;
          if (!/already|claimed|409/i.test(String(err?.message || ''))) {
            throw err;
          }
          await addLog(`Edu Subtoken Mail：${username} 已存在，尝试下一个编号。`, 'warn');
          nextNumber += 1;
        }
      }
      throw lastError || new Error('Edu Subtoken Mail 创建邮箱账号失败。');
    }

    return {
      ensureEduSubtokenMailConfig,
      fetchEduSubtokenMailAddress,
      getEduSubtokenMailConfig,
      getEduSubtokenMailMessage,
      loginEduSubtokenMailAccount,
      listEduSubtokenMailMessages,
      pollEduSubtokenMailVerificationCode,
      registerEduSubtokenMailAccount,
      requestEduSubtokenMailJson,
      resolveEduSubtokenMailPollTargetEmail,
    };
  }

  return {
    createEduSubtokenMailProvider,
  };
});
