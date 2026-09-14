import type { Category, Source, SourceKind } from '../types.js'

/** Spec §4.1: o peso é função do tipo, não escolhido caso a caso. */
const PESO: Record<SourceKind, number> = {
  official: 1.0,
  research: 0.9,
  news: 0.75,
  blog: 0.6,
  aggregator: 0.5,
}

function fonte(
  id: string,
  name: string,
  url: string,
  feedUrl: string,
  kind: SourceKind,
  categoryHint: Category | null,
): Source {
  return {
    id, name, url, feedUrl, kind,
    trustWeight: PESO[kind],
    categoryHint,
    active: true,
    lastFetchedAt: null,
    etag: null,
    lastModified: null,
  }
}

export const SOURCES: Source[] = [
  // ---- Oficiais: linguagens e runtimes ----
  fonte('rust-blog', 'Rust Blog', 'https://blog.rust-lang.org', 'https://blog.rust-lang.org/feed.xml', 'official', 'programming'),
  fonte('go-blog', 'The Go Blog', 'https://go.dev/blog', 'https://go.dev/blog/feed.atom', 'official', 'programming'),
  fonte('python-insider', 'Python Insider', 'https://blog.python.org', 'https://blog.python.org/feeds/posts/default', 'official', 'programming'),
  fonte('nodejs-blog', 'Node.js Blog', 'https://nodejs.org/en/blog', 'https://nodejs.org/en/feed/blog.xml', 'official', 'programming'),
  fonte('deno-blog', 'Deno Blog', 'https://deno.com/blog', 'https://deno.com/feed', 'official', 'programming'),
  fonte('react-blog', 'React Blog', 'https://react.dev/blog', 'https://react.dev/rss.xml', 'official', 'programming'),
  fonte('kubernetes-blog', 'Kubernetes Blog', 'https://kubernetes.io/blog', 'https://kubernetes.io/feed.xml', 'official', 'programming'),
  fonte('docker-blog', 'Docker Blog', 'https://www.docker.com/blog', 'https://www.docker.com/blog/feed/', 'official', 'programming'),
  fonte('gitlab-blog', 'GitLab Blog', 'https://about.gitlab.com/blog', 'https://about.gitlab.com/atom.xml', 'official', 'programming'),
  fonte('github-blog', 'GitHub Blog', 'https://github.blog', 'https://github.blog/feed/', 'official', 'programming'),

  // ---- Oficiais: plataformas e nuvem ----
  fonte('ms-devblogs', 'Microsoft DevBlogs', 'https://devblogs.microsoft.com', 'https://devblogs.microsoft.com/feed/', 'official', 'programming'),
  fonte('android-devs', 'Android Developers Blog', 'https://android-developers.googleblog.com', 'https://android-developers.googleblog.com/feeds/posts/default', 'official', 'technology'),
  fonte('apple-news', 'Apple Developer News', 'https://developer.apple.com/news/', 'https://developer.apple.com/news/rss/news.rss', 'official', 'technology'),
  fonte('aws-blog', 'AWS News Blog', 'https://aws.amazon.com/blogs/aws/', 'https://aws.amazon.com/blogs/aws/feed/', 'official', 'technology'),
  fonte('chromium-blog', 'Chromium Blog', 'https://blog.chromium.org', 'https://blog.chromium.org/feeds/posts/default', 'official', 'technology'),
  fonte('mozilla-hacks', 'Mozilla Hacks', 'https://hacks.mozilla.org', 'https://hacks.mozilla.org/feed/', 'official', 'programming'),
  fonte('cloudflare-blog', 'Cloudflare Blog', 'https://blog.cloudflare.com', 'https://blog.cloudflare.com/rss/', 'official', 'technology'),

  // ---- Blogs de engenharia ----
  fonte('netflix-tech', 'Netflix TechBlog', 'https://netflixtechblog.com', 'https://netflixtechblog.com/feed', 'blog', 'programming'),
  fonte('meta-eng', 'Engineering at Meta', 'https://engineering.fb.com', 'https://engineering.fb.com/feed/', 'blog', 'programming'),
  fonte('stackoverflow-blog', 'Stack Overflow Blog', 'https://stackoverflow.blog', 'https://stackoverflow.blog/feed/', 'blog', 'programming'),
  fonte('martinfowler', 'Martin Fowler', 'https://martinfowler.com', 'https://martinfowler.com/feed.atom', 'blog', 'programming'),

  // ---- Notícias de tecnologia ----
  fonte('arstechnica', 'Ars Technica', 'https://arstechnica.com', 'https://arstechnica.com/feed/', 'news', 'technology'),
  fonte('theverge', 'The Verge', 'https://www.theverge.com', 'https://www.theverge.com/rss/index.xml', 'news', 'technology'),
  fonte('techcrunch', 'TechCrunch', 'https://techcrunch.com', 'https://techcrunch.com/feed/', 'news', 'technology'),
  fonte('ieee-spectrum', 'IEEE Spectrum', 'https://spectrum.ieee.org', 'https://spectrum.ieee.org/rss', 'news', 'innovation'),
  fonte('phoronix', 'Phoronix', 'https://www.phoronix.com', 'https://www.phoronix.com/rss.php', 'news', 'technology'),
  fonte('tomshardware', "Tom's Hardware", 'https://www.tomshardware.com', 'https://www.tomshardware.com/feeds/all', 'news', 'technology'),
  fonte('theregister', 'The Register', 'https://www.theregister.com', 'https://www.theregister.com/headlines.atom', 'news', 'technology'),
  fonte('bleepingcomputer', 'BleepingComputer', 'https://www.bleepingcomputer.com', 'https://www.bleepingcomputer.com/feed/', 'news', 'technology'),
  fonte('krebs', 'Krebs on Security', 'https://krebsonsecurity.com', 'https://krebsonsecurity.com/feed/', 'news', 'technology'),
  fonte('hackernews-sec', 'The Hacker News', 'https://thehackernews.com', 'https://feeds.feedburner.com/TheHackersNews', 'news', 'technology'),

  // ---- Agregadores ----
  fonte('hn-frontpage', 'Hacker News', 'https://news.ycombinator.com', 'https://hnrss.org/frontpage', 'aggregator', null),
  fonte('lobsters', 'Lobsters', 'https://lobste.rs', 'https://lobste.rs/rss', 'aggregator', 'programming'),
  fonte('devto', 'DEV Community', 'https://dev.to', 'https://dev.to/feed', 'aggregator', 'programming'),

  // ---- Pesquisa ----
  fonte('arxiv-ai', 'arXiv cs.AI', 'https://arxiv.org/list/cs.AI/recent', 'https://rss.arxiv.org/rss/cs.AI', 'research', 'innovation'),
  fonte('arxiv-lg', 'arXiv cs.LG', 'https://arxiv.org/list/cs.LG/recent', 'https://rss.arxiv.org/rss/cs.LG', 'research', 'innovation'),
  fonte('arxiv-se', 'arXiv cs.SE', 'https://arxiv.org/list/cs.SE/recent', 'https://rss.arxiv.org/rss/cs.SE', 'research', 'programming'),
]
