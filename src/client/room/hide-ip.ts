// Hiding your IP address in calls (relay only). Your own choice wins; otherwise it is on
// in groups from the public board, where the others are usually strangers, and off in
// rooms you were invited to. The room's real status decides the default, however you
// arrived: a listed room is full of strangers even if you came in by code.
import { notify } from '../modules/feedback';
import { removePeer, setHideIp, whenRelayUnavailable } from '../modules/rtc';
import supabase from '../modules/supabase';
import { here, partners } from './state';

let fromBoard = false;
let choice: boolean | null = (() => { try { const saved = localStorage.getItem('flow_hide_ip'); return saved === null ? null : saved === '1'; } catch { return null; } })();
let hiding: boolean | null = null;
export const hidingIp = () => choice ?? fromBoard;
whenRelayUnavailable(() => notify('Calls are waiting for the relay server, which hides your IP address. To connect directly instead, turn off “Hide my IP address” in timer settings.', 'error'));

// Set before joining: did this visit come from the board?
export const setFromBoard = (yes: boolean) => { fromBoard = yes; };

// Applies the current answer. Changing it reconnects calls.
export function applyHideIp() {
    const before = hiding;
    hiding = hidingIp();
    setHideIp(hiding);
    if (before !== null && before !== hiding) Object.keys(partners).forEach(removePeer);
}

// The room is on the board after all (we listed it, or the database says so): strangers may join.
export function markListed() {
    if (fromBoard) return;
    fromBoard = true;
    applyHideIp();
}
export async function checkListed() {
    const { data } = await supabase.rpc('room_listed', { p_room: here.id });
    if (data === true) markListed();
}

// From timer settings. Saved for later visits where the browser allows.
export function chooseHideIp(on: boolean) {
    try { localStorage.setItem('flow_hide_ip', on ? '1' : '0'); } catch { /* Private mode: this visit only. */ }
    choice = on;
    applyHideIp(); // the three-second check calls everyone back
}
