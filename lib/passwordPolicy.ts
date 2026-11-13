// One place for the password rule, used by BOTH the server (which enforces it)
// and the admin screen (which only uses it to disable the button early and show a
// hint). Keeping a single number means the screen and the server can never
// disagree. No secrets here, so it is safe to ship to the browser.
//
// Applies when an admin creates an employee or resets a password. Existing
// passwords are not touched and keep working.

export const MIN_PASSWORD_LENGTH = 8
