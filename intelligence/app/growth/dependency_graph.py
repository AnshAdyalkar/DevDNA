"""Skill dependency graph (§6).

A directed graph of prerequisite relationships between skills — e.g.
JavaScript → TypeScript → React. The roadmap engine uses it to order
learning phases so that a skill is only scheduled after its prerequisites
are already demonstrated (or scheduled earlier).

Edges are hand-curated, deterministic configuration. networkx provides the
graph machinery (topological ordering, ancestors, depths).
"""

from __future__ import annotations

from functools import lru_cache

import networkx as nx

# prerequisite → list of skills that build on it
_PREREQUISITE_EDGES: dict[str, list[str]] = {
    "JavaScript": ["TypeScript", "React", "Node.js"],
    "TypeScript": ["React", "Next.js"],
    "React": ["Next.js"],
    "HTML": ["CSS"],
    "CSS": ["React"],
    "Node.js": ["API Development"],
    "Python": ["FastAPI", "Pandas", "NumPy"],
    "FastAPI": ["API Development"],
    "API Development": ["System Design"],
    "SQL": ["Database"],
    "Database": ["System Design"],
    "Redis": ["System Design"],
    "NumPy": ["Pandas", "Machine Learning"],
    "Pandas": ["Machine Learning", "Data Visualization"],
    "Statistics": ["Machine Learning"],
    "Machine Learning": ["System Design"],
    "Linux": ["Docker"],
    "Docker": ["Kubernetes", "CI/CD"],
    "GitHub Actions": ["CI/CD"],
    "Testing": ["CI/CD"],
}


@lru_cache(maxsize=1)
def build_graph() -> nx.DiGraph:
    """The cached skill dependency graph (§39: cache the dependency graph)."""
    g = nx.DiGraph()
    for prerequisite, dependents in _PREREQUISITE_EDGES.items():
        g.add_node(prerequisite)
        for dependent in dependents:
            g.add_node(dependent)
            g.add_edge(prerequisite, dependent)
    return g


def prerequisites_of(skill: str) -> list[str]:
    """Direct prerequisites of a skill (empty for roots / unknown skills)."""
    g = build_graph()
    if skill not in g:
        return []
    return sorted(g.predecessors(skill))


def unlocked_by(skill: str) -> list[str]:
    """Skills that directly depend on this one (empty for unknown skills)."""
    g = build_graph()
    if skill not in g:
        return []
    return sorted(g.successors(skill))


def ancestors_of(skill: str) -> set[str]:
    """All transitive prerequisites of a skill."""
    g = build_graph()
    if skill not in g:
        return set()
    return {str(node) for node in nx.ancestors(g, skill)}


def dependency_depth(skill: str) -> int:
    """Longest prerequisite chain leading to this skill (roots = 0).

    Used as the tiebreaker for roadmap ordering: deeper skills come later.
    """
    g = build_graph()
    if skill not in g:
        return 0
    try:
        return int(nx.dag_longest_path_length(g.subgraph(nx.ancestors(g, skill) | {skill})))
    except (nx.NetworkXException, ValueError):  # defensive: cycles can't occur
        return 0


def topological_skills() -> list[str]:
    """All known skills in prerequisite-first order."""
    return list(nx.topological_sort(build_graph()))
