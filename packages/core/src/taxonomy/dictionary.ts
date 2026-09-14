import type { Category, TagKind } from '../types.js'

export interface TagDef {
  slug: string
  name: string
  kind: TagKind
  category: Category
  /** Termos em minúsculas, sem acento — casam com a saída de tokenize(). */
  terms: string[]
}

export const TAG_DICTIONARY: TagDef[] = [
  // ---- Linguagens (programming) ----
  { slug: 'python', name: 'Python', kind: 'language', category: 'programming', terms: ['python', 'cpython', 'pypi'] },
  { slug: 'javascript', name: 'JavaScript', kind: 'language', category: 'programming', terms: ['javascript', 'ecmascript'] },
  { slug: 'typescript', name: 'TypeScript', kind: 'language', category: 'programming', terms: ['typescript'] },
  { slug: 'rust', name: 'Rust', kind: 'language', category: 'programming', terms: ['rust', 'rustc', 'cargo', 'crates'] },
  { slug: 'go', name: 'Go', kind: 'language', category: 'programming', terms: ['golang'] },
  { slug: 'java', name: 'Java', kind: 'language', category: 'programming', terms: ['java', 'jvm', 'jdk', 'openjdk'] },
  { slug: 'kotlin', name: 'Kotlin', kind: 'language', category: 'programming', terms: ['kotlin'] },
  { slug: 'swift', name: 'Swift', kind: 'language', category: 'programming', terms: ['swift', 'swiftui'] },
  { slug: 'cpp', name: 'C++', kind: 'language', category: 'programming', terms: ['cpp'] },
  { slug: 'csharp', name: 'C#', kind: 'language', category: 'programming', terms: ['csharp', 'dotnet'] },
  { slug: 'php', name: 'PHP', kind: 'language', category: 'programming', terms: ['php'] },
  { slug: 'ruby', name: 'Ruby', kind: 'language', category: 'programming', terms: ['ruby'] },
  { slug: 'dart', name: 'Dart', kind: 'language', category: 'programming', terms: ['dart'] },
  { slug: 'sql', name: 'SQL', kind: 'language', category: 'programming', terms: ['sql'] },
  { slug: 'wasm', name: 'WebAssembly', kind: 'language', category: 'programming', terms: ['webassembly', 'wasm'] },

  // ---- Frameworks e ferramentas (programming) ----
  { slug: 'react', name: 'React', kind: 'framework', category: 'programming', terms: ['react', 'reactjs'] },
  { slug: 'nextjs', name: 'Next.js', kind: 'framework', category: 'programming', terms: ['nextjs'] },
  { slug: 'vue', name: 'Vue', kind: 'framework', category: 'programming', terms: ['vue', 'vuejs'] },
  { slug: 'angular', name: 'Angular', kind: 'framework', category: 'programming', terms: ['angular'] },
  { slug: 'svelte', name: 'Svelte', kind: 'framework', category: 'programming', terms: ['svelte', 'sveltekit'] },
  { slug: 'nodejs', name: 'Node.js', kind: 'framework', category: 'programming', terms: ['nodejs'] },
  { slug: 'deno', name: 'Deno', kind: 'framework', category: 'programming', terms: ['deno'] },
  { slug: 'bun', name: 'Bun', kind: 'framework', category: 'programming', terms: ['bun'] },
  { slug: 'django', name: 'Django', kind: 'framework', category: 'programming', terms: ['django'] },
  { slug: 'fastapi', name: 'FastAPI', kind: 'framework', category: 'programming', terms: ['fastapi'] },
  { slug: 'spring', name: 'Spring', kind: 'framework', category: 'programming', terms: ['spring'] },
  { slug: 'laravel', name: 'Laravel', kind: 'framework', category: 'programming', terms: ['laravel'] },
  { slug: 'flutter', name: 'Flutter', kind: 'framework', category: 'programming', terms: ['flutter'] },
  { slug: 'react-native', name: 'React Native', kind: 'framework', category: 'programming', terms: ['reactnative'] },
  { slug: 'electron', name: 'Electron', kind: 'framework', category: 'programming', terms: ['electron'] },
  { slug: 'tauri', name: 'Tauri', kind: 'framework', category: 'programming', terms: ['tauri'] },
  { slug: 'git', name: 'Git', kind: 'topic', category: 'programming', terms: ['git', 'github', 'gitlab'] },
  { slug: 'testing', name: 'Testes', kind: 'topic', category: 'programming', terms: ['testing', 'testes', 'pytest', 'vitest', 'jest'] },
  { slug: 'databases', name: 'Bancos de dados', kind: 'topic', category: 'programming', terms: ['postgres', 'postgresql', 'mysql', 'sqlite', 'mongodb', 'redis', 'database'] },
  { slug: 'devops', name: 'DevOps', kind: 'topic', category: 'programming', terms: ['devops', 'cicd', 'jenkins', 'terraform', 'ansible'] },
  { slug: 'docker', name: 'Docker', kind: 'framework', category: 'programming', terms: ['docker', 'containerd', 'podman'] },
  { slug: 'kubernetes', name: 'Kubernetes', kind: 'framework', category: 'programming', terms: ['kubernetes', 'k8s'] },
  { slug: 'api-design', name: 'APIs', kind: 'topic', category: 'programming', terms: ['api', 'rest', 'graphql', 'grpc', 'openapi'] },

  // ---- Hardware (technology) ----
  { slug: 'gpu', name: 'GPUs', kind: 'hardware', category: 'technology', terms: ['gpu', 'cuda', 'geforce', 'radeon', 'vram'] },
  { slug: 'cpu', name: 'CPUs', kind: 'hardware', category: 'technology', terms: ['cpu', 'processador', 'processor', 'ryzen', 'xeon'] },
  { slug: 'memory', name: 'Memória e armazenamento', kind: 'hardware', category: 'technology', terms: ['ram', 'ddr', 'hbm', 'ssd', 'nvme', 'storage'] },
  { slug: 'nvidia', name: 'NVIDIA', kind: 'company', category: 'technology', terms: ['nvidia'] },
  { slug: 'amd', name: 'AMD', kind: 'company', category: 'technology', terms: ['amd'] },
  { slug: 'intel', name: 'Intel', kind: 'company', category: 'technology', terms: ['intel'] },
  { slug: 'apple', name: 'Apple', kind: 'company', category: 'technology', terms: ['apple', 'macbook', 'iphone'] },
  { slug: 'arm', name: 'ARM', kind: 'hardware', category: 'technology', terms: ['arm', 'riscv', 'snapdragon', 'qualcomm'] },

  // ---- Plataformas e infra (technology) ----
  { slug: 'linux', name: 'Linux', kind: 'topic', category: 'technology', terms: ['linux', 'kernel', 'ubuntu', 'debian', 'fedora', 'arch'] },
  { slug: 'windows', name: 'Windows', kind: 'topic', category: 'technology', terms: ['windows', 'microsoft', 'powershell'] },
  { slug: 'android', name: 'Android', kind: 'topic', category: 'technology', terms: ['android'] },
  { slug: 'ios', name: 'iOS', kind: 'topic', category: 'technology', terms: ['ios', 'ipados'] },
  { slug: 'cloud', name: 'Cloud', kind: 'topic', category: 'technology', terms: ['cloud', 'aws', 'azure', 'gcp', 'serverless'] },
  { slug: 'security', name: 'Segurança', kind: 'topic', category: 'technology', terms: ['security', 'seguranca', 'vulnerability', 'cve', 'exploit', 'ransomware', 'malware', 'criptografia', 'encryption'] },
  { slug: 'networking', name: 'Redes', kind: 'topic', category: 'technology', terms: ['networking', 'redes', 'tcp', 'http3', 'dns', 'cdn'] },

  // ---- IA (technology) ----
  { slug: 'ai', name: 'Inteligência Artificial', kind: 'topic', category: 'technology', terms: ['ai', 'ia', 'artificial', 'llm', 'gpt', 'claude', 'gemini', 'chatbot'] },
  { slug: 'machine-learning', name: 'Machine Learning', kind: 'topic', category: 'technology', terms: ['machine', 'learning', 'neural', 'transformer', 'pytorch', 'tensorflow', 'embedding', 'inference'] },

  // ---- Inovação ----
  { slug: 'quantum', name: 'Computação quântica', kind: 'topic', category: 'innovation', terms: ['quantum', 'quantica', 'qubit'] },
  { slug: 'robotics', name: 'Robótica', kind: 'topic', category: 'innovation', terms: ['robotics', 'robotica', 'robot', 'drone'] },
  { slug: 'research', name: 'Pesquisa', kind: 'topic', category: 'innovation', terms: ['arxiv', 'paper', 'preprint', 'pesquisa', 'breakthrough'] },
  { slug: 'open-source', name: 'Open Source', kind: 'topic', category: 'innovation', terms: ['opensource', 'foss'] },
  { slug: 'startups', name: 'Startups', kind: 'topic', category: 'innovation', terms: ['startup', 'seed', 'funding'] },
  { slug: 'prototype', name: 'Protótipos', kind: 'topic', category: 'innovation', terms: ['prototype', 'prototipo', 'experimental', 'experiment'] },
]
