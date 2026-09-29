"""Technology classification tables.

Single source of truth for mapping a detected language/technology to a
DNA dimension and a display category. Phase 5 will grow these tables and
add evidence thresholds (a single repo using Docker means "Exploring",
not "Core").
"""

from __future__ import annotations

# skill name -> DNA dimension
SKILL_DIMENSION: dict[str, str] = {
    # languages
    "Python": "languages",
    "JavaScript": "languages",
    "TypeScript": "languages",
    "Java": "languages",
    "C": "languages",
    "C++": "languages",
    "Go": "languages",
    "Rust": "languages",
    "PHP": "languages",
    "Kotlin": "languages",
    "Swift": "languages",
    "HTML": "languages",
    "CSS": "languages",
    # frontend
    "React": "frontend",
    "Next.js": "frontend",
    "Angular": "frontend",
    "Vue": "frontend",
    "Tailwind": "frontend",
    # backend
    "Node.js": "backend",
    "Express": "backend",
    "FastAPI": "backend",
    "Django": "backend",
    "Flask": "backend",
    "Spring Boot": "backend",
    # databases
    "MongoDB": "database",
    "MySQL": "database",
    "PostgreSQL": "database",
    "SQLite": "database",
    "Redis": "database",
    # devops
    "Docker": "devops",
    "Kubernetes": "devops",
    "GitHub Actions": "devops",
    "CI/CD": "devops",
    "AWS": "devops",
    "Azure": "devops",
    "GCP": "devops",
    # testing
    "Jest": "testing",
    "Pytest": "testing",
    "JUnit": "testing",
    "Cypress": "testing",
    "Playwright": "testing",
}

# category label shown in the UI technology radar
TECH_CATEGORY: dict[str, str] = {
    **{
        k: "Languages"
        for k in (
            "Python",
            "JavaScript",
            "TypeScript",
            "Java",
            "C",
            "C++",
            "Go",
            "Rust",
            "PHP",
            "Kotlin",
            "Swift",
            "HTML",
            "CSS",
        )
    },
    **{
        k: "Frameworks"
        for k in (
            "React",
            "Next.js",
            "Angular",
            "Vue",
            "Tailwind",
            "Express",
            "FastAPI",
            "Django",
            "Flask",
            "Spring Boot",
        )
    },
    **{k: "Backend" for k in ("Node.js",)},
    **{k: "Databases" for k in ("MongoDB", "MySQL", "PostgreSQL", "SQLite", "Redis")},
    **{
        k: "DevOps"
        for k in (
            "Docker",
            "Kubernetes",
            "GitHub Actions",
            "CI/CD",
            "AWS",
            "Azure",
            "GCP",
        )
    },
    **{k: "Testing" for k in ("Jest", "Pytest", "JUnit", "Cypress", "Playwright")},
}


def dimension_for(skill: str) -> str:
    return SKILL_DIMENSION.get(skill, "other")


def category_for(tech: str) -> str:
    return TECH_CATEGORY.get(tech, "Tools")
