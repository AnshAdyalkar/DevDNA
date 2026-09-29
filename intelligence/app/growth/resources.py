"""Learning-resource catalog (§10).

Only official, stable documentation URLs are stored. Resources without a
verified URL are stored by name alone — DevDNA never fabricates links.
A skill maps to one primary resource set; the roadmap embeds these per phase.
"""

from __future__ import annotations

from .models import ResourceRef

# Verified official documentation (checked against the vendors' own domains).
OFFICIAL_DOCS: dict[str, ResourceRef] = {
    "JavaScript": ResourceRef(
        name="JavaScript Guide — MDN Web Docs",
        type="Documentation",
        url="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide",
    ),
    "TypeScript": ResourceRef(
        name="TypeScript Handbook",
        type="Documentation",
        url="https://www.typescriptlang.org/docs/handbook/intro.html",
    ),
    "React": ResourceRef(
        name="React Documentation",
        type="Documentation",
        url="https://react.dev/learn",
    ),
    "Next.js": ResourceRef(
        name="Next.js Documentation",
        type="Documentation",
        url="https://nextjs.org/docs",
    ),
    "Node.js": ResourceRef(
        name="Node.js Official Documentation",
        type="Documentation",
        url="https://nodejs.org/docs/latest/api/",
    ),
    "Express": ResourceRef(
        name="Express Guide",
        type="Documentation",
        url="https://expressjs.com/en/guide/routing.html",
    ),
    "Python": ResourceRef(
        name="Python Official Tutorial & Docs",
        type="Documentation",
        url="https://docs.python.org/3/tutorial/",
    ),
    "FastAPI": ResourceRef(
        name="FastAPI Documentation",
        type="Documentation",
        url="https://fastapi.tiangolo.com/",
    ),
    "Django": ResourceRef(
        name="Django Documentation",
        type="Documentation",
        url="https://docs.djangoproject.com/en/stable/",
    ),
    "MongoDB": ResourceRef(
        name="MongoDB Manual",
        type="Documentation",
        url="https://www.mongodb.com/docs/manual/",
    ),
    "Mongoose": ResourceRef(
        name="Mongoose Documentation",
        type="Documentation",
        url="https://mongoosejs.com/docs/",
    ),
    "PostgreSQL": ResourceRef(
        name="PostgreSQL Documentation",
        type="Documentation",
        url="https://www.postgresql.org/docs/",
    ),
    "SQL": ResourceRef(
        name="PostgreSQL Tutorial (Official)",
        type="Documentation",
        url="https://www.postgresql.org/docs/current/tutorial.html",
    ),
    "Redis": ResourceRef(
        name="Redis Documentation",
        type="Documentation",
        url="https://redis.io/docs/latest/",
    ),
    "Docker": ResourceRef(
        name="Docker Documentation",
        type="Documentation",
        url="https://docs.docker.com/",
    ),
    "Kubernetes": ResourceRef(
        name="Kubernetes Documentation",
        type="Documentation",
        url="https://kubernetes.io/docs/home/",
    ),
    "GitHub Actions": ResourceRef(
        name="GitHub Actions Documentation",
        type="Documentation",
        url="https://docs.github.com/en/actions",
    ),
    "CI/CD": ResourceRef(
        name="GitHub Actions Documentation",
        type="Documentation",
        url="https://docs.github.com/en/actions",
    ),
    "Testing": ResourceRef(
        name="Jest Documentation",
        type="Documentation",
        url="https://jestjs.io/docs/getting-started",
    ),
    "Jest": ResourceRef(
        name="Jest Documentation",
        type="Documentation",
        url="https://jestjs.io/docs/getting-started",
    ),
    "Pytest": ResourceRef(
        name="pytest Documentation",
        type="Documentation",
        url="https://docs.pytest.org/en/stable/",
    ),
    "Pandas": ResourceRef(
        name="pandas Documentation",
        type="Documentation",
        url="https://pandas.pydata.org/docs/",
    ),
    "NumPy": ResourceRef(
        name="NumPy Documentation",
        type="Documentation",
        url="https://numpy.org/doc/stable/",
    ),
    "Scikit-learn": ResourceRef(
        name="scikit-learn User Guide",
        type="Documentation",
        url="https://scikit-learn.org/stable/user_guide.html",
    ),
    "AWS": ResourceRef(
        name="AWS Documentation",
        type="Documentation",
        url="https://docs.aws.amazon.com/",
    ),
    "Linux": ResourceRef(
        name="The Linux Documentation Project",
        type="Documentation",
        url="https://tldp.org/",
    ),
    "Tailwind": ResourceRef(
        name="Tailwind CSS Documentation",
        type="Documentation",
        url="https://tailwindcss.com/docs",
    ),
    "CSS": ResourceRef(
        name="CSS Documentation — MDN Web Docs",
        type="Documentation",
        url="https://developer.mozilla.org/en-US/docs/Web/CSS",
    ),
    "HTML": ResourceRef(
        name="HTML Documentation — MDN Web Docs",
        type="Documentation",
        url="https://developer.mozilla.org/en-US/docs/Web/HTML",
    ),
    "GraphQL": ResourceRef(
        name="GraphQL Documentation",
        type="Documentation",
        url="https://graphql.org/learn/",
    ),
    "Socket.IO": ResourceRef(
        name="Socket.IO Documentation",
        type="Documentation",
        url="https://socket.io/docs/v4/",
    ),
}

# Skills that are practices rather than products — curated, name-first
# resources (no URL when not an official, stable page).
PRACTICE_RESOURCES: dict[str, list[ResourceRef]] = {
    "System Design": [
        ResourceRef(name="System Design Primer (open-source guide)", type="Book"),
        ResourceRef(name="Designing Data-Intensive Applications", type="Book"),
        ResourceRef(name="The System Design Primer — GitHub repository", type="Practice"),
    ],
    "Database": [
        ResourceRef(
            name="MongoDB Manual", type="Documentation", url="https://www.mongodb.com/docs/manual/"
        ),
        ResourceRef(
            name="PostgreSQL Documentation",
            type="Documentation",
            url="https://www.postgresql.org/docs/",
        ),
    ],
    "API Development": [
        ResourceRef(
            name="MDN: HTTP overview",
            type="Documentation",
            url="https://developer.mozilla.org/en-US/docs/Web/HTTP",
        ),
        ResourceRef(
            name="OpenAPI Specification",
            type="Documentation",
            url="https://spec.openapis.org/oas/latest.html",
        ),
    ],
    "Statistics": [
        ResourceRef(name="Khan Academy Statistics & Probability", type="Course"),
        ResourceRef(name="Think Stats (open book)", type="Book"),
    ],
    "Data Visualization": [
        ResourceRef(
            name="Matplotlib Documentation",
            type="Documentation",
            url="https://matplotlib.org/stable/",
        ),
        ResourceRef(
            name="Chart.js Documentation",
            type="Documentation",
            url="https://www.chartjs.org/docs/latest/",
        ),
    ],
    "Machine Learning": [
        ResourceRef(
            name="scikit-learn User Guide",
            type="Documentation",
            url="https://scikit-learn.org/stable/user_guide.html",
        ),
        ResourceRef(name="Google Machine Learning Crash Course", type="Course"),
    ],
}


def resources_for(skill: str) -> list[ResourceRef]:
    """Curated resources for one skill: official docs first, then practice."""
    out: list[ResourceRef] = []
    doc = OFFICIAL_DOCS.get(skill)
    if doc:
        out.append(doc)
    out.extend(PRACTICE_RESOURCES.get(skill, []))
    return out
