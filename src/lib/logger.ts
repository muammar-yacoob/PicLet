/**
 * Colored console output utilities
 */

// ANSI color codes
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const CYAN = '\x1b[36m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';

// Status symbols
const CHECK = '✓';
const CROSS = '✗';
const ARROW = '→';
const BULLET = '•';
const SPINNER = '⠋';

/** Print success message with checkmark */
export function success(message: string): void {
	console.log(`${GREEN}${CHECK}${RESET} ${message}`);
}

/** Print error message with X */
export function error(message: string): void {
	console.log(`${RED}${CROSS}${RESET} ${message}`);
}

/** Print warning message */
export function warn(message: string): void {
	console.log(`${YELLOW}${BULLET}${RESET} ${message}`);
}

/** Print info message */
export function info(message: string): void {
	console.log(`${BLUE}${ARROW}${RESET} ${message}`);
}

/** Print step message (for multi-step processes) */
export function step(message: string): void {
	console.log(`${CYAN}${BULLET}${RESET} ${message}`);
}

/** Print header with separator */
export function header(title: string): void {
	console.log('');
	console.log(`${BOLD}${title}${RESET}`);
	console.log(`${DIM}${'─'.repeat(40)}${RESET}`);
}

/** Print separator line */
export function separator(): void {
	console.log(`${DIM}${'─'.repeat(40)}${RESET}`);
}

/** Work-in-progress indicator (inline, no newline) */
export function wip(message: string): void {
	process.stdout.write(`${YELLOW}${SPINNER}${RESET} ${message}`);
}

/** Complete a WIP indicator with result */
export function wipDone(isSuccess: boolean, message: string): void {
	// Clear line and print result
	process.stdout.write('\r\x1b[K');
	if (isSuccess) {
		success(message);
	} else {
		error(message);
	}
}

/** Clear current line */
export function clearLine(): void {
	process.stdout.write('\r\x1b[K');
}

export { RESET, BOLD, DIM, GREEN, RED, YELLOW, BLUE, CYAN };
