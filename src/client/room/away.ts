// Stepping away: a quiet personal state. Your tile dims and your focus time pauses,
// while the room's sun carries on untouched. Nobody is told, and nobody waits for you.
import type { TimerState } from '../types';
import { byId } from '../dom';
import { awayCopy, welcomeBack } from '../modules/host-state';
import { notify } from '../modules/feedback';
import { setAway } from '../modules/presence';
import { getMyUserId } from '../modules/socket';
import { setAwayTile } from '../modules/stage';

let away = false;
let awaySince = 0;
let lastTimer: TimerState | null = null;
export const isAway = () => away;
const focusRunning = () => !!lastTimer?.isRunning && lastTimer.mode === 'focus';
const awayStatus = () => awayCopy(true, focusRunning()).status;
export function updateAwayButton() {
    const button = byId<HTMLButtonElement>('toggle-away');
    const copy = awayCopy(away, focusRunning());
    button.setAttribute('aria-pressed', String(away));
    button.textContent = copy.button;
    // Shown as a hint on hover and focus (room.css), and read out by screen readers.
    button.dataset.tip = copy.hint;
    button.setAttribute('aria-description', copy.hint);
}
export function setAwayState(on: boolean) {
    if (on === away) return;
    away = on;
    awaySince = Date.now();
    setAway(on ? awayStatus() : null);
    setAwayTile(getMyUserId(), on);
    updateAwayButton();
    const welcome = on ? null : welcomeBack(lastTimer);
    if (welcome) notify(welcome);
}
// Coming back to the keyboard, or to the tab, ends it, after a moment so a stray key doesn't.
const backOnReturn = (event: Event) => {
    if (away && Date.now() - awaySince > 15000 && !(event.target instanceof Element && event.target.closest('#toggle-away'))) setAwayState(false);
};
document.addEventListener('keydown', backOnReturn);
document.addEventListener('pointerdown', backOnReturn);
document.addEventListener('visibilitychange', event => { if (!document.hidden) backOnReturn(event); });


// Every tick of the room's timer: the away status and the button follow the clock.
export function awayTimer(state: TimerState) {
    lastTimer = state;
    if (away) setAway(awayStatus());
    updateAwayButton();
}
