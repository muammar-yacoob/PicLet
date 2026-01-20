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
	wip,
	wipDone,
} from '../lib/logger.js';
import {
	addBorder,
	checkImageMagick,
	cleanup,
	extractFirstFrame,
	getDimensions,
	isMultiFrame,
} from '../lib/magick.js';
import { getFileInfo, normalizePath } from '../lib/paths.js';
import {
	number as promptNumber,
	pauseOnError,
	text as promptText,
} from '../lib/prompts.js';

/** Processing options for border */
interface ProcessOptions {
	width: number;
	color: string;
}

/**
 * Core processing logic for border
 */
async function processImage(
	input: string,
	options: ProcessOptions,
): Promise<boolean> {
	const fileInfo = getFileInfo(input);
	const outputExt = fileInfo.extension.toLowerCase() === '.gif' ? '.gif' : '.png';
	const output = `${fileInfo.dirname}/${fileInfo.filename}_border${outputExt}`;

	wip(`Adding ${options.width}px ${options.color} border...`);

	const success = await addBorder(input, output, options.width, options.color);

	if (!success) {
		wipDone(false, 'Border failed');
		return false;
	}
	wipDone(true, 'Border added');

	const finalDims = await getDimensions(output);

	console.log('');
	if (finalDims) {
		console.log(`Output: ${output} (${finalDims[0]}x${finalDims[1]})`);
	} else {
		console.log(`Output: ${output}`);
	}
	return true;
}

/**
 * Collect options via CLI prompts
 */
async function collectOptionsCLI(): Promise<ProcessOptions> {
	console.log('');
	console.log(`${BOLD}Border Settings:${RESET}`);
	console.log(`  ${DIM}Width: How thick the border should be (in pixels)${RESET}`);
	console.log(`  ${DIM}Color: Hex color (#fff), named color (white), or rgb(...)${RESET}`);
	console.log('');

	let width = await promptNumber('Border width (px)', 10, 1, 200);
	if (width < 1) {
		width = 10;
	}

	console.log('');
	let color = await promptText('Border color', '#ffffff');
	if (!color) {
		color = '#ffffff';
	}

	return { width, color };
}

/**
 * Add border to image (CLI mode)
 */
export async function run(inputRaw: string): Promise<boolean> {
	if (!(await checkImageMagick())) {
		error('ImageMagick not found. Please install it:');
		console.log('  sudo apt update && sudo apt install imagemagick');
		await pauseOnError();
		return false;
	}

	const input = normalizePath(inputRaw);

	if (!existsSync(input)) {
		error(`File not found: ${input}`);
		await pauseOnError();
		return false;
	}

	header('PicLet Border');

	wip('Analyzing image...');
	const dims = await getDimensions(input);
	if (!dims) {
		wipDone(false, 'Failed to read image');
		return false;
	}
	wipDone(true, `Size: ${dims[0]}x${dims[1]}`);

	const options = await collectOptionsCLI();

	console.log('');
	return processImage(input, options);
}

/**
 * Add border to image (GUI mode)
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

	return startGuiServer({
		htmlFile: 'border.html',
		title: 'PicLet - Border',
		imageInfo: {
			filePath: input,
			fileName: basename(input),
			width: dims[0],
			height: dims[1],
			borderColor: null,
		},
		defaults: {
			width: 10,
			color: '#ffffff',
		},
		onPreview: async (opts) => {
			const width = (opts.width as number) ?? 10;
			const color = (opts.color as string) ?? '#ffffff';
			return generatePreview(input, { width, color });
		},
		onProcess: async (opts) => {
			const logs: Array<{ type: string; message: string }> = [];

			if (!(await checkImageMagick())) {
				return {
					success: false,
					error: 'ImageMagick not found',
					logs: [{ type: 'error', message: 'ImageMagick not found. Install with: sudo apt install imagemagick' }],
				};
			}

			logs.push({ type: 'info', message: `Processing ${basename(input)}...` });

			const width = (opts.width as number) ?? 10;
			const color = (opts.color as string) ?? '#ffffff';
			const options: ProcessOptions = { width, color };

			const fileInfo = getFileInfo(input);
			const outputExt = fileInfo.extension.toLowerCase() === '.gif' ? '.gif' : '.png';
			const output = `${fileInfo.dirname}/${fileInfo.filename}_border${outputExt}`;

			logs.push({ type: 'info', message: `Adding ${width}px border...` });

			const success = await addBorder(input, output, width, color);

			if (success) {
				logs.push({ type: 'success', message: 'Border added' });
				const finalDims = await getDimensions(output);
				const sizeStr = finalDims ? ` (${finalDims[0]}x${finalDims[1]})` : '';
				return {
					success: true,
					output: `${basename(output)}${sizeStr}`,
					logs,
				};
			}

			logs.push({ type: 'error', message: 'Border failed' });
			return {
				success: false,
				error: 'Processing failed',
				logs,
			};
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

		const success = await addBorder(previewInput, tempOutput, options.width, options.color);

		if (!success) {
			cleanup(tempSource, tempOutput);
			return { success: false, error: 'Border failed' };
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
	id: 'border',
	name: 'Add Border',
	icon: 'border.ico',
	extensions: ['.png', '.jpg', '.jpeg', '.gif', '.bmp'],
};
