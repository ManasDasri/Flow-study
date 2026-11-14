// What the room page's parts share about the room you're in. One object, so every
// module reads the same values and none keeps a stale copy.
import type { Participants } from '../types';

export const here = {
    id: '',
    code: '',
    pin: '',
    listed: false, // this room is on the study-groups board, and we are its host
    isHost: false, // we host this room, so we may remove people, hand it over, or end it
    isActing: false, // the host stepped away and we host for now (sql/012): we keep the listing current
    hostAway: false,
    hostId: '', // whoever hosts right now: the host, someone standing in, or nobody
    enteredAt: 0,
    username: '',
    busy: false, // joining or creating a room
    leaving: false
};

// Everyone else here, by user id.
export const partners: Participants = {};
// Departures waiting out their grace period (room.ts), and when each person was last heard from.
export const pendingLeaves: Record<string, ReturnType<typeof setTimeout>> = {};
export const lastHeard: Record<string, number> = {};
// People inside their leave grace period are already gone as far as the room is concerned.
export const peopleHere = () => Object.keys(partners).filter(id => !(id in pendingLeaves)).length + 1;
