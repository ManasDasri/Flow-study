import supabase from './supabase.js';

export const getMyProfile = async (userId) => {
    const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
    if (error) {
        console.error('Failed to load profile:', error.message);
        return null;
    }
    return data;
};

export const saveDisplayName = async (userId, displayName) => {
    const { error } = await supabase.from('profiles').upsert({
        id: userId,
        display_name: displayName,
        updated_at: new Date().toISOString()
    });
    if (error) {
        console.error('Failed to save profile:', error.message);
        return false;
    }
    return true;
};

// Consecutive calendar days (local time) with at least one completed
// session, counting back from today. A day with no session yet is only a
// streak-breaker once "today" has fully passed, so an active streak still
// shows correctly before the user's first session of the day.
const computeStreak = (localDateStrings) => {
    const days = new Set(localDateStrings);
    const cursor = new Date();
    cursor.setHours(0, 0, 0, 0);

    if (!days.has(cursor.toDateString())) {
        cursor.setDate(cursor.getDate() - 1);
    }

    let streak = 0;
    while (days.has(cursor.toDateString())) {
        streak++;
        cursor.setDate(cursor.getDate() - 1);
    }
    return streak;
};

export const getStats = async (userId) => {
    const [{ data: sessions }, { count: tasksCompleted }] = await Promise.all([
        supabase.from('sessions').select('duration_seconds, completed_at').eq('user_id', userId),
        supabase.from('tasks').select('id', { count: 'exact', head: true }).eq('created_by', userId).eq('completed', true)
    ]);

    const rows = sessions || [];
    const totalMinutes = Math.floor(rows.reduce((acc, r) => acc + r.duration_seconds, 0) / 60);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayMinutes = Math.floor(
        rows.filter(r => new Date(r.completed_at) >= today).reduce((acc, r) => acc + r.duration_seconds, 0) / 60
    );

    const streak = computeStreak(rows.map(r => new Date(r.completed_at).toDateString()));

    return {
        totalMinutes,
        todayMinutes,
        streak,
        sessionsCompleted: rows.length,
        tasksCompleted: tasksCompleted || 0
    };
};
