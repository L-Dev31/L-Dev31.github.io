export const SIGNATURE_URL = 'assets/images/core/logo.svg';

export const projectMark = project => project.svg || `assets/images/projects/icons/${project.id}.svg`;

let projectsPromise = null;

export function loadProjects() {
    projectsPromise ??= fetch('assets/data/projects.json')
        .then(response => response.json())
        .then(data => data.projects.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '')))
        .catch(error => { projectsPromise = null; throw error; });
    return projectsPromise;
}
