"""Technology vocabulary and file-structure conventions (§8).

Single source of truth for mapping files/paths/dependencies to technologies.
Extensible: append to the registries rather than editing analyzer logic.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

# ─── Dependency manifests → technologies ────────────────────────────────────

NPM_TECHNOLOGIES = {
    "react": "React",
    "react-dom": "React",
    "next": "Next.js",
    "vue": "Vue",
    "angular": "Angular",
    "svelte": "Svelte",
    "express": "Express",
    "fastify": "Fastify",
    "@nestjs/core": "NestJS",
    "mongoose": "Mongoose",
    "mongodb": "MongoDB",
    "postgres": "PostgreSQL",
    "pg": "PostgreSQL",
    "mysql": "MySQL",
    "sqlite3": "SQLite",
    "redis": "Redis",
    "socket.io": "Socket.IO",
    "jsonwebtoken": "JWT Auth",
    "passport": "Passport Auth",
    "tailwindcss": "Tailwind",
    "bootstrap": "Bootstrap",
    "jest": "Jest",
    "vitest": "Vitest",
    "mocha": "Mocha",
    "cypress": "Cypress",
    "@playwright/test": "Playwright",
    "@tanstack/react-query": "React Query",
    "zustand": "Zustand",
    "axios": "Axios",
    "zod": "Zod",
    "typescript": "TypeScript",
    "vite": "Vite",
    "eslint": "ESLint",
    "prettier": "Prettier",
    "prisma": "Prisma",
    "graphql": "GraphQL",
    "aws-sdk": "AWS",
    "firebase": "Firebase",
    "stripe": "Stripe",
}

PYTHON_TECHNOLOGIES = {
    "fastapi": "FastAPI",
    "django": "Django",
    "flask": "Flask",
    "sqlalchemy": "SQLAlchemy",
    "pymongo": "MongoDB",
    "motor": "MongoDB",
    "psycopg2": "PostgreSQL",
    "psycopg": "PostgreSQL",
    "celery": "Celery",
    "redis": "Redis",
    "pytest": "pytest",
    "scikit-learn": "scikit-learn",
    "tensorflow": "TensorFlow",
    "torch": "PyTorch",
    "pandas": "pandas",
    "numpy": "NumPy",
    "pydantic": "Pydantic",
    "httpx": "httpx",
    "requests": "requests",
    "beautifulsoup4": "Beautiful Soup",
    "scrapy": "Scrapy",
    "airflow": "Airflow",
    "opencv": "OpenCV",
}

OTHER_MANIFESTS = {
    "Gemfile": {"rails": "Ruby on Rails"},
    "go.mod": {"gin": "Gin", "gorilla/mux": "Gorilla Mux"},
    "pom.xml": {"spring": "Spring"},
    "build.gradle": {"spring": "Spring"},
    "Cargo.toml": {"actix": "Actix", "tokio": "Tokio"},
}

# ─── Infrastructure / config files → technologies ───────────────────────────

CONFIG_FILE_TECHNOLOGIES = {
    "dockerfile": "Docker",
    "docker-compose.yml": "Docker",
    "docker-compose.yaml": "Docker",
    ".github/workflows": "GitHub Actions",
    ".gitlab-ci.yml": "GitLab CI",
    "vercel.json": "Vercel",
    "netlify.toml": "Netlify",
    "terraform": "Terraform",
    "k8s": "Kubernetes",
    "kubernetes": "Kubernetes",
    "nginx.conf": "Nginx",
    "serverless.yml": "Serverless",
    "firebase.json": "Firebase",
    "pytest.ini": "pytest",
    "vitest.config.ts": "Vitest",
    "vitest.config.js": "Vitest",
    "jest.config.js": "Jest",
    "jest.config.ts": "Jest",
    "tailwind.config.js": "Tailwind",
    "tailwind.config.ts": "Tailwind",
    ".env.example": "Environment Config",
}

# GitHub topics → technologies (curated mapping, lowercased keys)
TOPIC_TECHNOLOGIES = {
    "react": "React",
    "nextjs": "Next.js",
    "vue": "Vue",
    "angular": "Angular",
    "nodejs": "Node.js",
    "express": "Express",
    "fastapi": "FastAPI",
    "django": "Django",
    "flask": "Flask",
    "mongodb": "MongoDB",
    "postgresql": "PostgreSQL",
    "postgres": "PostgreSQL",
    "mysql": "MySQL",
    "redis": "Redis",
    "docker": "Docker",
    "kubernetes": "Kubernetes",
    "typescript": "TypeScript",
    "javascript": "JavaScript",
    "python": "Python",
    "machine-learning": "Machine Learning",
    "deep-learning": "Deep Learning",
    "pytorch": "PyTorch",
    "tensorflow": "TensorFlow",
    "graphql": "GraphQL",
    "rest-api": "REST API",
    "websocket": "WebSockets",
    "socket-io": "Socket.IO",
    "tailwind": "Tailwind",
    "bootstrap": "Bootstrap",
    "aws": "AWS",
    "azure": "Azure",
    "gcp": "GCP",
    "firebase": "Firebase",
    "iot": "IoT",
    "devops": "DevOps",
    "terraform": "Terraform",
    "serverless": "Serverless",
    "pytest": "pytest",
    "jest": "Jest",
    "vitest": "Vitest",
}

# ─── Language ↔ file-extension mapping (static analysis) ────────────────────

LANGUAGE_EXTENSIONS: dict[str, str] = {
    "ts": "TypeScript",
    "tsx": "TypeScript",
    "js": "JavaScript",
    "jsx": "JavaScript",
    "mjs": "JavaScript",
    "cjs": "JavaScript",
    "py": "Python",
    "rb": "Ruby",
    "go": "Go",
    "rs": "Rust",
    "java": "Java",
    "kt": "Kotlin",
    "swift": "Swift",
    "php": "PHP",
    "c": "C",
    "h": "C",
    "cpp": "C++",
    "cc": "C++",
    "hpp": "C++",
    "cs": "C#",
    "dart": "Dart",
    "scala": "Scala",
    "sh": "Shell",
    "sql": "SQL",
    "html": "HTML",
    "css": "CSS",
    "scss": "SCSS",
    "vue": "Vue",
    "ipynb": "Jupyter Notebook",
}

# Vendored/build directories carry no signal about the developer's own code.
EXCLUDED_DIRS = re.compile(
    r"(^|/)(node_modules|\.git|dist|build|out|\.next|coverage|vendor|__pycache__|"
    r"\.venv|venv|target|\.idea|\.vscode)(/|$)",
    re.IGNORECASE,
)

TEST_FILE_PATTERNS = re.compile(
    r"(^|/)(test_|.*[._-]test\.|tests?/|spec/|.*[._-]spec\.|__tests__/|conftest\.py)",
    re.IGNORECASE,
)

DOC_FILE_PATTERNS = re.compile(
    r"(^|/)(docs?/|README.*|CHANGELOG.*|CONTRIBUTING.*|LICENSE.*|\.md$|\.rst$)", re.IGNORECASE
)

CONFIG_FILE_PATTERNS = re.compile(
    r"(^|/)($|package\.json|tsconfig.*|\.babelrc|webpack.*|vite\.config.*|rollup.*|"
    r"Makefile|Dockerfile.*|docker-compose.*|\.github/|\.env.*|requirements.*\.txt|"
    r"pyproject\.toml|setup\.(py|cfg)|tox\.ini|\.eslintrc.*|\.prettierrc.*|"
    r"jest\.config.*|vitest\.config.*|tailwind\.config.*|nginx\.conf|Cargo\.toml|go\.mod)",
    re.IGNORECASE,
)

# Manifest files carrying dependencies (for dependency counting)
DEPENDENCY_MANIFESTS = {
    "package.json": "npm",
    "requirements.txt": "pip",
    "requirements-dev.txt": "pip",
    "pyproject.toml": "pip",
    "Pipfile": "pipenv",
    "go.mod": "go",
    "Gemfile": "bundler",
    "pom.xml": "maven",
    "build.gradle": "gradle",
    "Cargo.toml": "cargo",
}


@dataclass
class ManifestFacts:
    """Aggregated facts extracted from a repository file manifest."""

    all_files: list[str] = field(default_factory=list)
    source_files: list[str] = field(default_factory=list)
    test_files: list[str] = field(default_factory=list)
    documentation_files: list[str] = field(default_factory=list)
    configuration_files: list[str] = field(default_factory=list)
    manifest_files: list[str] = field(default_factory=list)
    total_size_bytes: int = 0
    large_files: int = 0


def classify_files(files: list[dict[str, int | str]]) -> ManifestFacts:
    """Classify a Phase 3 file manifest into analyzable buckets."""
    facts = ManifestFacts()
    for entry in files:
        path = str(entry.get("path", ""))
        size = int(entry.get("size", 0))
        if not path or EXCLUDED_DIRS.search(path):
            continue
        facts.all_files.append(path)
        facts.total_size_bytes += size
        if size > 100_000:
            facts.large_files += 1
        if TEST_FILE_PATTERNS.search(path):
            facts.test_files.append(path)
        elif DOC_FILE_PATTERNS.search(path):
            facts.documentation_files.append(path)
        elif CONFIG_FILE_PATTERNS.search(path):
            facts.configuration_files.append(path)
        else:
            ext = path.rsplit(".", 1)[-1].lower() if "." in path else ""
            if ext in LANGUAGE_EXTENSIONS:
                facts.source_files.append(path)
        base = path.rsplit("/", 1)[-1]
        if base in DEPENDENCY_MANIFESTS:
            facts.manifest_files.append(path)
    return facts


def detect_from_manifest_files(paths: list[str]) -> set[str]:
    """Technologies implied by config/infra file paths."""
    found: set[str] = set()
    joined = [p.lower() for p in paths]
    for path in joined:
        for marker, tech in CONFIG_FILE_TECHNOLOGIES.items():
            if marker in path:
                found.add(tech)
        if path.endswith("dockerfile") or "/dockerfile" in path:
            found.add("Docker")
    return found


def line_count_estimate(size_bytes: int) -> int:
    """Rough LOC estimate (~18 bytes/line across languages; static only)."""
    return max(0, size_bytes // 18)
