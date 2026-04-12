/**
 * GitHub API Integration Module
 * Handles authentication, fetching issues, and computing interaction scores.
 */
class GitHubAPI {
  constructor(config = {}) {
    this.baseURL = 'https://api.github.com';
    this.token = config.token || '';
    this.repo = config.repo || '';
    this.perPage = config.perPage || 20;
    this.rateLimitRemaining = null;
    this.rateLimitReset = null;
  }

  get headers() {
    const h = {
      'Accept': 'application/vnd.github.v3+json',
    };
    if (this.token) {
      h['Authorization'] = `Bearer ${this.token}`;
    }
    return h;
  }

  /**
   * Make an authenticated API request with error handling
   */
  async request(endpoint, params = {}) {
    const url = new URL(`${this.baseURL}${endpoint}`);
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null) url.searchParams.set(k, v);
    });

    const response = await fetch(url.toString(), { headers: this.headers });

    // Track rate limits
    this.rateLimitRemaining = parseInt(response.headers.get('X-RateLimit-Remaining') || '0', 10);
    this.rateLimitReset = parseInt(response.headers.get('X-RateLimit-Reset') || '0', 10);

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      const error = new Error(body.message || `GitHub API error: ${response.status}`);
      error.status = response.status;
      error.rateLimitRemaining = this.rateLimitRemaining;
      throw error;
    }

    return response.json();
  }

  /**
   * Validate that the repository exists and token works
   */
  async validateRepo() {
    const data = await this.request(`/repos/${this.repo}`);
    return {
      name: data.full_name,
      description: data.description,
      openIssues: data.open_issues_count,
      stars: data.stargazers_count,
      isPrivate: data.private,
    };
  }

  /**
   * Fetch open issues sorted by interactions (comments + reactions)
   */
  async fetchIssues() {
    // Fetch issues sorted by most recently updated and by comments
    // We'll fetch more than needed and re-sort by interaction score
    const batchSize = Math.min(this.perPage * 3, 100);

    const [byComments, byUpdated] = await Promise.all([
      this.request(`/repos/${this.repo}/issues`, {
        state: 'open',
        sort: 'comments',
        direction: 'desc',
        per_page: batchSize,
      }),
      this.request(`/repos/${this.repo}/issues`, {
        state: 'open',
        sort: 'updated',
        direction: 'desc',
        per_page: batchSize,
      }),
    ]);

    // Merge and deduplicate
    const seen = new Set();
    const allIssues = [];
    for (const issue of [...byComments, ...byUpdated]) {
      // Skip pull requests (GitHub API returns them mixed with issues)
      if (issue.pull_request) continue;
      if (seen.has(issue.id)) continue;
      seen.add(issue.id);
      allIssues.push(issue);
    }

    // Compute interaction score and sort
    const scored = allIssues.map(issue => ({
      ...this.transformIssue(issue),
      score: this.computeScore(issue),
    }));

    scored.sort((a, b) => b.score - a.score);

    return scored.slice(0, this.perPage);
  }

  /**
   * Fetch repo-level stats for the header
   */
  async fetchStats() {
    const [openData, closedData] = await Promise.all([
      this.request(`/repos/${this.repo}/issues`, {
        state: 'open',
        per_page: 1,
      }),
      this.request(`/repos/${this.repo}/issues`, {
        state: 'closed',
        per_page: 1,
      }),
    ]);

    // GitHub doesn't give total counts easily, use the repo endpoint
    const repo = await this.request(`/repos/${this.repo}`);

    return {
      open: repo.open_issues_count,
      closed: null, // Would need search API for accurate count
    };
  }

  /**
   * Compute an interaction score from multiple signals
   * Higher = more "hot" / interacted with
   */
  computeScore(issue) {
    const now = Date.now();
    const created = new Date(issue.created_at).getTime();
    const updated = new Date(issue.updated_at).getTime();

    // Base signals
    const comments = issue.comments || 0;
    const reactions = issue.reactions?.total_count || 0;

    // Recency boost: issues updated recently get a multiplier
    const hoursSinceUpdate = (now - updated) / (1000 * 60 * 60);
    const recencyMultiplier = hoursSinceUpdate < 1 ? 2.0
      : hoursSinceUpdate < 6 ? 1.5
      : hoursSinceUpdate < 24 ? 1.2
      : hoursSinceUpdate < 72 ? 1.0
      : 0.8;

    // Velocity: comments relative to age
    const daysSinceCreation = Math.max(1, (now - created) / (1000 * 60 * 60 * 24));
    const velocity = comments / daysSinceCreation;

    // Weighted score
    const score = (
      (comments * 3) +
      (reactions * 5) +
      (velocity * 10)
    ) * recencyMultiplier;

    return Math.round(score * 10) / 10;
  }

  /**
   * Determine heat level (1-5) from score relative to the batch
   */
  static assignHeatLevels(issues) {
    if (issues.length === 0) return issues;

    const maxScore = issues[0].score;
    if (maxScore === 0) return issues.map(i => ({ ...i, heat: 1 }));

    return issues.map(issue => {
      const ratio = issue.score / maxScore;
      let heat;
      if (ratio >= 0.8) heat = 5;
      else if (ratio >= 0.6) heat = 4;
      else if (ratio >= 0.4) heat = 3;
      else if (ratio >= 0.2) heat = 2;
      else heat = 1;
      return { ...issue, heat };
    });
  }

  /**
   * Transform raw GitHub issue into our display format
   */
  transformIssue(issue) {
    return {
      id: issue.id,
      number: issue.number,
      title: issue.title,
      url: issue.html_url,
      state: issue.state,
      comments: issue.comments || 0,
      reactions: issue.reactions?.total_count || 0,
      reactionDetails: {
        thumbsUp: issue.reactions?.['+1'] || 0,
        thumbsDown: issue.reactions?.['-1'] || 0,
        laugh: issue.reactions?.laugh || 0,
        hooray: issue.reactions?.hooray || 0,
        confused: issue.reactions?.confused || 0,
        heart: issue.reactions?.heart || 0,
        rocket: issue.reactions?.rocket || 0,
        eyes: issue.reactions?.eyes || 0,
      },
      labels: (issue.labels || []).map(l => ({
        name: l.name,
        color: l.color,
        description: l.description,
      })),
      author: {
        login: issue.user?.login || 'unknown',
        avatar: issue.user?.avatar_url || '',
        url: issue.user?.html_url || '',
      },
      assignees: (issue.assignees || []).map(a => ({
        login: a.login,
        avatar: a.avatar_url,
      })),
      createdAt: issue.created_at,
      updatedAt: issue.updated_at,
    };
  }

  /**
   * Get rate limit info
   */
  getRateLimitInfo() {
    return {
      remaining: this.rateLimitRemaining,
      resetAt: this.rateLimitReset ? new Date(this.rateLimitReset * 1000) : null,
    };
  }
}
