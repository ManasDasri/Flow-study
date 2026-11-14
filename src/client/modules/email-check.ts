// Catches the slips that would send a verification email nowhere: "gmial.com" for
// "gmail.com" and the like. A suggestion only; the verification email is what
// actually proves an address is real.
const FIXES: Record<string, string> = {
    'gmial.com': 'gmail.com', 'gmai.com': 'gmail.com', 'gmal.com': 'gmail.com', 'gamil.com': 'gmail.com',
    'gnail.com': 'gmail.com', 'gmail.co': 'gmail.com', 'gmail.con': 'gmail.com', 'gmaill.com': 'gmail.com',
    'hotmial.com': 'hotmail.com', 'hotmal.com': 'hotmail.com', 'hotmail.co': 'hotmail.com',
    'yahooo.com': 'yahoo.com', 'yaho.com': 'yahoo.com', 'yahoo.co': 'yahoo.com',
    'outlok.com': 'outlook.com', 'outloook.com': 'outlook.com', 'outlook.co': 'outlook.com',
    'icloud.co': 'icloud.com', 'iclod.com': 'icloud.com'
};

export const looksLikeEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);

export function suggestEmail(email: string): string | null {
    const at = email.lastIndexOf('@');
    if (at < 1) return null;
    const fix = FIXES[email.slice(at + 1).toLowerCase()];
    return fix ? email.slice(0, at + 1) + fix : null;
}
