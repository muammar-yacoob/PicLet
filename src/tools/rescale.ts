import { existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
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
	getDimensions,
	isMultiFrame,
	resize,
	scaleWithPadding,
} from '../lib/magick.js';
import { getFileInfo, normalizePath } from '../lib/paths.js';
import {
	confirm as promptConfirm,
	number as promptNumber,
	pauseOnError,
} from '../lib/prompts.js';

/** Processing options for rescale */
interface ProcessOptions {
	width: number;
	height: number;
	makeSquare: boolean;
}

/**
 * Scale image with optional padding
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

/**
 * Scale image (GUI mode)
 */
export async function runGUI(inputRaw: string): Promise<boolean> {
	const input = normalizePath(inputRaw);

	if (!existsSync(input)) {
		error(`File not found: ${input}`);
		return false;
	}

	const dims = await getDimensions(input);
	if (!dims) {
		error('Failed to read image dimensions');
		return false;
	}

	const fileInfo = getFileInfo(input);

	return startGuiServer({
		htmlFile: 'rescale.html',
		title: 'PicLet - Scale Image',
		imageInfo: {
			filePath: input,
			fileName: basename(input),
			width: dims[0],
			height: dims[1],
			borderColor: null,
		},
		defaults: {
			makeSquare: false,
		},
		onPreview: async (opts) => {
			const options: ProcessOptions = {
				width: (opts.width as number) ?? Math.round(dims[0] / 2),
				height: (opts.height as number) ?? Math.round(dims[1] / 2),
				makeSquare: (opts.makeSquare as boolean) ?? false,
			};
			return generatePreview(input, options);
		},
		onProcess: async (opts) => {
			const logs: Array<{ type: string; message: string }> = [];

			if (!(await checkImageMagick())) {
				return {
					success: false,
					error: 'ImageMagick not found',
					logs: [{ type: 'error', message: 'ImageMagick not found' }],
				};
			}

			const options: ProcessOptions = {
				width: (opts.width as number) ?? Math.round(dims[0] / 2),
				height: (opts.height as number) ?? Math.round(dims[1] / 2),
				makeSquare: (opts.makeSquare as boolean) ?? false,
			};

			logs.push({ type: 'info', message: `Scaling to ${options.width}x${options.height}...` });

			const output = `${fileInfo.dirname}/${fileInfo.filename}_scaled${fileInfo.extension}`;
			let scaled = false;

			if (options.makeSquare) {
				const maxDim = Math.max(options.width, options.height);
				scaled = await scaleWithPadding(input, output, maxDim, maxDim);
			} else {
				scaled = await resize(input, output, options.width, options.height);
			}

			if (scaled && existsSync(output)) {
				const finalDims = await getDimensions(output);
				const sizeStr = finalDims ? ` (${finalDims[0]}x${finalDims[1]})` : '';
				logs.push({ type: 'success', message: 'Scaled successfully' });
				return {
					success: true,
					output: `${basename(output)}${sizeStr}`,
					logs,
				};
			}

			logs.push({ type: 'error', message: 'Scaling failed' });
			return { success: false, error: 'Scaling failed', logs };
		},
	});
}

/**
 * Generate preview image as base64 data URL
 */
async function generatePreview(
	input: string,
	options: ProcessOptions,
): Promise<{ success: boolean; imageData?: string; width?: number; height?: number; error?: string }> {
	const tempDir = tmpdir();
	const timestamp = Date.now();
	const tempSource = join(tempDir, `piclet-preview-${timestamp}-src.png`);
	const tempOutput = join(tempDir, `piclet-preview-${timestamp}.png`);

	try {
		// For GIFs, extract first frame only for fast preview
		let previewInput = input;
		if (isMultiFrame(input)) {
			if (!(await extractFirstFrame(input, tempSource))) {
				return { success: false, error: 'Failed to extract frame' };
			}
			previewInput = tempSource;
		}

		let scaled = false;
		let targetW = options.width;
		let targetH = options.height;

		if (options.makeSquare) {
			const maxDim = Math.max(targetW, targetH);
			targetW = maxDim;
			targetH = maxDim;
			scaled = await scaleWithPadding(previewInput, tempOutput, targetW, targetH);
		} else {
			scaled = await resize(previewInput, tempOutput, targetW, targetH);
		}

		if (!scaled || !existsSync(tempOutput)) {
			cleanup(tempSource);
			return { success: false, error: 'Scaling failed' };
		}

		const buffer = readFileSync(tempOutput);
		const base64 = buffer.toString('base64');
		const imageData = `data:image/png;base64,${base64}`;

		const dims = await getDimensions(tempOutput);
		cleanup(tempSource, tempOutput);

		return {
			success: true,
			imageData,
			width: dims?.[0],
			height: dims?.[1],
		};
	} catch (err) {
		cleanup(tempSource, tempOutput);
		return { success: false, error: (err as Error).message };
	}
}

export const config = {
	id: 'rescale',
	name: 'Scale Image',
	icon: 'rescale.ico',
	extensions: ['.png', '.jpg', '.jpeg', '.gif', '.bmp'],
};
