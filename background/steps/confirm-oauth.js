(function attachBackgroundStep9(root, factory) {
  root.MultiPageBackgroundStep9 = factory();
})(typeof self !== 'undefined' ? self : globalThis, function createBackgroundStep9Module() {
  function createStep9Executor(deps = {}) {
    const {
      addLog,
      chrome,
      cleanupStep8NavigationListeners,
      clickWithDebugger,
      completeNodeFromBackground,
      ensureStep8SignupPageReady,
      getOAuthFlowRemainingMs,
      getOAuthFlowStepTimeoutMs,
      getState,
      getStep8PageState,
      getStep8CallbackUrlFromNavigation,
      getStep8CallbackUrlFromTabUpdate,
      getStep8EffectLabel,
      getTabId,
      isTabAlive,
      phoneVerificationHelpers,
      prepareStep8DebuggerClick,
      recoverOAuthLocalhostTimeout,
      reloadStep8ConsentPage,
      reuseOrCreateTab,
      sleepWithStop,
      STEP8_CLICK_RETRY_DELAY_MS,
      STEP8_MAX_ROUNDS,
      STEP8_READY_WAIT_TIMEOUT_MS,
      STEP8_STRATEGIES,
      throwIfStep8SettledOrStopped,
      triggerStep8ContentStrategy,
      waitForStep8ClickEffect,
      waitForStep8Ready,
      setWebNavListener,
      setWebNavCommittedListener,
      setStep8PendingReject,
      setStep8TabUpdatedListener,
      shouldDeferStep9CallbackTimeout,
    } = deps;

    const LOCALHOST_CALLBACK_LOCAL_TIMEOUT_MS = 240000;
    const CALLBACK_TIMEOUT_CHECK_INTERVAL_MS = 1000;

    function getVisibleStep(state, fallback = 9) {
      const visibleStep = Math.floor(Number(state?.visibleStep) || 0);
      return visibleStep > 0 ? visibleStep : fallback;
    }

    function getAuthLoginStepForVisibleStep(visibleStep) {
      return visibleStep >= 12 ? 10 : 7;
    }

    function addStepLog(step, message, level = 'info') {
      return addLog(message, level, { step, stepKey: 'confirm-oauth' });
    }

    function normalizeStep9PhonePageState(pageState = {}) {
      const stateName = String(pageState?.state || '').trim();
      const url = String(pageState?.url || '').trim();
      const addPhonePage = Boolean(pageState?.addPhonePage)
        || stateName === 'add_phone_page'
        || /https:\/\/auth\.openai\.com\/add-phone(?:[/?#]|$)/i.test(url);
      const phoneVerificationPage = Boolean(pageState?.phoneVerificationPage)
        || stateName === 'phone_verification_page'
        || /https:\/\/auth\.openai\.com\/phone-verification(?:[/?#]|$)/i.test(url);
      if (!addPhonePage && !phoneVerificationPage) {
        return null;
      }
      return {
        ...(pageState || {}),
        addPhonePage,
        phoneVerificationPage,
      };
    }

    function isStep9PhonePageError(error) {
      const message = String(error?.message || error || '');
      return /add-phone|添加手机号页|手机号页面|手机验证码页|手机号验证|phone-verification|phone\s+verification|phone\s+number/i.test(message);
    }

    async function readStep9PageState(tabId, visibleStep) {
      if (typeof getStep8PageState !== 'function') {
        return null;
      }
      try {
        return await getStep8PageState(tabId, 2500, visibleStep);
      } catch (_) {
        return null;
      }
    }

    async function completeStep9PhoneVerificationIfNeeded(tabId, activeState, visibleStep, options = {}) {
      const pageState = normalizeStep9PhonePageState(
        options.pageState || await readStep9PageState(tabId, visibleStep)
      );
      if (!pageState) {
        return false;
      }

      const latestState = typeof getState === 'function'
        ? await getState().catch(() => activeState)
        : activeState;
      if (!latestState?.phoneVerificationEnabled) {
        const urlPart = pageState.url ? ` URL: ${pageState.url}` : '';
        throw new Error(`步骤 ${visibleStep}：检测到需要手机号验证，但手机接码未开启。${urlPart}`.trim());
      }
      if (typeof phoneVerificationHelpers?.completePhoneVerificationFlow !== 'function') {
        throw new Error(`步骤 ${visibleStep}：检测到需要手机号验证，但接码模块尚未初始化。`);
      }

      const provider = String(latestState?.phoneSmsProvider || '').trim();
      const providerLabel = provider === 'smspool' ? 'SMSPool' : (provider || '接码服务');
      await addStepLog(
        visibleStep,
        `检测到认证页需要添加手机号，正在使用 ${providerLabel} 完成手机号验证后继续 OAuth...`,
        'warn'
      );
      await phoneVerificationHelpers.completePhoneVerificationFlow(tabId, pageState, {
        step: visibleStep,
        visibleStep,
      });
      await addStepLog(visibleStep, '手机号验证已完成，继续自动确认 OAuth。', 'ok');
      return true;
    }

    async function executeStep9(state) {
      const visibleStep = getVisibleStep(state, 9);
      let activeState = state;

      if (!activeState.oauthUrl) {
        const authLoginStep = getAuthLoginStepForVisibleStep(visibleStep);
        throw new Error(`缺少登录用 OAuth 链接，请先完成步骤 ${authLoginStep}。`);
      }

      await addStepLog(visibleStep, '正在监听 localhost 回调地址...');

      let callbackTimeoutMs = LOCALHOST_CALLBACK_LOCAL_TIMEOUT_MS;
      let timeoutRecoveryAttempted = false;
      while (true) {
        try {
          callbackTimeoutMs = typeof getOAuthFlowStepTimeoutMs === 'function'
            ? await getOAuthFlowStepTimeoutMs(LOCALHOST_CALLBACK_LOCAL_TIMEOUT_MS, {
              step: visibleStep,
              actionLabel: 'OAuth localhost 回调',
              oauthUrl: activeState?.oauthUrl || '',
            })
            : LOCALHOST_CALLBACK_LOCAL_TIMEOUT_MS;
          break;
        } catch (error) {
          if (timeoutRecoveryAttempted || typeof recoverOAuthLocalhostTimeout !== 'function') {
            throw error;
          }
          const recoveredState = await recoverOAuthLocalhostTimeout({
            error,
            state: activeState,
            visibleStep,
          });
          if (!recoveredState) {
            throw error;
          }
          activeState = recoveredState;
          timeoutRecoveryAttempted = true;
        }
      }

      return new Promise((resolve, reject) => {
        let resolved = false;
        let signupTabId = null;
        let callbackWaitStartedAt = Date.now();
        let timeoutCheckTimer = null;
        let timeoutDeferredLogged = false;
        let phoneVerificationInProgress = false;

        const cleanupListener = () => {
          if (timeoutCheckTimer) {
            clearTimeout(timeoutCheckTimer);
            timeoutCheckTimer = null;
          }
          cleanupStep8NavigationListeners();
          setStep8PendingReject(null);
        };

        const rejectStep9 = (error) => {
          if (resolved) return;
          resolved = true;
          cleanupListener();
          reject(error);
        };

        const finalizeStep9Callback = (callbackUrl) => {
          if (resolved || !callbackUrl) return;

          resolved = true;
          cleanupListener();

          addStepLog(visibleStep, `已捕获 localhost 地址：${callbackUrl}`, 'ok').then(() => {
            return completeNodeFromBackground(state?.nodeId || 'confirm-oauth', { localhostUrl: callbackUrl });
          }).then(() => {
            resolve();
          }).catch((err) => {
            reject(err);
          });
        };

        const isCallbackTimeoutDeferred = async (elapsedMs) => {
          if (phoneVerificationInProgress) {
            if (!timeoutDeferredLogged) {
              timeoutDeferredLogged = true;
              await addStepLog(
                visibleStep,
                '正在完成手机号验证，暂停 localhost 回调超时判定，待验证完成后继续 OAuth。',
                'info'
              );
            }
            return true;
          }
          if (typeof shouldDeferStep9CallbackTimeout !== 'function') {
            return false;
          }
          try {
            const deferred = await shouldDeferStep9CallbackTimeout({
              tabId: signupTabId,
              visibleStep,
              elapsedMs,
              oauthUrl: activeState?.oauthUrl || '',
            });
            if (deferred && !timeoutDeferredLogged) {
              timeoutDeferredLogged = true;
              await addStepLog(
                visibleStep,
                '检测到认证页仍在安全验证/授权跳转中，暂停本地回调超时判定，继续等待 localhost 回调...',
                'info'
              );
            }
            return Boolean(deferred);
          } catch (error) {
            await addStepLog(
              visibleStep,
              `复核认证页跳转状态失败（${error?.message || error}），继续按原超时规则等待回调。`,
              'warn'
            );
            return false;
          }
        };

        const runPhoneVerificationIfNeeded = async (pageState = null) => {
          phoneVerificationInProgress = true;
          try {
            const completed = await completeStep9PhoneVerificationIfNeeded(signupTabId, activeState, visibleStep, {
              pageState,
            });
            if (completed) {
              callbackWaitStartedAt = Date.now();
              timeoutDeferredLogged = false;
            }
            return completed;
          } finally {
            phoneVerificationInProgress = false;
          }
        };

        const checkCallbackTimeout = async () => {
          if (resolved) {
            return;
          }
          const elapsedMs = Date.now() - callbackWaitStartedAt;
          if (await isCallbackTimeoutDeferred(elapsedMs)) {
            timeoutCheckTimer = setTimeout(checkCallbackTimeout, CALLBACK_TIMEOUT_CHECK_INTERVAL_MS);
            return;
          }

          if (elapsedMs >= LOCALHOST_CALLBACK_LOCAL_TIMEOUT_MS) {
            rejectStep9(new Error(`${Math.round(LOCALHOST_CALLBACK_LOCAL_TIMEOUT_MS / 1000)} 秒内未捕获到 localhost 回调跳转，步骤 ${visibleStep} 的点击可能被拦截了。`));
            return;
          }

          if (typeof getOAuthFlowRemainingMs === 'function') {
            try {
              await getOAuthFlowRemainingMs({
                step: visibleStep,
                actionLabel: 'OAuth localhost 回调',
                oauthUrl: activeState?.oauthUrl || '',
              });
            } catch (error) {
              rejectStep9(error);
              return;
            }
          } else if (elapsedMs >= callbackTimeoutMs) {
            rejectStep9(new Error(`${Math.round(callbackTimeoutMs / 1000)} 秒内未捕获到 localhost 回调跳转，步骤 ${visibleStep} 的点击可能被拦截了。`));
            return;
          }

          timeoutCheckTimer = setTimeout(checkCallbackTimeout, CALLBACK_TIMEOUT_CHECK_INTERVAL_MS);
        };

        timeoutCheckTimer = setTimeout(
          checkCallbackTimeout,
          Math.min(CALLBACK_TIMEOUT_CHECK_INTERVAL_MS, Math.max(1, callbackTimeoutMs))
        );

        setStep8PendingReject((error) => {
          rejectStep9(error);
        });

        setWebNavListener((details) => {
          const callbackUrl = getStep8CallbackUrlFromNavigation(details, signupTabId);
          finalizeStep9Callback(callbackUrl);
        });

        setWebNavCommittedListener((details) => {
          const callbackUrl = getStep8CallbackUrlFromNavigation(details, signupTabId);
          finalizeStep9Callback(callbackUrl);
        });

        setStep8TabUpdatedListener((tabId, changeInfo, tab) => {
          const callbackUrl = getStep8CallbackUrlFromTabUpdate(tabId, changeInfo, tab, signupTabId);
          finalizeStep9Callback(callbackUrl);
        });

        (async () => {
          try {
            throwIfStep8SettledOrStopped(resolved);
            signupTabId = await getTabId('signup-page');
            throwIfStep8SettledOrStopped(resolved);

            if (signupTabId && await isTabAlive('signup-page')) {
              await chrome.tabs.update(signupTabId, { active: true });
              await addStepLog(visibleStep, '已切回认证页，正在准备调试器点击...');
            } else {
              signupTabId = await reuseOrCreateTab('signup-page', activeState.oauthUrl);
              await addStepLog(visibleStep, '已重新打开认证页，正在准备调试器点击...');
            }

            throwIfStep8SettledOrStopped(resolved);
            chrome.webNavigation.onBeforeNavigate.addListener(deps.getWebNavListener());
            chrome.webNavigation.onCommitted.addListener(deps.getWebNavCommittedListener());
            chrome.tabs.onUpdated.addListener(deps.getStep8TabUpdatedListener());
            await ensureStep8SignupPageReady(signupTabId, {
              timeoutMs: typeof getOAuthFlowStepTimeoutMs === 'function'
                ? await getOAuthFlowStepTimeoutMs(15000, {
                  step: visibleStep,
                  actionLabel: '等待 OAuth 同意页内容脚本就绪',
                })
                : 15000,
              visibleStep,
              logStepKey: 'confirm-oauth',
              logMessage: '认证页内容脚本尚未就绪，正在等待页面恢复...',
            });

            for (let round = 1; round <= STEP8_MAX_ROUNDS && !resolved; round++) {
              throwIfStep8SettledOrStopped(resolved);
              let pageState = null;
              try {
                await runPhoneVerificationIfNeeded(await readStep9PageState(signupTabId, visibleStep));
                pageState = await waitForStep8Ready(
                  signupTabId,
                  typeof getOAuthFlowStepTimeoutMs === 'function'
                    ? await getOAuthFlowStepTimeoutMs(STEP8_READY_WAIT_TIMEOUT_MS, {
                      step: visibleStep,
                      actionLabel: '等待 OAuth 同意页出现',
                    })
                    : STEP8_READY_WAIT_TIMEOUT_MS,
                  { visibleStep }
                );
              } catch (readyError) {
                if (
                  isStep9PhonePageError(readyError)
                  && await runPhoneVerificationIfNeeded()
                ) {
                  round = 0;
                  continue;
                }
                throw readyError;
              }
              if (!pageState?.consentReady) {
                await sleepWithStop(STEP8_CLICK_RETRY_DELAY_MS);
                continue;
              }

              const strategy = STEP8_STRATEGIES[Math.min(round - 1, STEP8_STRATEGIES.length - 1)];

              await addStepLog(visibleStep, `第 ${round}/${STEP8_MAX_ROUNDS} 轮尝试点击“继续”（${strategy.label}）...`);

              if (strategy.mode === 'debugger') {
                const clickActionTimeoutMs = typeof getOAuthFlowStepTimeoutMs === 'function'
                  ? await getOAuthFlowStepTimeoutMs(15000, {
                    step: visibleStep,
                    actionLabel: '定位 OAuth 同意页继续按钮',
                  })
                  : 15000;
                const clickTarget = await prepareStep8DebuggerClick(signupTabId, {
                  timeoutMs: clickActionTimeoutMs,
                  responseTimeoutMs: clickActionTimeoutMs,
                  visibleStep,
                });
                throwIfStep8SettledOrStopped(resolved);
                await clickWithDebugger(signupTabId, clickTarget?.rect, { visibleStep });
              } else {
                const clickActionTimeoutMs = typeof getOAuthFlowStepTimeoutMs === 'function'
                  ? await getOAuthFlowStepTimeoutMs(15000, {
                    step: visibleStep,
                    actionLabel: '点击 OAuth 同意页继续按钮',
                  })
                  : 15000;
                await triggerStep8ContentStrategy(signupTabId, strategy.strategy, {
                  timeoutMs: clickActionTimeoutMs,
                  responseTimeoutMs: clickActionTimeoutMs,
                  visibleStep,
                });
              }

              if (resolved) {
                return;
              }

              let effect = null;
              try {
                effect = await waitForStep8ClickEffect(
                  signupTabId,
                  pageState.url,
                  typeof getOAuthFlowStepTimeoutMs === 'function'
                    ? await getOAuthFlowStepTimeoutMs(15000, {
                      step: visibleStep,
                      actionLabel: '等待 OAuth 同意页点击生效',
                    })
                    : 15000,
                  { visibleStep }
                );
              } catch (effectError) {
                if (
                  isStep9PhonePageError(effectError)
                  && await runPhoneVerificationIfNeeded()
                ) {
                  round = 0;
                  continue;
                }
                throw effectError;
              }
              if (resolved) {
                return;
              }

              if (effect.progressed) {
                await addStepLog(visibleStep, `检测到本次点击已生效，${getStep8EffectLabel(effect)}，继续等待 localhost 回调...`, 'info');
                break;
              }

              if (round >= STEP8_MAX_ROUNDS) {
                throw new Error(`步骤 ${visibleStep}：连续 ${STEP8_MAX_ROUNDS} 轮点击“继续”后页面仍无反应。`);
              }

              await addStepLog(visibleStep, `${strategy.label} 本轮点击后页面无反应，正在刷新认证页后重试（下一轮 ${round + 1}/${STEP8_MAX_ROUNDS}）...`, 'warn');
              await reloadStep8ConsentPage(
                signupTabId,
                typeof getOAuthFlowStepTimeoutMs === 'function'
                  ? await getOAuthFlowStepTimeoutMs(30000, {
                    step: visibleStep,
                    actionLabel: '刷新 OAuth 同意页',
                  })
                  : 30000,
                { visibleStep }
              );
              await sleepWithStop(STEP8_CLICK_RETRY_DELAY_MS);
            }
          } catch (err) {
            rejectStep9(err);
          }
        })();
      });
    }

    return { executeStep9 };
  }

  return { createStep9Executor };
});
