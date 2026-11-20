import { env } from '../config/env';
import { logger } from '../lib/logger';

/**
 * Learning-resource discovery.
 *
 * The hard rule for this feature: no invented URLs. A language model will
 * happily produce `https://docs.example.com/guide` that 404s, and a beginner
 * has no way to tell. So resources come from one of two places only:
 *
 *   1. A real search API (Tavily) when `SEARCH_API_KEY` is configured. Results
 *      carry the URL the provider actually returned.
 *   2. A curated catalogue of well-known, long-lived documentation roots, which
 *      are marked `verified: false` because this deployment did not check them.
 *
 * When neither applies the list is empty and the client says so. It never
 * falls back to asking the model for links.
 */

export type LearningResource = {
  title: string;
  platform: string;
  url: string;
  /** Only set when the source stated it. */
  free: boolean | null;
  difficulty: 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED' | 'ALL';
  description: string;
  whyUseful: string;
  /**
   * True only when the URL came from a live search or the curated list was
   * checked by this deployment. The UI shows a badge either way.
   */
  verified: boolean;
};

export type ResourceResult = {
  resources: LearningResource[];
  /** How the list was produced, so the UI can label it honestly. */
  source: 'search_api' | 'curated' | 'none';
  notice: string | null;
};

/**
 * Documentation roots that have been stable for years. These are safe to show
 * as starting points, but they are still labelled unverified because nothing
 * in this deployment fetched them.
 */
const CURATED: Record<string, LearningResource[]> = {
  python: [
    {
      title: 'The Python Tutorial',
      platform: 'Python Software Foundation',
      url: 'https://docs.python.org/3/tutorial/',
      free: true,
      difficulty: 'BEGINNER',
      description: 'The official tutorial that ships with the language documentation.',
      whyUseful: 'Written by the people who maintain Python, so it matches the current release.',
      verified: false,
    },
    {
      title: 'Python on Exercism',
      platform: 'Exercism',
      url: 'https://exercism.org/tracks/python',
      free: true,
      difficulty: 'BEGINNER',
      description: 'Small practice exercises with optional mentor feedback.',
      whyUseful: 'You write code and get it reviewed instead of only reading.',
      verified: false,
    },
  ],
  javascript: [
    {
      title: 'JavaScript Guide',
      platform: 'MDN Web Docs',
      url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide',
      free: true,
      difficulty: 'BEGINNER',
      description: 'The reference guide maintained by Mozilla.',
      whyUseful: 'Accurate, example-heavy and kept current with the language.',
      verified: false,
    },
  ],
  react: [
    {
      title: 'Learn React',
      platform: 'React documentation',
      url: 'https://react.dev/learn',
      free: true,
      difficulty: 'BEGINNER',
      description: 'The official interactive React tutorial.',
      whyUseful: 'Teaches the current function-component and hooks model directly.',
      verified: false,
    },
  ],
  java: [
    {
      title: 'Java Tutorials',
      platform: 'Oracle',
      url: 'https://dev.java/learn/',
      free: true,
      difficulty: 'BEGINNER',
      description: 'The official Java learning path.',
      whyUseful: 'Covers language basics through to modern features in order.',
      verified: false,
    },
  ],
  sql: [
    {
      title: 'SQLBolt',
      platform: 'SQLBolt',
      url: 'https://sqlbolt.com/',
      free: true,
      difficulty: 'BEGINNER',
      description: 'Interactive SQL lessons that run in the browser.',
      whyUseful: 'You practise queries immediately rather than reading syntax tables.',
      verified: false,
    },
  ],
  git: [
    {
      title: 'Pro Git',
      platform: 'Git SCM',
      url: 'https://git-scm.com/book/en/v2',
      free: true,
      difficulty: 'BEGINNER',
      description: 'The official free book on Git.',
      whyUseful: 'Explains the model behind the commands, not just the commands.',
      verified: false,
    },
  ],
};

/** Normalises a skill label to a catalogue key: "Python 3" -> "python". */
function catalogueKey(skill: string): string {
  return skill.toLowerCase().replace(/[^a-z0-9+# ]/g, '').trim().split(/\s+/)[0] ?? '';
}

function curatedFor(skill: string): LearningResource[] {
  const key = catalogueKey(skill);
  return CURATED[key] ?? [];
}

type TavilyResult = { title?: string; url?: string; content?: string; score?: number };

/**
 * Queries Tavily for current resources. Any failure degrades to the curated
 * list rather than surfacing a provider error to the member.
 */
async function searchResources(skill: string): Promise<LearningResource[] | null> {
  if (!env.searchApiKey) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);

  try {
    const response = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.searchApiKey}`,
      },
      body: JSON.stringify({
        query: `${skill} official documentation tutorial for beginners free course`,
        search_depth: 'basic',
        max_results: 8,
        include_domains: [
          'docs.python.org', 'developer.mozilla.org', 'react.dev', 'dev.java',
          'git-scm.com', 'learn.microsoft.com', 'docs.aws.amazon.com',
          'cloud.google.com', 'kubernetes.io', 'nodejs.org', 'w3schools.com',
          'exercism.org', 'freecodecamp.org', 'kaggle.com', 'github.com',
          'youtube.com', 'roadmap.sh', 'sqlbolt.com', 'tensorflow.org',
          'pytorch.org', 'scikit-learn.org', 'figma.com',
        ],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      logger.warn('resources.search_failed', { status: response.status });
      return null;
    }

    const payload = (await response.json()) as { results?: TavilyResult[] };
    const results = (payload.results ?? []).filter(
      (r): r is TavilyResult & { url: string } => typeof r.url === 'string' && r.url.startsWith('http'),
    );

    if (!results.length) return null;

    return results.map((r) => {
      let host = '';
      try {
        host = new URL(r.url).hostname.replace(/^www\./, '');
      } catch {
        host = 'Web';
      }
      return {
        title: (r.title ?? host).slice(0, 160),
        platform: host,
        url: r.url,
        // The provider does not state pricing reliably, so this stays unknown.
        free: null,
        difficulty: 'ALL' as const,
        description: (r.content ?? '').replace(/\s+/g, ' ').slice(0, 240) || 'Result from a live web search.',
        whyUseful: `Found by a live search for “${skill}” resources.`,
        verified: true,
      };
    });
  } catch (err) {
    logger.warn('resources.search_error', { err });
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Resolves resources for a skill. `search_api` results are verified; a curated
 * fallback is returned with `verified: false` and a notice that says so.
 */
export async function findResources(skill: string): Promise<ResourceResult> {
  const searched = await searchResources(skill);
  if (searched) {
    return { resources: searched, source: 'search_api', notice: null };
  }

  const curated = curatedFor(skill);
  if (curated.length) {
    return {
      resources: curated,
      source: 'curated',
      notice:
        'Live web search is not configured on this deployment, so these are well-known starting points that have not been checked for you. Verify each link before relying on it.',
    };
  }

  return {
    resources: [],
    source: 'none',
    notice:
      'No verified resources are available for this skill right now. Live web search is not configured, so no links are shown rather than guessed ones.',
  };
}
