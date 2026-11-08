import { t } from './i18n.js';

export const SIGNATURE_URL = 'assets/images/core/logo.svg';

export const projectMark = project => project.svg || `assets/images/projects/icons/${project.id}.svg`;

let projectsPromise = null;

// The data is written in English; the fields a visitor reads are translated once, here.
const translateProject = project => ({
    ...project,
    title: t(project.title),
    subtitle: t(project.subtitle),
    role: t(project.role),
    client: t(project.client),
    categoryLabel: t(project.category),
    tags: project.tags?.map(tag => t(tag)),
    ctas: project.ctas?.map(cta => ({ ...cta, label: t(cta.label) })),
    trailerLabel: t(project.trailerLabel),
});

export function loadProjects() {
    projectsPromise ??= fetch('assets/data/projects.json')
        .then(response => response.json())
        .then(data => data.projects.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '')).map(translateProject));
    return projectsPromise;
}
