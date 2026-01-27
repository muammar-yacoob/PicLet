import chalk from 'chalk';
import figlet from 'figlet';
import gradient from 'gradient-string';

const GRADIENT_COLORS = ['#22c55e', '#84cc16', '#eab308', '#fcd34d'];

/**
 * Render the PicLet ASCII art logo with gradient colors
 */
function renderLogo(): string {
	const ascii = figlet.textSync('PicLet', {
		font: 'Slant',
		horizontalLayout: 'default',
	});
	return gradient(GRADIENT_COLORS)(ascii);
}

/**
 * Display the PicLet banner with gradient colors
 */
const SUBTITLE_COLOR = '#eab308'; // first yellow from gradient

export function showBanner(
	subtitle = 'Image manipulation utility toolkit with Windows shell integration',
): void {
	try {
		console.log(`\n${renderLogo()}`);
		if (subtitle) {
			console.log(chalk.hex(SUBTITLE_COLOR)(`${subtitle}\n`));
		}
	} catch {
		// Fallback if rendering fails
		console.log('\n\x1b[1mPicLet\x1b[0m');
		if (subtitle) {
			// #eab308 = rgb(234, 179, 8)
			console.log(`\x1b[38;2;234;179;8m${subtitle}\x1b[0m\n`);
		}
	}
}
