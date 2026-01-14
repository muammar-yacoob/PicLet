import figlet from 'figlet';
import gradient from 'gradient-string';

const GRADIENT_COLORS = ['#00ffff', '#00d4ff', '#a855f7', '#ec4899'];

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
export function showBanner(
	subtitle = 'Image manipulation utility toolkit with Windows shell integration',
): void {
	try {
		console.log(`\n${renderLogo()}`);
		if (subtitle) {
			const subtleGradient = gradient(['#a8a8a8', '#d4d4d4']);
			console.log(subtleGradient(`  ${subtitle}\n`));
		}
	} catch {
		// Fallback if rendering fails
		console.log('\n\x1b[1mPicLet\x1b[0m');
		if (subtitle) {
			console.log(`\x1b[2m  ${subtitle}\x1b[0m\n`);
		}
	}
}
