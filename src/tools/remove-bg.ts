import { existsSync, renameSync } from 'node:fs';
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
	cleanup,
	getBorderColor,
	getDimensions,
	removeBackground,
	removeBackgroundBorderOnly,
	squarify,
	trim,
} from '../lib/magick.js';
import { getFileInfo, normalizePath } from '../lib/paths.js';
import {
	confirm as promptConfirm,
	number as promptNumber,
} from '../lib/prompts.js';

/**
 * Remove solid background from image
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
	const output = `${fileInfo.dirname}/${fileInfo.filename}_nobg.png`;
	const tempFile = `${fileInfo.dirname}/${fileInfo.filename}_temp.png`;

	header('PicLet Remove Background');

	// Get original dimensions
	wip('Analyzing image...');
	const dims = await getDimensions(input);
	if (!dims) {
		wipDone(false, 'Failed to read image');
		return false;
	}

	// Detect border color
	const borderColor = await getBorderColor(input);
	wipDone(true, `Size: ${dims[0]}x${dims[1]}`);

	if (borderColor) {
		info(`Detected border color: ${borderColor}`);
	}

	// Options
	console.log('');
	console.log(`${BOLD}Fuzz Value:${RESET} Controls color matching strictness`);
	console.log(`  ${DIM}0-10%   = Only exact or very similar colors${RESET}`);
	console.log(`  ${DIM}10-30%  = Somewhat similar colors${RESET}`);
	console.log(`  ${DIM}30-70%  = Aggressive removal${RESET}`);
	console.log(`  ${DIM}70-100% = May affect non-background areas${RESET}`);
	console.log('');

	let fuzz = await promptNumber('Fuzz value (0-100)', 10, 0, 100);
	if (fuzz < 0 || fuzz > 100) {
		warn('Invalid fuzz value, using 10');
		fuzz = 10;
	}

	console.log('');
	const doTrim = await promptConfirm(
		'Trim transparent edges after removal?',
		true,
	);

	console.log('');
	const preserveInner = await promptConfirm(
		'Preserve inner areas of same color? (border-only removal)',
		false,
	);

	console.log('');
	const makeSquare = await promptConfirm(
		'Make output square with transparent padding?',
		false,
	);

	// Process image
	console.log('');
	wip('Removing background...');

	let bgRemoved = false;
	if (preserveInner && borderColor) {
		// Flood-fill from edges only
		bgRemoved = await removeBackgroundBorderOnly(
			input,
			tempFile,
			borderColor,
			fuzz,
		);
		if (!bgRemoved) {
			warn('Border-only removal failed, using standard method');
		}
	}

	if (!bgRemoved && borderColor) {
		// Standard: remove all matching pixels
		bgRemoved = await removeBackground(input, tempFile, borderColor, fuzz);
	}

	if (!bgRemoved) {
		wipDone(false, 'Background removal failed');
		cleanup(tempFile);
		return false;
	}
	wipDone(true, 'Background removed');

	// Trim if requested
	if (doTrim) {
		wip('Trimming transparent edges...');
		if (await trim(tempFile, output)) {
			wipDone(true, 'Trimmed');
			cleanup(tempFile);
		} else {
			wipDone(false, 'Trim failed, keeping untrimmed');
			renameSync(tempFile, output);
		}
	} else {
		renameSync(tempFile, output);
	}

	// Make square if requested
	if (makeSquare) {
		wip('Making square...');
		const tempSquare = `${fileInfo.dirname}/${fileInfo.filename}_square_temp.png`;
		if (await squarify(output, tempSquare)) {
			renameSync(tempSquare, output);
			wipDone(true, 'Made square');
		} else {
			wipDone(false, 'Square padding failed');
			cleanup(tempSquare);
		}
	}

	// Final dimensions
	const finalDims = await getDimensions(output);

	console.log('');
	if (finalDims) {
		success(`Output: ${output} (${finalDims[0]}x${finalDims[1]})`);
	} else {
		success(`Output: ${output}`);
	}
	return true;
}

export const config = {
	id: 'remove-bg',
	name: 'PicLet: Remove Background',
	icon: 'removebg.ico',
	extensions: ['.png'],
};
