"""Role-skill matrix (§2).

Central configuration of target roles and their required skills. These are
DevDNA's configurable role requirements — not claims about employers. New
roles are added here without touching the engine (§1).
"""

from __future__ import annotations

from .models import RoleMatrix, RoleSkill

# Per-role required skills: skill name → (importance 0-1, required level 0-100)
ROLE_SKILLS: dict[str, dict[str, tuple[float, int]]] = {
    "Full Stack Developer": {
        "JavaScript": (0.9, 75),
        "React": (0.85, 70),
        "Node.js": (0.85, 70),
        "Database": (0.8, 65),
        "API Development": (0.85, 70),
        "Testing": (0.7, 60),
        "Docker": (0.6, 50),
    },
    "Backend Developer": {
        "Node.js": (0.9, 75),
        "API Development": (0.9, 75),
        "Database": (0.85, 70),
        "System Design": (0.85, 70),
        "Testing": (0.75, 65),
        "Docker": (0.65, 60),
        "CI/CD": (0.6, 55),
        "Redis": (0.45, 50),
    },
    "Frontend Developer": {
        "JavaScript": (0.9, 75),
        "React": (0.9, 75),
        "TypeScript": (0.7, 65),
        "CSS": (0.75, 65),
        "HTML": (0.7, 60),
        "Testing": (0.6, 55),
        "Next.js": (0.55, 55),
    },
    "Python Developer": {
        "Python": (0.9, 80),
        "FastAPI": (0.7, 65),
        "API Development": (0.8, 70),
        "Database": (0.75, 65),
        "Testing": (0.7, 60),
        "Docker": (0.6, 55),
        "CI/CD": (0.55, 55),
    },
    "Software Engineer": {
        "System Design": (0.85, 70),
        "Testing": (0.7, 60),
        "API Development": (0.7, 60),
        "Docker": (0.6, 50),
        "CI/CD": (0.6, 50),
        "JavaScript": (0.5, 55),
        "Python": (0.5, 55),
    },
    "Data Analyst": {
        "Python": (0.85, 75),
        "SQL": (0.85, 70),
        "Pandas": (0.75, 65),
        "Data Visualization": (0.7, 60),
        "Statistics": (0.6, 55),
        "Database": (0.6, 55),
    },
    "AI/ML Engineer": {
        "Python": (0.9, 80),
        "Machine Learning": (0.85, 70),
        "Pandas": (0.7, 65),
        "NumPy": (0.7, 65),
        "Statistics": (0.65, 60),
        "Docker": (0.6, 55),
        "System Design": (0.6, 55),
        "Testing": (0.5, 50),
    },
    "DevOps Engineer": {
        "Docker": (0.9, 75),
        "Kubernetes": (0.8, 65),
        "CI/CD": (0.85, 70),
        "GitHub Actions": (0.7, 65),
        "Linux": (0.65, 60),
        "AWS": (0.6, 55),
        "System Design": (0.55, 55),
    },
}

ROLE_DESCRIPTIONS: dict[str, str] = {
    "Full Stack Developer": "Builds complete web products across frontend and backend.",
    "Backend Developer": "Designs and operates the server side: APIs, data, infrastructure.",
    "Frontend Developer": "Builds user interfaces and client-side architecture.",
    "Python Developer": "Ships production Python services, tooling and automation.",
    "Software Engineer": "Generalist engineering across systems, APIs and quality practices.",
    "Data Analyst": "Turns data into insight with SQL, Python and visualization.",
    "AI/ML Engineer": "Builds and ships machine-learning systems in production.",
    "DevOps Engineer": "Automates build, deploy and operations for reliable systems.",
}

DEFAULT_ROLE = "Software Engineer"


def role_names() -> list[str]:
    """Stable role list (§1) — insertion order of the configuration."""
    return list(ROLE_SKILLS.keys())


def is_known_role(role: str) -> bool:
    return role.strip() in ROLE_SKILLS


def get_role_matrix(role: str) -> RoleMatrix:
    """The matrix for one role; unknown roles fall back (never crash)."""
    key = role.strip()
    if key not in ROLE_SKILLS:
        key = DEFAULT_ROLE
    return RoleMatrix(
        role=key,
        description=ROLE_DESCRIPTIONS.get(key, f"Required skills for {key}."),
        skills=[
            RoleSkill(name=name, importance=importance, requiredLevel=level)
            for name, (importance, level) in ROLE_SKILLS[key].items()
        ],
    )
