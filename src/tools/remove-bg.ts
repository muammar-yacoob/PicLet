import { existsSync, readFileSync, renameSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { loadConfig } from '../lib/config.js';
import { startGuiServer } from '../lib/gui-server.js';
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
	extractFirstFrame,
	getBorderColor,
	getDimensions,
	isMultiFrame,
	removeBackground,
	removeBackgroundBorderOnly,
	squarify,
	trim,
} from '../lib/magick.js';
import { getFileInfo, normalizePath } from '../lib/paths.js';
import {
	confirm as promptConfirm,
	isUsingDefaults,
	number as promptNumber,
	pauseOnError,
} from '../lib/prompts.js';

/** Processing options for remove-bg */
interface ProcessOptions {
	fuzz: number;
	doTrim: boolean;
	preserveInner: boolean;
	makeSquare: boolean;
}

/**
 * Core processing logic for background removal
 */
async function processImage(
	input: string,
	borderColor: string | null,
	options: ProcessOptions,
): Promise<boolean> {
	const fileInfo = getFileInfo(input);
	// Preserve original extension for GIF files, use PNG for others
	const outputExt = fileInfo.extension.toLowerCase() === '.gif' ? '.gif' : '.png';
	const output = `${fileInfo.dirname}/${fileInfo.filename}_nobg${outputExt}`;
	const tempFile = `${fileInfo.dirname}/${fileInfo.filename}_temp${outputExt}`;

	wip('Removing background...');

	let bgRemoved = false;
	if (options.preserveInner && borderColor) {
		bgRemoved = await removeBackgroundBorderOnly(
			input,
			tempFile,
			borderColor,
			options.fuzz,
		);
		if (!bgRemoved) {
			warn('Border-only removal failed, using standard method');
		}
	}

	if (!bgRemoved && borderColor) {
		bgRemoved = await removeBackground(input, tempFile, borderColor, options.fuzz);
	}

	if (!bgRemoved) {
		wipDone(false, 'Background removal failed');
		cleanup(tempFile);
		return false;
	}
	wipDone(true, 'Background removed');

	// Trim if requested
	if (options.doTrim) {
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
	if (options.makeSquare) {
		wip('Making square...');
		const tempSquare = `${fileInfo.dirname}/${fileInfo.filename}_square_temp${outputExt}`;
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

/**
 * Collect options via CLI prompts
 */
async function collectOptionsCLI(): Promise<ProcessOptions> {
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

	return { fuzz, doTrim, preserveInner, makeSquare };
}


/**
 * Remove solid background from image (CLI mode)
 */
export async function run(inputRaw: string): Promise<boolean> {
	// Check dependencies
	if (!(await checkImageMagick())) {
		error('ImageMagick not found. Please install it:');
		console.log('  sudo apt update && sudo apt install imagemagick');
		await pauseOnError();
		return false;
	}

	// Normalize path
	const input = normalizePath(inputRaw);

	if (!existsSync(input)) {
		error(`File not found: ${input}`);
		await pauseOnError();
		return false;
	}

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

	// Collect options via CLI or TUI
	const options = await collectOptionsCLI();

	console.log('');
	return processImage(input, borderColor, options);
}

/**
 * Remove solid background from image (GUI mode)
 */
export async function runGUI(inputRaw: string): Promise<boolean> {
	// Normalize path
	const input = normalizePath(inputRaw);

	if (!existsSync(input)) {
		error(`File not found: ${input}`);
		return false;
	}

	// Get original dimensions
	const dims = await getDimensions(input);
	if (!dims) {
		error('Failed to read image dimensions');
		return false;
	}

	// Detect border color
	const borderColor = await getBorderColor(input);

	// Load config defaults
	const config = loadConfig();
	const defaults = config.removeBg;

	// Start GUI server
	return startGuiServer({
		htmlFile: 'remove-bg.html',
		title: 'PicLet - Remove Background',
		imageInfo: {
			filePath: input,
			fileName: basename(input),
			width: dims[0],
			height: dims[1],
			borderColor,
		},
		defaults: {
			fuzz: defaults.fuzz,
			trim: defaults.trim,
			preserveInner: defaults.preserveInner,
			makeSquare: defaults.makeSquare,
		},
		onPreview: async (opts) => {
			const options: ProcessOptions = {
				fuzz: (opts.fuzz as number) ?? defaults.fuzz,
				doTrim: (opts.trim as boolean) ?? defaults.trim,
				preserveInner: (opts.preserveInner as boolean) ?? defaults.preserveInner,
				makeSquare: (opts.makeSquare as boolean) ?? defaults.makeSquare,
			};
			return generatePreview(input, borderColor, options);
		},
		onProcess: async (opts) => {
			const logs: Array<{ type: string; message: string }> = [];

			// Check dependencies
			if (!(await checkImageMagick())) {
				return {
					success: false,
					error: 'ImageMagick not found',
					logs: [{ type: 'error', message: 'ImageMagick not found. Install with: sudo apt install imagemagick' }],
				};
			}

			logs.push({ type: 'info', message: `Processing ${basename(input)}...` });

			const options: ProcessOptions = {
				fuzz: (opts.fuzz as number) ?? defaults.fuzz,
				doTrim: (opts.trim as boolean) ?? defaults.trim,
				preserveInner: (opts.preserveInner as boolean) ?? defaults.preserveInner,
				makeSquare: (opts.makeSquare as boolean) ?? defaults.makeSquare,
			};

			const fileInfo = getFileInfo(input);
			const output = `${fileInfo.dirname}/${fileInfo.filename}_nobg.png`;

			// Process the image
			logs.push({ type: 'info', message: 'Removing background...' });

			const success = await processImageSilent(input, borderColor, options, logs);

			if (success) {
				const finalDims = await getDimensions(output);
				const sizeStr = finalDims ? ` (${finalDims[0]}x${finalDims[1]})` : '';
				return {
					success: true,
					output: `${basename(output)}${sizeStr}`,
					logs,
				};
			}

			return {
				success: false,
				error: 'Processing failed',
				logs,
			};
		},
	});
}

/**
 * Silent version of processImage for GUI mode (logs to array instead of console)
 */
async function processImageSilent(
	input: string,
	borderColor: string | null,
	options: ProcessOptions,
	logs: Array<{ type: string; message: string }>,
): Promise<boolean> {
	const fileInfo = getFileInfo(input);
	// Preserve original extension for GIF files, use PNG for others
	const outputExt = fileInfo.extension.toLowerCase() === '.gif' ? '.gif' : '.png';
	const output = `${fileInfo.dirname}/${fileInfo.filename}_nobg${outputExt}`;
	const tempFile = `${fileInfo.dirname}/${fileInfo.filename}_temp${outputExt}`;

	let bgRemoved = false;
	if (options.preserveInner && borderColor) {
		bgRemoved = await removeBackgroundBorderOnly(
			input,
			tempFile,
			borderColor,
			options.fuzz,
		);
		if (!bgRemoved) {
			logs.push({ type: 'warn', message: 'Border-only removal failed, using standard method' });
		}
	}

	if (!bgRemoved && borderColor) {
		bgRemoved = await removeBackground(input, tempFile, borderColor, options.fuzz);
	}

	if (!bgRemoved) {
		logs.push({ type: 'error', message: 'Background removal failed' });
		cleanup(tempFile);
		return false;
	}
	logs.push({ type: 'success', message: 'Background removed' });

	// Trim if requested
	if (options.doTrim) {
		logs.push({ type: 'info', message: 'Trimming transparent edges...' });
		if (await trim(tempFile, output)) {
			logs.push({ type: 'success', message: 'Trimmed' });
			cleanup(tempFile);
		} else {
			logs.push({ type: 'warn', message: 'Trim failed, keeping untrimmed' });
			renameSync(tempFile, output);
		}
	} else {
		renameSync(tempFile, output);
	}

	// Make square if requested
	if (options.makeSquare) {
		logs.push({ type: 'info', message: 'Making square...' });
		const tempSquare = `${fileInfo.dirname}/${fileInfo.filename}_square_temp${outputExt}`;
		if (await squarify(output, tempSquare)) {
			renameSync(tempSquare, output);
			logs.push({ type: 'success', message: 'Made square' });
		} else {
			logs.push({ type: 'warn', message: 'Square padding failed' });
			cleanup(tempSquare);
		}
	}

	return true;
}

/**
 * Generate preview image as base64 data URL
 */
async function generatePreview(
	input: string,
	borderColor: string | null,
	options: ProcessOptions,
): Promise<{ success: boolean; imageData?: string; width?: number; height?: number; error?: string }> {
	const tempDir = tmpdir();
	const timestamp = Date.now();
	const tempSource = join(tempDir, `piclet-preview-${timestamp}-src.png`);
	const tempFile = join(tempDir, `piclet-preview-${timestamp}.png`);
	const tempOutput = join(tempDir, `piclet-preview-${timestamp}-out.png`);

	try {
		// For GIFs, extract first frame only for fast preview
		let previewInput = input;
		if (isMultiFrame(input)) {
			if (!(await extractFirstFrame(input, tempSource))) {
				return { success: false, error: 'Failed to extract frame' };
			}
			previewInput = tempSource;
		}

		// Remove background
		let bgRemoved = false;
		if (options.preserveInner && borderColor) {
			bgRemoved = await removeBackgroundBorderOnly(previewInput, tempFile, borderColor, options.fuzz);
		}
		if (!bgRemoved && borderColor) {
			bgRemoved = await removeBackground(previewInput, tempFile, borderColor, options.fuzz);
		}
		if (!bgRemoved) {
			cleanup(tempSource);
			return { success: false, error: 'Background removal failed' };
		}

		// Trim if requested
		let currentFile = tempFile;
		if (options.doTrim) {
			if (await trim(tempFile, tempOutput)) {
				cleanup(tempFile);
				currentFile = tempOutput;
			}
		}

		// Make square if requested
		if (options.makeSquare) {
			const squareFile = join(tempDir, `piclet-preview-${timestamp}-sq.png`);
			if (await squarify(currentFile, squareFile)) {
				cleanup(currentFile);
				currentFile = squareFile;
			}
		}

		// Read as base64
		const buffer = readFileSync(currentFile);
		const base64 = buffer.toString('base64');
		const imageData = `data:image/png;base64,${base64}`;

		// Get dimensions
		const dims = await getDimensions(currentFile);

		// Cleanup
		cleanup(currentFile, tempFile, tempOutput, tempSource);

		return {
			success: true,
			imageData,
			width: dims?.[0],
			height: dims?.[1],
		};
	} catch (err) {
		cleanup(tempFile, tempOutput, tempSource);
		return { success: false, error: (err as Error).message };
	}
}

export const config = {
	id: 'remove-bg',
	name: 'Remove Background',
	icon: 'removebg.ico',
	extensions: ['.png', '.jpg', '.jpeg', '.ico', '.gif'],
};
