import { existsSync } from 'node:fs';
import {
	BOLD,
	DIM,
	RESET,
	error,
	header,
	info,
	success,
	warn,
	wip,
	wipDone,
} from '../lib/logger.js';
import {
	checkImageMagick,
	getDimensions,
	resize,
	scaleWithPadding,
} from '../lib/magick.js';
import { getFileInfo, normalizePath } from '../lib/paths.js';
import {
	confirm as promptConfirm,
	number as promptNumber,
} from '../lib/prompts.js';

/**
 * Scale image with optional padding
 */
export async function run(inputRaw: string): Promise<boolean> {
	// Check dependencies
	if (!(await checkImageMagick())) {
		error('ImageMagick not found. Please install it:');
		console.log('  sudo apt update && sudo apt install imagemagick');
		return false;
	}

	// Normalize path
	const input = normalizePath(inputRaw);

	if (!existsSync(input)) {
		error(`File not found: ${input}`);
		return false;
	}

	// Get file info
	const fileInfo = getFileInfo(input);
	const output = `${fileInfo.dirname}/${fileInfo.filename}_scaled${fileInfo.extension}`;

	header('PicLet Scale Image');

	// Get original dimensions
	wip('Reading image dimensions...');
	const dims = await getDimensions(input);
	if (!dims) {
		wipDone(false, 'Failed to read image');
		return false;
	}
	const [origW, origH] = dims;
	wipDone(true, `Original size: ${origW}x${origH}`);

	// Check if image is square
	if (origW !== origH) {
		warn(`Image is not square (${origW}x${origH})`);
	}

	console.log('');
	console.log(`${BOLD}Scaling Options:${RESET}`);
	console.log(
		`  ${DIM}Enter 0 for auto-calculate based on other dimension${RESET}`,
	);
	console.log(
		`  ${DIM}Enter single number for both to make square output${RESET}`,
	);
	console.log('');

	// Get target dimensions
	let targetW = await promptNumber('Width (0 for auto)', 0, 0);
	let targetH = await promptNumber('Height (0 for auto)', 0, 0);

	// Determine scaling mode
	let makeSquare = false;

	if (targetW === 0 && targetH === 0) {
		// Default: scale to 50%
		targetW = Math.floor(origW / 2);
		targetH = Math.floor(origH / 2);
		info(`Using default: 50% scale (${targetW}x${targetH})`);
	} else if (targetW > 0 && targetH === 0) {
		// Width specified, calculate height
		targetH = Math.floor((targetW * origH) / origW);
		info(`Calculated height: ${targetH}`);
	} else if (targetW === 0 && targetH > 0) {
		// Height specified, calculate width
		targetW = Math.floor((targetH * origW) / origH);
		info(`Calculated width: ${targetW}`);
	}

	// Ask about square padding
	console.log('');
	makeSquare = await promptConfirm(
		'Make output square with transparent padding?',
		false,
	);

	if (makeSquare) {
		const maxDim = Math.max(targetW, targetH);
		targetW = maxDim;
		targetH = maxDim;
		info(`Output will be ${targetW}x${targetH} (square with padding)`);
	}

	console.log('');
	wip('Scaling image...');

	let scaled = false;
	if (makeSquare) {
		// Scale and add transparent padding for square output
		scaled = await scaleWithPadding(input, output, targetW, targetH);
	} else {
		// Standard resize
		scaled = await resize(input, output, targetW, targetH);
	}

	if (!scaled || !existsSync(output)) {
		wipDone(false, 'Scaling failed');
		return false;
	}

	// Get final dimensions
	const finalDims = await getDimensions(output);
	if (finalDims) {
		wipDone(true, `Scaled to ${finalDims[0]}x${finalDims[1]}`);
	} else {
		wipDone(true, 'Scaled');
	}

	console.log('');
	success(`Output: ${output}`);
	return true;
}

export const config = {
	id: 'rescale',
	name: 'PicLet: Scale Image',
	icon: 'rescale.ico',
	extensions: ['.png', '.jpg', '.jpeg', '.gif', '.bmp'],
};
