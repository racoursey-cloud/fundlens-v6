/**
 * FundLens v6 — RSS Feed Fetcher
 *
 * Fetches and caches headlines from five news sources. These headlines
 * feed into the macro thesis (Claude Sonnet) which drives the Positioning
 * factor (25% of composite score).
 *
 * Feeds (from Master Reference §6):
 *   1. Google News Business — aggregated finance/business headlines
 *   2. CNBC Economy — US economic conditions, Fed, labor, inflation
 *   3. CNBC World — geopolitical events, trade policy, intl markets
 *   4. Google News World — global/geopolitical headlines
 *   5. Federal Reserve — direct monetary policy press releases
 *
 * Cache: In-memory, refreshed every 120 minutes. The pipeline reads
 * cached headlines — it never fetches RSS during a scoring run.
 * A separate cron job refreshes the cache on its own schedule.
 *
 * Session 4 deliverable. References: Master Reference §6, §8 step 10.
 */

import RssParser from 'rss-parser';
import { RSS_FEEDS, RSS_CACHE_MINUTES, RSS_HEADLINES_PER_FEED } from './constants.js';

// ─── Types ──────────────────────────────────────────────────────────────────

/** A single parsed news headline */
export interface NewsHeadline {
  /** Feed source name (e.g. "CNBC Economy") */
  source: string;
  /** Headline text */
  title: string;
  /** Article URL */
  link: string;
  /** Publication date (ISO string) */
  publishedAt: string;
  /** Brief description/snippet if available */
  snippet: string | null;
}

/** Cached feed result */
interface FeedCache {
  headlines: NewsHeadline[];
  fetchedAt: number; // Unix timestamp
}

// ─── Module-Level Cache ─────────────────────────────────────────────────────

const feedCache = new Map<string, FeedCache>();
const parser = new RssParser();

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Get all cached headlines across all feeds.
 * Returns up to RSS_HEADLINES_PER_FEED (20) headlines per feed,
 * totaling 75–100 headlines.
 *
 * If the cache is stale or empty, triggers a refresh first.
 */
export async function getHeadlines(): Promise<NewsHeadline[]> {
  const now = Date.now();
  const maxAgeMs = RSS_CACHE_MINUTES * 60 * 1000;

  // Check if any feed needs refreshing
  let needsRefresh = false;
  for (const feed of RSS_FEEDS) {
    const cached = feedCache.get(feed.name);
    if (!cached || (now - cached.fetchedAt) > maxAgeMs) {
      needsRefresh = true;
      break;
    }
  }

  if (needsRefresh) {
    await refreshAllFeeds();
  }

  // Collect headlines from all feeds
  const allHeadlines: NewsHeadline[] = [];
  for (const feed of RSS_FEEDS) {
    const cached = feedCache.get(feed.name);
    if (cached) {
      allHeadlines.push(...cached.headlines);
    }
  }

  // Sort by publication date descending (newest first)
  allHeadlines.sort(
    (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
  );

  return allHeadlines;
}

/**
 * Force-refresh all RSS feeds. Called by the cron job and on first access.
 * Fetches all feeds sequentially (not in parallel — be polite to news servers).
 */
export async function refreshAllFeeds(): Promise<{
  success: number;
  failed: number;
  totalHeadlines: number;
}> {
  let success = 0;
  let failed = 0;
  let totalHeadlines = 0;

  console.log(`[rss] Refreshing ${RSS_FEEDS.length} feeds...`);

  for (const feed of RSS_FEEDS) {
    try {
      const headlines = await fetchFeed(feed.name, feed.url);
      feedCache.set(feed.name, {
        headlines,
        fetchedAt: Date.now(),
      });
      success++;
      totalHeadlines += headlines.length;
      console.log(`[rss] ${feed.name}: ${headlines.length} headlines`);
    } catch (err) {
      failed++;
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[rss] ${feed.name} FAILED: ${message}`);
      // Don't clear existing cache on failure — stale data is better than none
    }
  }

  console.log(
    `[rss] Refresh complete: ${success} feeds OK, ${failed} failed, ${totalHeadlines} total headlines`
  );

  return { success, failed, totalHeadlines };
}

/**
 * Get the age of the oldest cache entry in minutes.
 * Returns Infinity if cache is empty.
 */
export function getCacheAgeMinutes(): number {
  let oldestAge = 0;
  const now = Date.now();

  for (const feed of RSS_FEEDS) {
    const cached = feedCache.get(feed.name);
    if (!cached) return Infinity;
    const ageMs = now - cached.fetchedAt;
    oldestAge = Math.max(oldestAge, ageMs);
  }

  return feedCache.size === 0 ? Infinity : oldestAge / (60 * 1000);
}

/**
 * Format headlines for Claude's thesis prompt.
 * Groups by source and formats as a compact text block.
 */
export function formatHeadlinesForPrompt(headlines: NewsHeadline[]): string {
  const bySource = new Map<string, NewsHeadline[]>();

  for (const h of headlines) {
    const existing = bySource.get(h.source) || [];
    existing.push(h);
    bySource.set(h.source, existing);
  }

  const sections: string[] = [];

  for (const [source, items] of bySource) {
    const headlineList = items
      .slice(0, RSS_HEADLINES_PER_FEED)
      .map(h => {
        const date = new Date(h.publishedAt).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
        });
        return `- [${date}] ${h.title}`;
      })
      .join('\n');

    sections.push(`### ${source}\n${headlineList}`);
  }

  return sections.join('\n\n');
}

// ─── Internal ───────────────────────────────────────────────────────────────

/**
 * Fetch and parse a single RSS feed.
 * Returns up to RSS_HEADLINES_PER_FEED headlines.
 */
async function fetchFeed(
  sourceName: string,
  url: string
): Promise<NewsHeadline[]> {
  const feed = await parser.parseURL(url);
  const headlines: NewsHeadline[] = [];

  for (const item of feed.items.slice(0, RSS_HEADLINES_PER_FEED)) {
    headlines.push({
      source: sourceName,
      title: cleanText(item.title || ''),
      link: item.link || '',
      publishedAt: item.isoDate || item.pubDate || new Date().toISOString(),
      snippet: cleanText(item.contentSnippet || item.content || '') || null,
    });
  }

  return headlines;
}

/** Strip HTML tags and excess whitespace from RSS text. */
function cleanText(text: string): string {
  return text
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/** Clear the in-memory cache (for testing). */
export function clearCache(): void {
  feedCache.clear();
}
