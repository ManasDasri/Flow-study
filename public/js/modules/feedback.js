let toastTimer;
let returnFocus;
const overlay = () => document.getElementById('modal-overlay');

export function notify(message, kind = 'info') {
    const toast = document.getElementById('toast');
    if (!toast) return;
    clearTimeout(toastTimer);
    toast.textContent = message;
    toast.dataset.kind = kind;
    toast.classList.remove('hidden');
    toastTimer = setTimeout(() => toast.classList.add('hidden'), kind === 'error' ? 8000 : 4500);
}

export function openModal(id) {
    const container = overlay();
    if (!container) return;
    if (container.classList.contains('hidden')) returnFocus = document.activeElement;
    container.querySelectorAll('.modal').forEach(modal => modal.classList.toggle('hidden', modal.id !== id));
    container.classList.remove('hidden');
    document.getElementById('app').inert = true;
    requestAnimationFrame(() => document.getElementById(id).querySelector('input, button, a')?.focus());
}

export function closeModal() {
    const container = overlay();
    container.classList.add('hidden');
    container.querySelectorAll('.modal').forEach(modal => modal.classList.add('hidden'));
    document.getElementById('app').inert = false;
    returnFocus?.focus();
}

export function initDialogs() {
    document.addEventListener('keydown', event => {
        const container = overlay();
        if (container.classList.contains('hidden')) return;
        const modal = container.querySelector('.modal:not(.hidden)');
        if (!modal) return;
        if (event.key === 'Escape' && modal.id !== 'join-modal') {
            event.preventDefault();
            closeModal();
        }
        if (event.key === 'Tab') {
            const controls = [...modal.querySelectorAll('a[href], button, input, select, [tabindex]')]
                .filter(el => !el.disabled && el.tabIndex >= 0 && el.getClientRects().length);
            const first = controls[0], last = controls.at(-1);
            if ((event.shiftKey && document.activeElement === first) || (!event.shiftKey && document.activeElement === last) || !modal.contains(document.activeElement)) {
                event.preventDefault();
                (event.shiftKey ? last : first)?.focus();
            }
        }
    });
    openModal('join-modal');
}
