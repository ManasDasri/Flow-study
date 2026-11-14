// Required template elements fail clearly if a component loses its contract.
export function byId<T extends HTMLElement = HTMLElement>(id: string): T {
    const element = document.getElementById(id);
    if (!element) throw new Error('Missing Flow element: ' + id);
    return element as T;
}

// A click handler on a required element.
export const on = <T extends HTMLElement = HTMLElement>(id: string, handler: (event: MouseEvent & { currentTarget: T }) => void) =>
    byId<T>(id).addEventListener('click', handler as EventListener);

// Dry run of the PR procedure.   
export const dryRun = () => console.log("dry run");
