/**
 * Browser-side adapter for the authenticated Agent Mail management host.
 *
 * This module deliberately keeps the management session and enrollment wire
 * separate from the ordinary MCP mailbox proxy. The only browser-persisted
 * values are opaque recovery handles and the original compare-and-swap
 * revision; credentials, pairing codes and CSRF tokens stay in memory.
 */

export const MANAGEMENT_SESSION_PATH = '/v1/management-session';
export const CONNECTION_MANAGEMENT_PATH = '/v1/connection-management';
export const CSRF_HEADER = 'X-Agent-Mail-CSRF';
export const RECOVERY_STORAGE_KEY = 'dsh-agent-mail-ui.enrollment.v1';

const RECOVERY_FIELDS = [
  'profile_handle',
  'context_handle',
  'enrollment_handle',
  'request_id',
  'observed_config_revision',
];

const ENROLLMENT_STATES = new Set([
  'context_ready',
  'redeem_in_progress',
  'pending_save',
  'commit_in_progress',
  'saved',
  'active',
  'error',
  'cleanup_pending',
  'cleanup_conflict',
  'cancelled',
  'expired',
]);

const PENDING_PHASES = new Set([
  'beginning',
  'context_ready',
  'redeeming',
  'recovering',
  'pending_save',
  'committing',
  'cancelling',
  'unknown',
  'cleanup_pending',
  'cleanup_conflict',
]);

const SAFE_ERROR_MESSAGES = new Map([
  ['management_denied', '管理会话无权执行此操作。请重新登录或联系管理宿主。'],
  ['target_not_allowed', '所选 DSH profile 或 Hub 不在管理宿主允许范围内。'],
  ['tls_untrusted', 'Hub TLS 信任校验失败。请检查管理宿主的信任配置。'],
  ['hub_unreachable', 'Hub 暂时无法访问，请检查网络后重试。'],
  ['code_invalid_or_expired', '配对码无效或已过期。请在 Hub 上重新生成配对码。'],
  ['rate_limited', 'Hub 暂时限制了配对请求，请稍后重试。'],
  ['identity_conflict', '该身份已经存在，当前向导不会覆盖已有身份。'],
  ['identity_mismatch', 'Hub 返回的身份与确认身份不一致。'],
  ['context_expired', '配对上下文已过期，请取消后重新开始。'],
  ['idempotency_conflict', '重试参数与原操作不一致，请刷新当前状态。'],
  ['config_conflict', 'profile 配置已发生变化，请刷新状态后再决定。'],
  ['save_failed', '连接已验证，但保存失败；请刷新状态后重试保存。'],
  ['activation_failed', '连接已保存，但 DSH 激活检查未通过。确认已重启后可再次检查。'],
  ['cleanup_pending', '取消仍在清理中，尚未确认完成。请等待后刷新状态。'],
  ['cleanup_conflict', '取消遇到配置冲突，未报告为成功；请刷新状态并由管理者处理。'],
  ['directory_failed', '收件人目录读取失败，请稍后刷新。'],
  ['test_timeout', '测试任务仍未得到可验证结果；这不代表收件人离线。'],
  ['csrf_missing', '管理会话已失效，请重新登录。'],
  ['management_unavailable', '管理宿主未配置。'],
  ['network_error', '管理宿主暂时不可达，请检查连接后重试。'],
  ['protocol_error', '管理宿主返回了无法识别的结果。'],
]);

function safeText(value) {
  return typeof value === 'string' ? value : '';
}

function messageFor(code, fallback = '操作失败，请检查管理宿主状态。') {
  return SAFE_ERROR_MESSAGES.get(code) ?? fallback;
}

function isValidString(value) {
  return typeof value === 'string' && value.trim() !== '';
}

function randomRequestId() {
  const crypto = globalThis.crypto;
  if (typeof crypto?.randomUUID === 'function') return crypto.randomUUID();
  if (typeof crypto?.getRandomValues === 'function') {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  throw new Error('secure random source unavailable');
}

function readRecovery(storage) {
  if (storage == null || typeof storage.getItem !== 'function') return null;
  let raw;
  try {
    raw = storage.getItem(RECOVERY_STORAGE_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const result = {};
    for (const field of RECOVERY_FIELDS) {
      if (Object.hasOwn(parsed, field)) {
        if (!isValidString(parsed[field]) || parsed[field].length > 512) return null;
        result[field] = parsed[field];
      }
    }
    if (!result.profile_handle || (!result.context_handle && !result.enrollment_handle)) return null;
    return result;
  } catch {
    return null;
  }
}

function writeRecovery(storage, record) {
  if (storage == null || typeof storage.setItem !== 'function') return;
  const value = {};
  for (const field of RECOVERY_FIELDS) {
    if (isValidString(record?.[field])) value[field] = record[field];
  }
  if (!value.profile_handle || (!value.context_handle && !value.enrollment_handle)) {
    clearRecovery(storage);
    return;
  }
  try {
    storage.setItem(RECOVERY_STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Private browsing and quota policies may reject session storage. The
    // in-memory controller remains usable; no sensitive fallback is created.
  }
}

function clearRecovery(storage) {
  if (storage == null || typeof storage.removeItem !== 'function') return;
  try { storage.removeItem(RECOVERY_STORAGE_KEY); } catch { /* unavailable */ }
}

function browserSessionStorage() {
  try { return globalThis.sessionStorage; } catch { return undefined; }
}

function normalizeProfile(profile) {
  if (profile == null || typeof profile !== 'object' || Array.isArray(profile)) return null;
  const handle = safeText(profile.handle).trim();
  const label = safeText(profile.label).trim();
  const endpoints = Array.isArray(profile.endpoints)
    ? profile.endpoints.filter((endpoint) => isValidString(endpoint)).map((endpoint) => endpoint.trim())
    : [];
  if (!handle || !label) return null;
  return { handle, label, endpoints: [...new Set(endpoints)] };
}

function normalizeSession(value) {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) {
    throw new ManagementClientError('protocol_error');
  }
  if (value.authenticated !== true || !isValidString(value.csrf_token) || !isValidString(value.expires_at)) {
    throw new ManagementClientError('protocol_error');
  }
  const profiles = Array.isArray(value.profiles)
    ? value.profiles.map(normalizeProfile).filter(Boolean)
    : null;
  if (profiles == null) throw new ManagementClientError('protocol_error');
  return {
    csrfToken: value.csrf_token,
    expiresAt: value.expires_at,
    profiles,
  };
}

function normalizeUnauthenticated(value) {
  return value != null
    && typeof value === 'object'
    && !Array.isArray(value)
    && value.authenticated === false;
}

function normalizeEnrollment(value) {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) {
    throw new ManagementClientError('protocol_error');
  }
  const state = safeText(value.state).trim();
  if (!ENROLLMENT_STATES.has(state)) throw new ManagementClientError('protocol_error');
  const result = { state };
  for (const field of [
    'enrollment_handle',
    'agent_id',
    'expires_at',
    'verified_at',
    'config_revision',
    'remote_committed_at',
    'saved_at',
    'activated_at',
    'save_state',
    'activation_state',
    'cleanup_state',
    'commit_id',
  ]) {
    if (isValidString(value[field])) result[field] = value[field].trim();
  }
  if (value.retryable_error != null && typeof value.retryable_error === 'object') {
    result.retryable_error = {
      code: safeText(value.retryable_error.code),
      stage: safeText(value.retryable_error.stage),
      retryable: value.retryable_error.retryable === true,
    };
  }
  return result;
}

export function isEnrollmentPending(enrollment) {
  return Boolean(enrollment && PENDING_PHASES.has(enrollment.phase));
}

export function enrollmentPhaseLabel(enrollment) {
  const phase = safeText(enrollment?.phase);
  return new Map([
    ['beginning', '正在创建安全配对上下文'],
    ['context_ready', '等待输入 Hub 配对码'],
    ['redeeming', '正在验证配对码'],
    ['recovering', '正在恢复上一次结果'],
    ['pending_save', '已验证，等待确认身份并保存'],
    ['committing', '正在保存连接'],
    ['saved', '已保存，等待激活检查'],
    ['activating', '正在检查 DSH 激活'],
    ['active', '连接已激活'],
    ['cancelling', '正在取消并等待清理'],
    ['cleanup_pending', '取消清理仍在进行'],
    ['cleanup_conflict', '取消遇到冲突'],
    ['unknown', '结果未知，等待状态核对'],
    ['error', '操作失败'],
    ['cancelled', '已取消'],
    ['expired', '已过期'],
  ]).get(phase) ?? '未开始';
}

export function managementErrorMessage(error) {
  if (error == null) return '';
  return messageFor(safeText(error.code), safeText(error.message) || undefined);
}

export class ManagementClientError extends Error {
  constructor(code, options = {}) {
    super(messageFor(code, options.message));
    this.name = 'ManagementClientError';
    this.code = code;
    this.status = options.status ?? 0;
    this.unknown = options.unknown === true;
  }
}

export class ManagementController {
  constructor(options = {}) {
    this.fetchImpl = options.fetchImpl ?? ((...args) => globalThis.fetch(...args));
    this.sessionPath = options.sessionPath ?? MANAGEMENT_SESSION_PATH;
    this.enrollmentPath = options.enrollmentPath ?? CONNECTION_MANAGEMENT_PATH;
    this.storage = options.storage === undefined ? browserSessionStorage() : options.storage;
    this.listeners = new Set();
    this.csrfToken = '';
    this.disposed = false;
    this.authEpoch = 0;
    this.enrollmentGeneration = 0;
    this.authPromise = null;
    this.enrollmentPromise = null;
    this.authBusy = false;
    this.enrollmentBusy = false;
    this.recovery = readRecovery(this.storage);
    this.snapshot = {
      managementStatus: 'checking',
      authenticated: false,
      profiles: [],
      expiresAt: null,
      selectedProfileHandle: this.recovery?.profile_handle ?? '',
      selectedEndpoint: '',
      authBusy: false,
      enrollmentBusy: false,
      enrollment: null,
      error: '',
      notice: '',
    };
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getSnapshot() {
    return this.snapshot;
  }

  _set(patch) {
    if (this.disposed) return;
    this.snapshot = { ...this.snapshot, ...patch };
    for (const listener of this.listeners) {
      try { listener(); } catch { /* React owns subscription failures */ }
    }
  }

  _setAuthBusy(value) {
    this.authBusy = value;
    this._set({ authBusy: value });
  }

  _setEnrollmentBusy(value) {
    this.enrollmentBusy = value;
    this._set({ enrollmentBusy: value });
  }

  _profile(handle = this.snapshot.selectedProfileHandle) {
    return this.snapshot.profiles.find((profile) => profile.handle === handle);
  }

  _currentEnrollment(generation) {
    const enrollment = this.snapshot.enrollment;
    return enrollment && enrollment.generation === generation ? enrollment : null;
  }

  _persistEnrollment(enrollment) {
    if (enrollment == null || ['active', 'cancelled', 'expired'].includes(enrollment.phase)) {
      clearRecovery(this.storage);
      this.recovery = null;
      return;
    }
    writeRecovery(this.storage, {
      profile_handle: enrollment.profileHandle,
      context_handle: enrollment.contextHandle,
      enrollment_handle: enrollment.enrollmentHandle,
      request_id: enrollment.requestId,
      observed_config_revision: enrollment.observedConfigRevision,
    });
    this.recovery = readRecovery(this.storage);
  }

  _setEnrollment(generation, patch) {
    const current = this._currentEnrollment(generation);
    if (!current) return false;
    const next = { ...current, ...patch };
    this._persistEnrollment(next);
    this._set({ enrollment: next });
    return true;
  }

  async _request(path, payload, options = {}) {
    const headers = { 'content-type': 'application/json' };
    if (options.csrf === true) {
      if (!this.csrfToken) throw new ManagementClientError('csrf_missing');
      headers[CSRF_HEADER] = this.csrfToken;
    }
    let response;
    try {
      response = await this.fetchImpl(path, {
        method: 'POST',
        credentials: 'same-origin',
        headers,
        body: JSON.stringify(payload),
        ...(options.signal ? { signal: options.signal } : {}),
      });
    } catch (error) {
      throw new ManagementClientError('network_error', { unknown: options.mutation === true });
    }
    let parsed = null;
    try { parsed = await response.json(); } catch { /* handled below */ }
    if (response.status === 404) {
      throw new ManagementClientError('management_unavailable', { status: 404 });
    }
    if (!response.ok) {
      const code = safeText(parsed?.error?.code) || (response.status === 403 ? 'management_denied' : 'management_error');
      throw new ManagementClientError(code, { status: response.status });
    }
    if (parsed?.ok !== true) throw new ManagementClientError('protocol_error', { status: response.status });
    return parsed.value;
  }

  ensureStatus() {
    if (this.authPromise) return this.authPromise;
    return this.status();
  }

  async status() {
    if (this.authPromise) return this.authPromise;
    const epoch = this.authEpoch;
    this._setAuthBusy(true);
    this._set({ managementStatus: 'checking', error: '' });
    this.authPromise = this._request(`${this.sessionPath}/status`, {})
      .then((value) => {
        if (this.disposed || epoch !== this.authEpoch) return this.snapshot;
        if (normalizeUnauthenticated(value)) {
          this.csrfToken = '';
          this._set({
            managementStatus: 'unauthenticated',
            authenticated: false,
            profiles: [],
            expiresAt: null,
            selectedProfileHandle: this.recovery?.profile_handle ?? '',
            selectedEndpoint: '',
            notice: '',
          });
          return this.snapshot;
        }
        const session = normalizeSession(value);
        this._acceptSession(session);
        return this.snapshot;
      })
      .catch((error) => {
        if (this.disposed || epoch !== this.authEpoch) return this.snapshot;
        if (error?.status === 404 || error?.code === 'management_unavailable') {
          this.csrfToken = '';
          this._set({
            managementStatus: 'unconfigured',
            authenticated: false,
            profiles: [],
            expiresAt: null,
            selectedEndpoint: '',
            error: '',
            notice: messageFor('management_unavailable'),
          });
        } else if (error?.status === 401 || error?.status === 403) {
          this.csrfToken = '';
          this._set({ managementStatus: 'unauthenticated', authenticated: false, profiles: [], expiresAt: null, error: '' });
        } else {
          this._set({ managementStatus: 'error', error: managementErrorMessage(error) });
        }
        return this.snapshot;
      })
      .finally(() => {
        this.authPromise = null;
        this._setAuthBusy(false);
      });
    return this.authPromise;
  }

  _acceptSession(session) {
    this.csrfToken = session.csrfToken;
    const selected = session.profiles.some((profile) => profile.handle === this.snapshot.selectedProfileHandle)
      ? this.snapshot.selectedProfileHandle
      : session.profiles[0]?.handle ?? '';
    const profile = session.profiles.find((entry) => entry.handle === selected);
    const endpoint = profile?.endpoints.includes(this.snapshot.selectedEndpoint)
      ? this.snapshot.selectedEndpoint
      : profile?.endpoints[0] ?? '';
    this._set({
      managementStatus: 'authenticated',
      authenticated: true,
      profiles: session.profiles,
      expiresAt: session.expiresAt,
      selectedProfileHandle: selected,
      selectedEndpoint: endpoint,
      error: '',
      notice: '',
    });
    void this._restoreEnrollment();
  }

  async login(password) {
    if (this.authBusy || this.disposed) return false;
    let secret = safeText(password);
    if (!secret) {
      this._set({ managementStatus: 'unauthenticated', error: '请输入管理密码。' });
      return false;
    }
    const epoch = ++this.authEpoch;
    this._setAuthBusy(true);
    this._set({ managementStatus: 'checking', error: '', notice: '' });
    try {
      const value = await this._request(`${this.sessionPath}/login`, { password: secret });
      if (this.disposed || epoch !== this.authEpoch) return false;
      const session = normalizeSession(value);
      this._acceptSession(session);
      return true;
    } catch (error) {
      if (!this.disposed && epoch === this.authEpoch) {
        if (error?.status === 404 || error?.code === 'management_unavailable') {
          this._set({ managementStatus: 'unconfigured', authenticated: false, error: '', notice: messageFor('management_unavailable') });
        } else {
          this.csrfToken = '';
          this._set({ managementStatus: 'unauthenticated', authenticated: false, error: managementErrorMessage(error) || '管理登录失败。' });
        }
      }
      return false;
    } finally {
      secret = '';
      this._setAuthBusy(false);
    }
  }

  async logout() {
    if (this.authBusy || this.disposed || !this.snapshot.authenticated) return false;
    const epoch = ++this.authEpoch;
    this._setAuthBusy(true);
    try {
      await this._request(`${this.sessionPath}/logout`, {}, { csrf: true });
      if (this.disposed || epoch !== this.authEpoch) return false;
      this._clearSession();
      return true;
    } catch (error) {
      if (!this.disposed && epoch === this.authEpoch) {
        this.csrfToken = '';
        if (error?.status === 404) {
          this._clearSession('unconfigured');
        } else if (error?.unknown) {
          this._set({ managementStatus: 'error', authenticated: false, error: '退出结果未知，请重新检查管理会话。' });
        } else {
          this._clearSession('unauthenticated', managementErrorMessage(error));
        }
      }
      return false;
    } finally {
      this._setAuthBusy(false);
    }
  }

  _clearSession(status = 'unauthenticated', error = '') {
    this.csrfToken = '';
    this._set({
      managementStatus: status,
      authenticated: false,
      profiles: [],
      expiresAt: null,
      selectedEndpoint: '',
      error,
    });
  }

  selectProfile(handle) {
    const profile = this.snapshot.profiles.find((entry) => entry.handle === handle);
    if (!profile) return false;
    if (isEnrollmentPending(this.snapshot.enrollment)) {
      this._set({ error: '当前配对仍在进行，完成或明确取消前不能切换 profile。' });
      return false;
    }
    this._set({ selectedProfileHandle: profile.handle, selectedEndpoint: profile.endpoints[0] ?? '', error: '' });
    return true;
  }

  selectEndpoint(endpoint) {
    const profile = this._profile();
    if (!profile || !profile.endpoints.includes(endpoint)) {
      this._set({ error: 'Hub 地址必须来自管理宿主下发的 allowlist。' });
      return false;
    }
    this._set({ selectedEndpoint: endpoint, error: '' });
    return true;
  }

  async begin(endpoint = this.snapshot.selectedEndpoint) {
    if (this.enrollmentBusy || this.disposed || !this.snapshot.authenticated) return false;
    if (isEnrollmentPending(this.snapshot.enrollment)) {
      this._set({ error: '当前配对仍在进行，请完成、取消或刷新当前状态。' });
      return false;
    }
    const profile = this._profile();
    if (!profile || !profile.endpoints.includes(endpoint)) {
      this._set({ error: '请选择管理宿主允许的 DSH profile 和 Hub 地址。' });
      return false;
    }
    const generation = ++this.enrollmentGeneration;
    const enrollment = {
      generation,
      profileHandle: profile.handle,
      profileLabel: profile.label,
      endpoint,
      phase: 'beginning',
      state: 'context_ready',
      contextHandle: '',
      enrollmentHandle: '',
      requestId: '',
      observedConfigRevision: '',
      agentId: '',
      expiresAt: '',
      saveState: 'unsaved',
      activationState: 'pending',
      cleanupState: 'none',
      error: '',
    };
    this._persistEnrollment(enrollment);
    this._set({ enrollment, error: '' });
    this._setEnrollmentBusy(true);
    try {
      const value = await this._request(`${this.enrollmentPath}/begin`, {
        profile_handle: profile.handle,
        endpoint,
      }, { csrf: true, mutation: true });
      if (!this._currentEnrollment(generation)) return false;
      if (value == null || typeof value !== 'object' || !isValidString(value.context_handle) || !isValidString(value.observed_config_revision)) {
        throw new ManagementClientError('protocol_error');
      }
      this._setEnrollment(generation, {
        phase: 'context_ready',
        state: 'context_ready',
        contextHandle: value.context_handle,
        observedConfigRevision: value.observed_config_revision,
        expiresAt: safeText(value.expires_at),
        profileLabel: safeText(value.target_label) || profile.label,
        endpoint: safeText(value.endpoint) || endpoint,
        error: '',
      });
      return true;
    } catch (error) {
      if (this._currentEnrollment(generation)) {
        this._setEnrollment(generation, { phase: 'error', state: 'error', error: managementErrorMessage(error) });
      }
      return false;
    } finally {
      this._setEnrollmentBusy(false);
    }
  }

  async redeem(code) {
    const enrollment = this.snapshot.enrollment;
    if (this.enrollmentBusy || this.disposed || !enrollment || enrollment.phase !== 'context_ready') return false;
    if (enrollment.requestId) {
      this._set({ error: '当前配对请求已经提交过，不能再次消费同一个配对码；请刷新状态或取消。' });
      return false;
    }
    let secret = safeText(code).trim();
    if (!secret) {
      this._set({ error: '请输入 Hub 配对码。' });
      return false;
    }
    const generation = enrollment.generation;
    const requestId = randomRequestId();
    this._setEnrollment(generation, {
      phase: 'redeeming',
      state: 'redeem_in_progress',
      requestId,
      error: '',
    });
    this._setEnrollmentBusy(true);
    try {
      const value = await this._request(`${this.enrollmentPath}/redeem`, {
        profile_handle: enrollment.profileHandle,
        context_handle: enrollment.contextHandle,
        request_id: requestId,
        code: secret,
      }, { csrf: true, mutation: true });
      if (!this._currentEnrollment(generation)) return false;
      const safe = normalizeEnrollment(value);
      if (!isValidString(safe.enrollment_handle) || !isValidString(safe.agent_id)) throw new ManagementClientError('protocol_error');
      this._setEnrollment(generation, {
        phase: 'pending_save',
        state: 'pending_save',
        enrollmentHandle: safe.enrollment_handle,
        agentId: safe.agent_id,
        expiresAt: safe.expires_at ?? enrollment.expiresAt,
        saveState: safe.save_state ?? 'unsaved',
        activationState: safe.activation_state ?? 'pending',
        cleanupState: safe.cleanup_state ?? 'none',
        error: '',
      });
      return true;
    } catch (error) {
      if (error?.unknown && this._currentEnrollment(generation)) {
        await this._recoverUnknown(generation, enrollment.contextHandle);
      } else if (this._currentEnrollment(generation)) {
        this._setEnrollment(generation, { phase: 'error', state: 'error', error: managementErrorMessage(error) });
      }
      return false;
    } finally {
      secret = '';
      this._setEnrollmentBusy(false);
    }
  }

  async _recoverUnknown(generation, handle) {
    if (!this._currentEnrollment(generation)) return false;
    this._setEnrollment(generation, { phase: 'recovering', state: 'redeem_in_progress', error: '配对结果未知，正在用原 context_handle 查询状态；不会再次提交配对码。' });
    try {
      const value = await this._request(`${this.enrollmentPath}/status`, {
        profile_handle: this._currentEnrollment(generation).profileHandle,
        enrollment_handle: handle,
      }, { csrf: true });
      return this._applyStatus(generation, value, true);
    } catch (error) {
      if (error?.status === 403 || error?.code === 'management_denied') this._dropInaccessibleRecovery(generation);
      else if (this._currentEnrollment(generation)) this._setEnrollment(generation, {
        phase: 'unknown',
        state: 'error',
        error: '无法确认配对结果，请重试状态或取消；不会再次提交配对码。',
      });
      return false;
    }
  }

  _applyStatus(generation, value, recovering = false) {
    const current = this._currentEnrollment(generation);
    if (!current) return false;
    let safe;
    try { safe = normalizeEnrollment(value); } catch (error) {
      this._setEnrollment(generation, { phase: recovering ? 'unknown' : 'error', state: 'error', error: managementErrorMessage(error) });
      return false;
    }
    const phase = safe.state === 'context_ready' && (recovering || current.requestId)
      ? (recovering ? 'unknown' : 'context_ready')
      : safe.state === 'redeem_in_progress' ? 'recovering'
        : safe.state === 'pending_save' ? 'pending_save'
          : safe.state === 'commit_in_progress' ? 'committing'
            : safe.state;
    const next = {
      phase,
      state: safe.state,
      enrollmentHandle: safe.enrollment_handle ?? current.enrollmentHandle,
      agentId: safe.agent_id ?? current.agentId,
      expiresAt: safe.expires_at ?? current.expiresAt,
      observedConfigRevision: current.observedConfigRevision,
      saveState: safe.save_state ?? current.saveState,
      activationState: safe.activation_state ?? current.activationState,
      cleanupState: safe.cleanup_state ?? current.cleanupState,
      commitId: safe.commit_id ?? current.commitId,
      configRevision: safe.config_revision ?? current.configRevision,
      error: safe.retryable_error?.code ? messageFor(safe.retryable_error.code) : '',
    };
    if (phase === 'active') {
      next.activationState = 'active';
      next.error = '';
    }
    if (phase === 'saved' && next.activationState === 'active') next.phase = 'active';
    if (['cancelled', 'expired'].includes(phase)) {
      next.error = '';
      this._persistEnrollment(null);
    }
    this._setEnrollment(generation, next);
    if (phase === 'active') clearRecovery(this.storage);
    return true;
  }

  async refreshEnrollment() {
    const enrollment = this.snapshot.enrollment;
    if (this.enrollmentBusy || this.disposed || !enrollment) return false;
    const generation = enrollment.generation;
    const handle = enrollment.enrollmentHandle || enrollment.contextHandle;
    if (!handle) return false;
    this._setEnrollmentBusy(true);
    try {
      const value = await this._request(`${this.enrollmentPath}/status`, {
        profile_handle: enrollment.profileHandle,
        enrollment_handle: handle,
      }, { csrf: true });
      return this._applyStatus(generation, value, enrollment.phase === 'unknown');
    } catch (error) {
      if (error?.status === 403 || error?.code === 'management_denied') this._dropInaccessibleRecovery(generation);
      else if (this._currentEnrollment(generation)) this._setEnrollment(generation, { error: managementErrorMessage(error) });
      return false;
    } finally {
      this._setEnrollmentBusy(false);
    }
  }

  async commit(confirmed) {
    const enrollment = this.snapshot.enrollment;
    if (this.enrollmentBusy || this.disposed || !enrollment || enrollment.phase !== 'pending_save') return false;
    if (confirmed !== true) {
      this._set({ error: '请明确确认 Hub 返回的身份后再保存。' });
      return false;
    }
    if (!enrollment.enrollmentHandle || !enrollment.agentId || !enrollment.observedConfigRevision) {
      this._set({ error: '缺少原始配对上下文，先刷新状态。' });
      return false;
    }
    const generation = enrollment.generation;
    this._setEnrollment(generation, { phase: 'committing', state: 'commit_in_progress', error: '' });
    this._setEnrollmentBusy(true);
    try {
      const value = await this._request(`${this.enrollmentPath}/commit`, {
        profile_handle: enrollment.profileHandle,
        enrollment_handle: enrollment.enrollmentHandle,
        expected_config_revision: enrollment.observedConfigRevision,
        confirmed_agent_id: enrollment.agentId,
      }, { csrf: true, mutation: true });
      if (!this._currentEnrollment(generation)) return false;
      const safe = normalizeEnrollment(value);
      this._setEnrollment(generation, {
        phase: safe.state === 'active' ? 'active' : 'saved',
        state: safe.state,
        saveState: safe.save_state ?? 'saved',
        activationState: safe.activation_state ?? 'restart_required',
        cleanupState: safe.cleanup_state ?? enrollment.cleanupState,
        configRevision: safe.config_revision ?? enrollment.configRevision,
        commitId: safe.commit_id ?? enrollment.commitId,
        error: '',
      });
      if (safe.state === 'active') clearRecovery(this.storage);
      return true;
    } catch (error) {
      if (error?.unknown && this._currentEnrollment(generation)) {
        await this.refreshEnrollment();
      } else if (this._currentEnrollment(generation)) {
        this._setEnrollment(generation, { phase: 'error', state: 'error', error: managementErrorMessage(error) });
      }
      return false;
    } finally {
      this._setEnrollmentBusy(false);
    }
  }

  async activate() {
    const enrollment = this.snapshot.enrollment;
    if (this.enrollmentBusy || this.disposed || !enrollment || !['saved', 'active'].includes(enrollment.phase)) return false;
    if (!enrollment.enrollmentHandle) return false;
    const generation = enrollment.generation;
    this._setEnrollment(generation, { phase: 'activating', error: '' });
    this._setEnrollmentBusy(true);
    try {
      const value = await this._request(`${this.enrollmentPath}/activate`, {
        profile_handle: enrollment.profileHandle,
        enrollment_handle: enrollment.enrollmentHandle,
      }, { csrf: true, mutation: true });
      if (!this._currentEnrollment(generation)) return false;
      const safe = normalizeEnrollment(value);
      this._setEnrollment(generation, {
        phase: safe.state === 'active' ? 'active' : 'saved',
        state: safe.state,
        activationState: safe.activation_state ?? 'active',
        saveState: safe.save_state ?? enrollment.saveState,
        cleanupState: safe.cleanup_state ?? enrollment.cleanupState,
        error: '',
      });
      if (safe.state === 'active') clearRecovery(this.storage);
      return safe.state === 'active';
    } catch (error) {
      if (this._currentEnrollment(generation)) {
        this._setEnrollment(generation, {
          phase: error?.unknown ? 'saved' : 'saved',
          state: 'saved',
          activationState: 'error',
          error: managementErrorMessage(error),
        });
      }
      return false;
    } finally {
      this._setEnrollmentBusy(false);
    }
  }

  async cancel() {
    const enrollment = this.snapshot.enrollment;
    if (this.enrollmentBusy || this.disposed || !enrollment || !isEnrollmentPending(enrollment)) return false;
    const handle = enrollment.enrollmentHandle || enrollment.contextHandle;
    if (!handle) return false;
    const generation = enrollment.generation;
    this._setEnrollment(generation, { phase: 'cancelling', error: '' });
    this._setEnrollmentBusy(true);
    try {
      const value = await this._request(`${this.enrollmentPath}/cancel`, {
        profile_handle: enrollment.profileHandle,
        enrollment_handle: handle,
      }, { csrf: true, mutation: true });
      if (!this._currentEnrollment(generation)) return false;
      const safe = normalizeEnrollment(value);
      if (!['cancelled', 'expired', 'cleanup_pending', 'cleanup_conflict'].includes(safe.state)) throw new ManagementClientError('protocol_error');
      this._setEnrollment(generation, {
        phase: safe.state,
        state: safe.state,
        cleanupState: safe.cleanup_state ?? (safe.state === 'cleanup_pending' ? 'pending' : safe.state === 'cleanup_conflict' ? 'conflict' : 'complete'),
        error: safe.state === 'cleanup_pending' ? messageFor('cleanup_pending') : safe.state === 'cleanup_conflict' ? messageFor('cleanup_conflict') : '',
      });
      return ['cancelled', 'expired'].includes(safe.state);
    } catch (error) {
      if (error?.unknown) await this.refreshEnrollment();
      else if (this._currentEnrollment(generation)) this._setEnrollment(generation, {
        phase: error?.code === 'cleanup_conflict' ? 'cleanup_conflict' : 'cleanup_pending',
        state: error?.code === 'cleanup_conflict' ? 'cleanup_conflict' : 'error',
        error: managementErrorMessage(error),
      });
      return false;
    } finally {
      this._setEnrollmentBusy(false);
    }
  }

  clearCompletedEnrollment() {
    if (isEnrollmentPending(this.snapshot.enrollment)) {
      this._set({ error: '当前配对仍在进行，不能清除其恢复信息。' });
      return false;
    }
    this._persistEnrollment(null);
    this._set({ enrollment: null, error: '' });
    return true;
  }

  clearRecoveryMetadata() {
    clearRecovery(this.storage);
    this.recovery = null;
    this._set({ notice: '已清除本地恢复句柄；这不等于取消 Hub 上的 pending enrollment。', error: '' });
    return true;
  }

  async _restoreEnrollment() {
    const recovery = this.recovery ?? readRecovery(this.storage);
    if (!recovery || this.snapshot.managementStatus !== 'authenticated' || this.snapshot.enrollment) return false;
    const profile = this.snapshot.profiles.find((entry) => entry.handle === recovery.profile_handle);
    if (!profile) {
      this.clearRecoveryMetadata();
      this._set({ notice: '保存的恢复信息不属于当前管理账号，已清除本地恢复句柄。' });
      return false;
    }
    const generation = ++this.enrollmentGeneration;
    const enrollment = {
      generation,
      profileHandle: profile.handle,
      profileLabel: profile.label,
      endpoint: '',
      phase: recovery.request_id && !recovery.enrollment_handle ? 'unknown' : 'recovering',
      state: 'redeem_in_progress',
      contextHandle: recovery.context_handle ?? '',
      enrollmentHandle: recovery.enrollment_handle ?? '',
      requestId: recovery.request_id ?? '',
      observedConfigRevision: recovery.observed_config_revision ?? '',
      agentId: '',
      expiresAt: '',
      saveState: 'unsaved',
      activationState: 'pending',
      cleanupState: 'none',
      error: '正在恢复上次 enrollment 状态。',
    };
    this._set({ enrollment, selectedProfileHandle: profile.handle, selectedEndpoint: profile.endpoints[0] ?? '', error: '' });
    this._setEnrollmentBusy(true);
    try {
      const value = await this._request(`${this.enrollmentPath}/status`, {
        profile_handle: profile.handle,
        enrollment_handle: recovery.enrollment_handle || recovery.context_handle,
      }, { csrf: true });
      return this._applyStatus(generation, value, Boolean(recovery.request_id && !recovery.enrollment_handle));
    } catch (error) {
      if (error?.status === 403 || error?.code === 'management_denied') this._dropInaccessibleRecovery(generation);
      else if (this._currentEnrollment(generation)) this._setEnrollment(generation, { phase: 'unknown', state: 'error', error: '无法恢复保存的 enrollment 状态，请重试状态或清除本地恢复信息。' });
      return false;
    } finally {
      this._setEnrollmentBusy(false);
    }
  }

  _dropInaccessibleRecovery(generation) {
    clearRecovery(this.storage);
    this.recovery = null;
    if (this._currentEnrollment(generation)) this._set({
      enrollment: null,
      notice: '当前管理账号无法访问保存的 enrollment，已清除本地恢复句柄。Hub 状态未被自动取消。',
      error: '',
    });
  }

  dispose() {
    this.disposed = true;
    this.authEpoch += 1;
    this.csrfToken = '';
    this.listeners.clear();
  }
}

const controllerByOwner = new WeakMap();

export function getManagementController(owner) {
  if (owner == null || (typeof owner !== 'object' && typeof owner !== 'function')) {
    throw new TypeError('management controller owner must be an object');
  }
  let controller = controllerByOwner.get(owner);
  if (!controller || controller.disposed) {
    controller = new ManagementController();
    controllerByOwner.set(owner, controller);
  }
  return controller;
}
