/**
 * Real-Time Update Manager
 * Handles polling, countdown display, and connection state.
 */
class UpdateManager {
  constructor({ intervalSeconds, onUpdate, onCountdown, onStatusChange }) {
    this.interval = intervalSeconds * 1000;
    this.onUpdate = onUpdate;
    this.onCountdown = onCountdown;
    this.onStatusChange = onStatusChange;
    this.timerId = null;
    this.countdownId = null;
    this.nextUpdateAt = 0;
    this.isRunning = false;
    this.consecutiveErrors = 0;
    this.maxRetries = 3;
  }

  /**
   * Start the polling cycle
   */
  start() {
    this.isRunning = true;
    this.scheduleNext();
    this.startCountdown();
  }

  /**
   * Stop all updates
   */
  stop() {
    this.isRunning = false;
    clearTimeout(this.timerId);
    cancelAnimationFrame(this.countdownId);
    this.timerId = null;
    this.countdownId = null;
  }

  /**
   * Change the refresh interval
   */
  setInterval(seconds) {
    this.interval = seconds * 1000;
    if (this.isRunning) {
      this.stop();
      this.start();
    }
  }

  /**
   * Trigger an immediate refresh
   */
  async refreshNow() {
    clearTimeout(this.timerId);
    await this.executeUpdate();
    if (this.isRunning) {
      this.scheduleNext();
    }
  }

  /**
   * Schedule the next update
   */
  scheduleNext() {
    this.nextUpdateAt = Date.now() + this.interval;
    this.timerId = setTimeout(() => this.executeUpdate().then(() => {
      if (this.isRunning) this.scheduleNext();
    }), this.interval);
  }

  /**
   * Execute the update callback with error handling
   */
  async executeUpdate() {
    try {
      this.onStatusChange?.('loading');
      await this.onUpdate();
      this.consecutiveErrors = 0;
      this.onStatusChange?.('connected');
    } catch (error) {
      this.consecutiveErrors++;
      console.error(`Update failed (attempt ${this.consecutiveErrors}):`, error);

      if (error.status === 403 && error.rateLimitRemaining === 0) {
        this.onStatusChange?.('rate-limited');
      } else if (this.consecutiveErrors >= this.maxRetries) {
        this.onStatusChange?.('error');
      } else {
        this.onStatusChange?.('warning');
      }
    }
  }

  /**
   * Animate the countdown bar and text
   */
  startCountdown() {
    const tick = () => {
      if (!this.isRunning) return;

      const now = Date.now();
      const remaining = Math.max(0, this.nextUpdateAt - now);
      const progress = 1 - (remaining / this.interval);

      this.onCountdown?.({
        remaining,
        progress,
        text: this.formatCountdown(remaining),
      });

      this.countdownId = requestAnimationFrame(tick);
    };
    tick();
  }

  /**
   * Format milliseconds into human-readable countdown
   */
  formatCountdown(ms) {
    const totalSeconds = Math.ceil(ms / 1000);
    if (totalSeconds <= 0) return 'now';
    if (totalSeconds < 60) return `${totalSeconds}s`;
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}m ${seconds.toString().padStart(2, '0')}s`;
  }
}
