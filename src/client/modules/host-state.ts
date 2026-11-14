// Who hosts a room, what to tell people when that changes, and how the personal
// "be right back" state reads. Decisions only: no database, no DOM, so each one is
// unit-tested (scripts/host-state.test.cjs) and room.ts just carries them out.

export interface HostState {
    hostId: string; // whoever hosts right now: the host, someone standing in, or nobody
    hostAway: boolean; // the host stepped away (sql/012)
    isHost: boolean; // we are the host: we may remove people, hand the room on, or end it
    isActing: boolean; // we stand in while the host is away: shown as host, without those powers
}
type RoomRow = { created_by?: string | null; host_away?: boolean | null; acting_host?: string | null } | null | undefined;

export function resolveHost(row: RoomRow, me: string | undefined): HostState {
    const owner = row?.created_by ?? '';
    const hostAway = !!owner && !!row?.host_away;
    const acting = hostAway ? row?.acting_host ?? '' : '';
    return {
        hostId: hostAway ? acting : owner,
        hostAway,
        isHost: !!owner && owner === me && !hostAway,
        isActing: !!acting && acting === me
    };
}

// What changed, in words. `note` goes in the notification list; `toast` is shown
// too when it concerns us; `becameHost` means the board listing may now be ours.
export function hostChangeNote(before: HostState, after: HostState, who: string): { note: string; toast?: string; becameHost?: boolean } | null {
    if (before.hostId === after.hostId && before.hostAway === after.hostAway) return null;
    if (after.isActing) return { note: 'You’re the room host for now.', toast: 'You’re the room host for now. The host gets the role back when they return.' };
    if (after.isHost) return before.isHost ? null : { note: 'You’re the host now.', toast: 'You’re the host now. You can remove people, and hand the room on when you leave.', becameHost: true };
    if (after.hostAway && !after.hostId) return { note: before.isActing ? 'You’re no longer hosting.' : 'The host stepped away. The room stays open.' };
    if (after.hostAway) return { note: `${who} is hosting for now.` };
    if (before.hostAway) return { note: `${who} is back and hosting again.` };
    return { note: `${who} is the host now.` };
}

// The "be right back" button and status, which depend on whether a focus block is running.
export function awayCopy(away: boolean, focusRunning: boolean) {
    return {
        status: focusRunning ? 'Stepped away' : 'Back for the next block',
        button: away ? 'I’m back' : focusRunning ? 'Be right back' : 'Back next block',
        hint: away ? 'Let the room know you’re back.'
            : focusRunning ? 'Dims your tile and pauses your focus time. The room’s timer keeps going.'
            : 'Need a longer break? The room can start the next block without you.'
    };
}

export function welcomeBack(timer: { mode: string; isRunning: boolean; timeLeft: number } | null) {
    if (!timer) return null;
    if (timer.isRunning && timer.mode === 'focus') return `Welcome back. ${Math.ceil(timer.timeLeft / 60)} min left in this block.`;
    return timer.isRunning ? 'Welcome back. The room is on a break.' : 'Welcome back.';
}
