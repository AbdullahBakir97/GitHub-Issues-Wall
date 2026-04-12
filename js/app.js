/**
 * GitHub Issues Wall Display - Main Application
 */
(function () {
  'use strict';

  // ===== State =====
  let api = null;
  let updateManager = null;
  let config = loadConfig();

  // ===== DOM References =====
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  const dom = {
    setupModal: $('#setup-modal'),
    app: $('#app'),
    setupForm: $('#setup-form'),
    repoInput: $('#repo-input'),
    tokenInput: $('#token-input'),
    refreshInput: $('#refresh-input'),
    countInput: $('#count-input'),
    connectBtn: $('#connect-btn'),
    toggleToken: $('#toggle-token'),
    tokenHelp: $('#token-help'),
    tokenHelpLink: $('#token-help-link'),
    closeTokenHelp: $('#close-token-help'),
    headerOwner: $('#header-owner'),
    headerName: $('#header-name'),
    statOpen: $('#stat-open'),
    statClosed: $('#stat-closed'),
    statHot: $('#stat-hot'),
    connectionStatus: $('#connection-status'),
    lastUpdated: $('#last-updated'),
    themeToggle: $('#theme-toggle'),
    settingsBtn: $('#settings-btn'),
    loadingState: $('#loading-state'),
    errorState: $('#error-state'),
    errorMessage: $('#error-message'),
    retryBtn: $('#retry-btn'),
    issuesGrid: $('#issues-grid'),
    refreshProgress: $('#refresh-progress'),
    footerRepo: $('#footer-repo'),
    footerCount: $('#footer-count'),
    countdown: $('#countdown'),
  };

  // ===== Config Persistence =====
  function loadConfig() {
    try {
      return JSON.parse(localStorage.getItem('ghwall-config') || '{}');
    } catch {
      return {};
    }
  }

  function saveConfig(cfg) {
    config = { ...config, ...cfg };
    localStorage.setItem('ghwall-config', JSON.stringify(config));
  }

  // ===== Theme =====
  function initTheme() {
    const saved = localStorage.getItem('ghwall-theme');
    if (saved) {
      document.documentElement.setAttribute('data-theme', saved);
    } else if (window.matchMedia('(prefers-color-scheme: light)').matches) {
      document.documentElement.setAttribute('data-theme', 'light');
    }
  }

  function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('ghwall-theme', next);
  }

  // ===== Setup Form =====
  function initSetupForm() {
    // Pre-fill from saved config
    if (config.repo) dom.repoInput.value = config.repo;
    if (config.token) dom.tokenInput.value = config.token;
    if (config.refreshInterval) dom.refreshInput.value = config.refreshInterval;
    if (config.issueCount) dom.countInput.value = config.issueCount;

    // Auto-launch if we have a saved repo
    if (config.repo) {
      launchDisplay();
    }
  }

  function showSetupLoading(show) {
    const btnText = dom.connectBtn.querySelector('.btn-text');
    const btnLoading = dom.connectBtn.querySelector('.btn-loading');
    btnText.hidden = show;
    btnLoading.hidden = !show;
    dom.connectBtn.disabled = show;
  }

  async function handleSetup(e) {
    e.preventDefault();

    const repo = dom.repoInput.value.trim();
    const token = dom.tokenInput.value.trim();
    const refreshInterval = dom.refreshInput.value;
    const issueCount = dom.countInput.value;

    if (!repo || !repo.includes('/')) {
      dom.repoInput.setCustomValidity('Enter as owner/repo (e.g. facebook/react)');
      dom.repoInput.reportValidity();
      return;
    }
    dom.repoInput.setCustomValidity('');

    showSetupLoading(true);

    try {
      // Validate the repo
      api = new GitHubAPI({ repo, token, perPage: parseInt(issueCount) });
      await api.validateRepo();

      // Save config
      saveConfig({ repo, token, refreshInterval, issueCount });

      // Launch
      launchDisplay();
    } catch (error) {
      showSetupLoading(false);
      if (error.status === 404) {
        dom.repoInput.setCustomValidity('Repository not found. Check the owner/repo path.');
      } else if (error.status === 401) {
        dom.tokenInput.setCustomValidity('Invalid token. Check your Personal Access Token.');
        dom.tokenInput.reportValidity();
        return;
      } else if (error.status === 403) {
        dom.repoInput.setCustomValidity('Access denied. The repo may be private — add a token.');
      } else {
        dom.repoInput.setCustomValidity(`Error: ${error.message}`);
      }
      dom.repoInput.reportValidity();
    }
  }

  // ===== Main Display =====
  function launchDisplay() {
    const { repo, token, refreshInterval, issueCount } = config;

    // Init API
    if (!api) {
      api = new GitHubAPI({
        repo,
        token,
        perPage: parseInt(issueCount) || 20,
      });
    }

    // Update header
    const [owner, name] = repo.split('/');
    dom.headerOwner.textContent = owner;
    dom.headerName.textContent = name;
    dom.footerRepo.textContent = repo;

    // Show app, hide modal
    dom.setupModal.hidden = true;
    dom.app.hidden = false;

    // Initial fetch
    fetchAndRender();

    // Start update manager
    updateManager = new UpdateManager({
      intervalSeconds: parseInt(refreshInterval) || 300,
      onUpdate: fetchAndRender,
      onCountdown: updateCountdown,
      onStatusChange: updateConnectionStatus,
    });
    updateManager.start();
  }

  async function fetchAndRender() {
    try {
      showLoading(true);

      const [issues, stats] = await Promise.all([
        api.fetchIssues(),
        api.fetchStats().catch(() => null),
      ]);

      const heated = GitHubAPI.assignHeatLevels(issues);
      renderIssues(heated);
      renderStats(stats, heated);

      dom.footerCount.textContent = `${heated.length} issues`;
      dom.lastUpdated.textContent = `Updated ${formatTime(new Date())}`;

      showLoading(false);
    } catch (error) {
      showError(error.message);
      throw error; // Re-throw for UpdateManager error handling
    }
  }

  // ===== Rendering =====
  function renderIssues(issues) {
    dom.issuesGrid.innerHTML = issues.map((issue, i) => `
      <article class="issue-card heat-${issue.heat}" style="animation-delay: ${Math.min(i * 30, 300)}ms">
        <div class="interaction-score ${issue.heat >= 4 ? 'high' : ''}">
          ${fireIcon()}
          ${issue.score}
        </div>
        <div class="issue-header">
          <span class="issue-number">#${issue.number}</span>
          <h3 class="issue-title">
            <a href="${escapeHtml(issue.url)}" target="_blank" rel="noopener">${escapeHtml(issue.title)}</a>
          </h3>
        </div>
        <div class="issue-metrics">
          <span class="metric ${issue.comments >= 10 ? 'hot' : ''}">
            ${commentIcon()} ${issue.comments}
          </span>
          <span class="metric ${issue.reactions >= 10 ? 'hot' : ''}">
            ${reactionIcon()} ${issue.reactions}
          </span>
          ${issue.assignees.length > 0 ? `
            <span class="metric">
              ${personIcon()} ${issue.assignees.map(a => a.login).join(', ')}
            </span>
          ` : ''}
          <span class="metric">
            ${clockIcon()} ${timeAgo(issue.updatedAt)}
          </span>
        </div>
        ${issue.labels.length > 0 ? `
          <div class="issue-labels">
            ${issue.labels.map(l => `
              <span class="label" style="${labelStyle(l.color)}">${escapeHtml(l.name)}</span>
            `).join('')}
          </div>
        ` : ''}
        <div class="issue-footer">
          <div class="issue-author">
            <img class="author-avatar" src="${escapeHtml(issue.author.avatar)}&s=36" alt="" loading="lazy" width="18" height="18">
            ${escapeHtml(issue.author.login)}
          </div>
          <span class="issue-age">opened ${timeAgo(issue.createdAt)}</span>
        </div>
      </article>
    `).join('');
  }

  function renderStats(stats, issues) {
    if (stats) {
      dom.statOpen.textContent = formatNumber(stats.open);
      dom.statClosed.textContent = stats.closed != null ? formatNumber(stats.closed) : '—';
    }
    const hotCount = issues.filter(i => i.heat >= 4).length;
    dom.statHot.textContent = hotCount;
  }

  // ===== UI State =====
  function showLoading(show) {
    dom.loadingState.hidden = !show || dom.issuesGrid.children.length > 0;
    dom.errorState.hidden = true;
  }

  function showError(message) {
    dom.loadingState.hidden = true;
    if (dom.issuesGrid.children.length === 0) {
      dom.errorState.hidden = false;
      dom.errorMessage.textContent = message;
    }
  }

  function updateCountdown({ remaining, progress, text }) {
    dom.countdown.textContent = text;
    dom.refreshProgress.style.transform = `scaleX(${progress})`;
  }

  function updateConnectionStatus(status) {
    const el = dom.connectionStatus;
    el.className = 'connection-status';

    switch (status) {
      case 'connected':
        el.classList.remove('error', 'warning');
        el.querySelector('.status-text').textContent = 'Connected';
        break;
      case 'loading':
        el.querySelector('.status-text').textContent = 'Refreshing...';
        break;
      case 'error':
        el.classList.add('error');
        el.querySelector('.status-text').textContent = 'Disconnected';
        break;
      case 'warning':
        el.classList.add('warning');
        el.querySelector('.status-text').textContent = 'Retrying...';
        break;
      case 'rate-limited':
        el.classList.add('warning');
        el.querySelector('.status-text').textContent = 'Rate limited';
        break;
    }
  }

  // ===== Helpers =====
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }

  function labelStyle(hexColor) {
    if (!hexColor) return '';
    const r = parseInt(hexColor.substring(0, 2), 16);
    const g = parseInt(hexColor.substring(2, 4), 16);
    const b = parseInt(hexColor.substring(4, 6), 16);
    // Determine if text should be light or dark
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    const textColor = luminance > 0.5 ? '#1f2328' : '#ffffff';
    return `background: #${hexColor}22; color: #${hexColor}; border: 1px solid #${hexColor}44;`;
  }

  function timeAgo(dateStr) {
    const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
    if (seconds < 2592000) return `${Math.floor(seconds / 604800)}w ago`;
    return `${Math.floor(seconds / 2592000)}mo ago`;
  }

  function formatTime(date) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function formatNumber(n) {
    if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
    return n.toString();
  }

  // ===== SVG Icons =====
  function fireIcon() {
    return '<svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor"><path d="M7.998.002C5.026.002 4.15 2.89 4.15 2.89S3.298.782 1.666 1.472C.036 2.163.754 4.464.754 4.464S-.15 3.54.032 5.268c.18 1.728 1.806 2.97 1.806 2.97S.624 9.39.624 10.626c0 1.236.876 2.776 2.482 3.738 1.606.964 3.254 1.136 4.892 1.136s3.286-.172 4.892-1.136c1.606-.962 2.482-2.502 2.482-3.738 0-1.236-1.214-2.388-1.214-2.388s1.626-1.242 1.806-2.97c.182-1.728-.722-.804-.722-.804s.718-2.3-.912-2.992c-1.632-.69-2.484 1.418-2.484 1.418S10.97.002 7.998.002z"/></svg>';
  }

  function commentIcon() {
    return '<svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor"><path d="M1 2.75C1 1.784 1.784 1 2.75 1h10.5c.966 0 1.75.784 1.75 1.75v7.5A1.75 1.75 0 0113.25 12H9.06l-2.573 2.573A1.458 1.458 0 014 13.543V12H2.75A1.75 1.75 0 011 10.25zm1.75-.25a.25.25 0 00-.25.25v7.5c0 .138.112.25.25.25h2a.75.75 0 01.75.75v2.19l2.72-2.72a.749.749 0 01.53-.22h4.5a.25.25 0 00.25-.25v-7.5a.25.25 0 00-.25-.25z"/></svg>';
  }

  function reactionIcon() {
    return '<svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor"><path d="M8 0a8 8 0 110 16A8 8 0 018 0zM1.5 8a6.5 6.5 0 1013 0 6.5 6.5 0 00-13 0zm3.82 1.636a.75.75 0 011.038.175l.007.009c.103.118.22.222.35.31.264.178.683.37 1.285.37.602 0 1.02-.192 1.285-.371.13-.088.247-.192.35-.31l.007-.008a.75.75 0 011.222.87l-.614-.431c.614.43.614.431.613.431v.001l-.001.002-.002.003-.005.007-.014.019a2.066 2.066 0 01-.184.213 3.06 3.06 0 01-.534.39A3.986 3.986 0 018 11.5a3.986 3.986 0 01-1.819-.476 3.065 3.065 0 01-.534-.39 2.069 2.069 0 01-.184-.212l-.014-.02-.005-.006-.002-.003v-.002h-.001l.613-.432-.614.43a.75.75 0 01.183-1.044zM6 7a1 1 0 11-2 0 1 1 0 012 0zm4 1a1 1 0 100-2 1 1 0 000 2z"/></svg>';
  }

  function personIcon() {
    return '<svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor"><path d="M10.561 8.073a6.005 6.005 0 013.432 5.142.75.75 0 11-1.498.07 4.5 4.5 0 00-8.99 0 .75.75 0 01-1.498-.07 6.004 6.004 0 013.431-5.142 3.999 3.999 0 115.123 0zM10.5 5a2.5 2.5 0 10-5 0 2.5 2.5 0 005 0z"/></svg>';
  }

  function clockIcon() {
    return '<svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor"><path d="M8 0a8 8 0 110 16A8 8 0 018 0zm0 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zm.25 2.25a.75.75 0 01.75.75v3.69l2.28 2.28a.751.751 0 01-1.042 1.082l-.018-.018-2.5-2.5a.75.75 0 01-.22-.53V4.5a.75.75 0 01.75-.75z"/></svg>';
  }

  // ===== Event Listeners =====
  function bindEvents() {
    // Setup form
    dom.setupForm.addEventListener('submit', handleSetup);

    // Token visibility toggle
    dom.toggleToken.addEventListener('click', () => {
      const input = dom.tokenInput;
      input.type = input.type === 'password' ? 'text' : 'password';
    });

    // Token help
    dom.tokenHelpLink.addEventListener('click', (e) => {
      e.preventDefault();
      dom.tokenHelp.hidden = !dom.tokenHelp.hidden;
    });
    dom.closeTokenHelp.addEventListener('click', () => {
      dom.tokenHelp.hidden = true;
    });

    // Theme toggle
    dom.themeToggle.addEventListener('click', toggleTheme);

    // Settings (back to setup)
    dom.settingsBtn.addEventListener('click', () => {
      if (updateManager) updateManager.stop();
      dom.app.hidden = true;
      dom.setupModal.hidden = false;
      showSetupLoading(false);
    });

    // Retry
    dom.retryBtn.addEventListener('click', () => {
      if (updateManager) {
        updateManager.refreshNow();
      } else {
        fetchAndRender();
      }
    });

    // Clear validation on input
    dom.repoInput.addEventListener('input', () => {
      dom.repoInput.setCustomValidity('');
    });
    dom.tokenInput.addEventListener('input', () => {
      dom.tokenInput.setCustomValidity('');
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      // R to refresh
      if (e.key === 'r' && !e.ctrlKey && !e.metaKey && !isInputFocused()) {
        if (updateManager) updateManager.refreshNow();
      }
      // T to toggle theme
      if (e.key === 't' && !e.ctrlKey && !e.metaKey && !isInputFocused()) {
        toggleTheme();
      }
      // Escape to go back to settings
      if (e.key === 'Escape' && !dom.app.hidden) {
        dom.settingsBtn.click();
      }
    });
  }

  function isInputFocused() {
    const tag = document.activeElement?.tagName;
    return tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA';
  }

  // ===== Init =====
  function init() {
    initTheme();
    bindEvents();
    initSetupForm();
  }

  // Boot
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
