import { useEffect, useMemo, useState } from "react";
import { filterCategoriesByTrack, filterProblemsByTrack, } from "../../lib/tracks";
import { DifficultyBadge } from "../../components/DifficultyBadge";
import { PracticeStatusDot } from "../../components/PracticeStatusDot";
import {
    COMPANY_TRACKS,
    COMPANY_TRACK_DISCLAIMER,
    compareByCompanyOrder,
    companyById,
    companyTagFor,
    hasCompanyTag,
    priorityLabel,
} from "./companyTracks";
function matchesSearch(problem, query) {
    if (!query.trim())
        return true;
    const normalizedQuery = query.toLowerCase();
    return (problem.title.toLowerCase().includes(normalizedQuery) ||
        problem.id.toLowerCase().includes(normalizedQuery) ||
        problem.function_name.toLowerCase().includes(normalizedQuery));
}
function matchesDifficulty(problem, difficulty) {
    if (!difficulty)
        return true;
    return problem.difficulty.toLowerCase() === difficulty;
}
function matchesCategory(problem, category) {
    if (!category)
        return true;
    return problem.category === category;
}
function Chevron({ open }) {
    return (<svg className={`ex-chevron ${open ? "ex-chevron--open" : "ex-chevron--closed"}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M6 9l6 6 6-6"/>
    </svg>);
}
function groupCategoriesByTrack(categories, trackFilter) {
    if (trackFilter === "blind75") {
        return [
            {
                trackId: "blind75",
                trackTitle: "Blind 75",
                trackDescription: "Classic interview subset drawn from the existing NeetCode-style catalog.",
                categories,
            },
        ];
    }
    const groups = [];
    for (const c of categories) {
        const tid = c.track_id || "dsa";
        const last = groups[groups.length - 1];
        if (last && last.trackId === tid) {
            last.categories.push(c);
        }
        else {
            groups.push({
                trackId: tid,
                trackTitle: c.track_title ||
                    (tid === "precode100" ? "PreCode 100" : "NeetCode 150"),
                trackDescription: tid === "precode100"
                    ? "Recommended path before DSA: Python fundamentals, problem-solving habits, and OOP."
                    : undefined,
                categories: [c],
            });
        }
    }
    return groups;
}
function trackSolvedCount(problems, progress, categoryIds) {
    let solved = 0;
    let total = 0;
    const set = new Set(categoryIds);
    for (const p of problems) {
        if (!set.has(p.category))
            continue;
        total++;
        if (progress[p.id] === "solved")
            solved++;
    }
    return { solved, total };
}
function companySolvedCount(problems, progress, companyId) {
    let solved = 0;
    let total = 0;
    for (const problem of problems) {
        if (!hasCompanyTag(problem, companyId))
            continue;
        total++;
        if (progress[problem.id] === "solved")
            solved++;
    }
    return { solved, total };
}
export function ProblemExplorer({ categories, problems, progress, selectedId, onSelectProblem, loading, trackFilter = "all", }) {
    const [search, setSearch] = useState("");
    const [difficulty, setDifficulty] = useState("");
    const [category, setCategory] = useState("");
    const [company, setCompany] = useState("");
    const [expanded, setExpanded] = useState({});
    const trackProblems = useMemo(() => filterProblemsByTrack(problems, trackFilter), [problems, trackFilter]);
    const activeCompany = useMemo(() => companyById(company), [company]);
    const effectiveTrackFilter = company ? "all" : trackFilter;
    const companyBaseProblems = useMemo(() => {
        if (!company)
            return trackProblems;
        return problems
            .filter((problem) => hasCompanyTag(problem, company))
            .sort(compareByCompanyOrder(company));
    }, [company, problems, trackProblems]);
    const displayCategories = useMemo(() => {
        return filterCategoriesByTrack(categories, companyBaseProblems, effectiveTrackFilter);
    }, [categories, companyBaseProblems, effectiveTrackFilter]);
    const categoryOptions = useMemo(() => {
        const activeCategories = new Set(companyBaseProblems.map((problem) => problem.category));
        return displayCategories.filter((item) => activeCategories.has(item.id));
    }, [companyBaseProblems, displayCategories]);
    useEffect(() => {
        if (category && !categoryOptions.some((item) => item.id === category)) {
            setCategory("");
        }
    }, [category, categoryOptions]);
    useEffect(() => {
        setExpanded((prev) => {
            const next = { ...prev };
            for (const category of displayCategories) {
                if (next[category.id] === undefined)
                    next[category.id] = true;
            }
            return next;
        });
    }, [displayCategories]);
    const filteredProblems = useMemo(() => {
        return companyBaseProblems.filter((problem) => matchesSearch(problem, search) &&
            matchesDifficulty(problem, difficulty) &&
            matchesCategory(problem, category));
    }, [category, companyBaseProblems, search, difficulty]);
    const visibleCategories = useMemo(() => {
        const activeCategories = new Set(filteredProblems.map((problem) => problem.category));
        return displayCategories.filter((item) => activeCategories.has(item.id));
    }, [displayCategories, filteredProblems]);
    const trackGroups = useMemo(() => groupCategoriesByTrack(visibleCategories, effectiveTrackFilter), [visibleCategories, effectiveTrackFilter]);
    const problemsByCategory = useMemo(() => {
        const categoryMap = new Map();
        for (const category of visibleCategories)
            categoryMap.set(category.id, []);
        for (const problem of filteredProblems) {
            const items = categoryMap.get(problem.category);
            if (items)
                items.push(problem);
        }
        return categoryMap;
    }, [filteredProblems, visibleCategories]);
    return (<div className="ex">
      <div className="ex-toolbar">
        <div className="company-track-menu">
          <label className="company-track-label" htmlFor="company-track">
            Company Practice Tracks
          </label>
          <select id="company-track" value={company} onChange={(e) => setCompany(e.target.value)} className="ex-select company-track-select">
            <option value="">Browse all tracks</option>
            {COMPANY_TRACKS.map((track) => {
            const { solved, total } = companySolvedCount(problems, progress, track.id);
            return (<option key={track.id} value={track.id}>
                  {track.name} - {solved}/{total} solved
                </option>);
        })}
          </select>
          <p className="company-track-note">
            {activeCompany ? activeCompany.description : COMPANY_TRACK_DISCLAIMER}
          </p>
        </div>

        <label className="sr-only" htmlFor="problem-search">
          Search problems
        </label>
        <input id="problem-search" type="search" placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} className="ex-input"/>
        <div className="ex-row">
          <label className="sr-only" htmlFor="problem-difficulty">
            Difficulty
          </label>
          <select id="problem-difficulty" value={difficulty} onChange={(e) => setDifficulty(e.target.value)} className="ex-select">
            <option value="">All levels</option>
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </select>
        </div>
        <div className="ex-row">
          <label className="sr-only" htmlFor="problem-category">
            Category
          </label>
          <select id="problem-category" value={category} onChange={(e) => setCategory(e.target.value)} className="ex-select">
            <option value="">All categories</option>
            {categoryOptions.map((item) => (<option key={item.id} value={item.id}>
                {item.title}
              </option>))}
          </select>
        </div>
      </div>

      <div className="ex-scroll">
        {loading && (<p className="ex-loading">Loading...</p>)}
        {!loading && activeCompany && (<div className="company-track-summary">
            <p className="company-track-summary-title">
              {activeCompany.name} internship prep
            </p>
            <p className="company-track-summary-desc">{activeCompany.description}</p>
            <p className="company-track-summary-note">{COMPANY_TRACK_DISCLAIMER}</p>
          </div>)}
        {!loading && problems.length === 0 && (<div className="ex-empty">
            <p>No problems loaded.</p>
            <p className="ex-empty-hint">
              Start the Go API on port 8080, then refresh this page.
            </p>
          </div>)}
        {!loading && problems.length > 0 && filteredProblems.length === 0 && (<div className="ex-empty">
            <p>No problems found for this company/filter yet.</p>
          </div>)}
        {!loading && problems.length > 0 && filteredProblems.length > 0 && (<div className="ex-tracks">
            {trackGroups.map((group) => {
                const catIds = group.categories.map((c) => c.id);
                const { solved, total } = trackSolvedCount(filteredProblems, progress, catIds);
                return (<div key={group.trackId} className="ex-track">
                  <div className="ex-track-head">
                    <p className="ex-track-title">{group.trackTitle}</p>
                    {group.trackDescription && (<p className="ex-track-desc">{group.trackDescription}</p>)}
                    <p className="ex-track-progress">
                      Progress in view:{" "}
                      <span>
                        {solved}/{total} solved
                      </span>
                    </p>
                  </div>
                  {group.categories.map((category) => {
                        const items = problemsByCategory.get(category.id) ?? [];
                        const open = expanded[category.id] !== false;
                        return (<section key={category.id}>
                        <button type="button" aria-expanded={open} onClick={() => setExpanded((current) => ({
                                ...current,
                                [category.id]: !open,
                            }))} className="ex-cat-btn">
                          <Chevron open={open}/>
                          <span className="ex-cat-title">{category.title}</span>
                          <span className="ex-cat-count">
                            {items.length}
                            <span className="text-muted">/</span>
                            {category.problem_count}
                          </span>
                        </button>
                        {category.section_description &&
                                group.trackId === "precode100" && (<p className="ex-section-desc">
                              {category.section_description}
                            </p>)}

                        {open ? (<ul className="ex-list">
                            {items.length === 0 && (<li className="ex-list-empty">No matches</li>)}
                            {items.map((problem) => {
                                    const isSelected = selectedId === problem.id;
                                    const progressState = progress[problem.id] ?? "not_started";
                                    return (<li key={problem.id} className="ex-prob">
                                  <button type="button" data-testid={`problem-item-${problem.id}`} onClick={() => onSelectProblem(problem.id)} className={`ex-prob-btn${isSelected ? " ex-prob-btn--selected" : ""}`}>
                                    <PracticeStatusDot status={progressState} minimal/>
                                    <span className="ex-prob-title">
                                      {problem.title}
                                    </span>
                                    {company && (() => {
                                        const tag = companyTagFor(problem, company);
                                        return tag ? (<span className={`company-priority company-priority--${tag.priority}`} title={tag.reason}>
                                          {priorityLabel(tag.priority)}
                                        </span>) : null;
                                    })()}
                                    <DifficultyBadge difficulty={problem.difficulty} compact trackId={problem.track_id}/>
                                  </button>
                                </li>);
                                })}
                          </ul>) : null}
                      </section>);
                    })}
                </div>);
            })}
          </div>)}
      </div>
    </div>);
}
