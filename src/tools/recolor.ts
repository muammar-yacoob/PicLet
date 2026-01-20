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
	replaceColor,
} from '../lib/magick.js';
import { getFileInfo, normalizePath } from '../lib/paths.js';
import {
	number as promptNumber,
	pauseOnError,
	text as promptText,
} from '../lib/prompts.js';

/** Processing options for color replace */
interface ProcessOptions {
	fromColor: string;
	toColor: string;
	fuzz: number;
}

/**
 * Core processing logic for color replace
 */
async function processImage(
	input: string,
	options: ProcessOptions,
): Promise<boolean> {
	const fileInfo = getFileInfo(input);
	const outputExt = fileInfo.extension.toLowerCase() === '.gif' ? '.gif' : '.png';
	const output = `${fileInfo.dirname}/${fileInfo.filename}_recolor${outputExt}`;

	wip(`Replacing ${options.fromColor} with ${options.toColor}...`);

	const success = await replaceColor(
		input,
		output,
		options.fromColor,
		options.toColor,
		options.fuzz,
	);

	if (!success) {
		wipDone(false, 'Color replacement failed');
		return false;
	}
	wipDone(true, 'Color replaced');

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
async function collectOptionsCLI(detectedColor: string | null): Promise<ProcessOptions> {
	console.log('');
	console.log(`${BOLD}Color Replacement:${RESET}`);
	console.log(`  ${DIM}Replace one color with another${RESET}`);
	console.log(`  ${DIM}Colors can be hex (#fff), named (white), or rgb(...)${RESET}`);
	console.log('');

	const defaultFrom = detectedColor || '#ffffff';
	let fromColor = await promptText('Color to replace', defaultFrom);
	if (!fromColor) {
		fromColor = defaultFrom;
	}

	console.log('');
	let toColor = await promptText('New color', '#000000');
	if (!toColor) {
		toColor = '#000000';
	}

	console.log('');
	console.log(`${BOLD}Fuzz Value:${RESET} Controls color matching sensitivity`);
	console.log(`  ${DIM}0-10%   = Exact match only${RESET}`);
	console.log(`  ${DIM}10-30%  = Similar colors${RESET}`);
	console.log(`  ${DIM}30-50%  = Wider range${RESET}`);
	console.log('');

	let fuzz = await promptNumber('Fuzz value (0-100)', 10, 0, 100);
	if (fuzz < 0 || fuzz > 100) {
		fuzz = 10;
	}

	return { fromColor, toColor, fuzz };
}

/**
 * Replace color in image (CLI mode)
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

	header('PicLet Recolor');

	wip('Analyzing image...');
	const dims = await getDimensions(input);
	if (!dims) {
		wipDone(false, 'Failed to read image');
		return false;
	}

	const borderColor = await getBorderColor(input);
	wipDone(true, `Size: ${dims[0]}x${dims[1]}`);

	if (borderColor) {
		info(`Detected corner color: ${borderColor}`);
	}

	const options = await collectOptionsCLI(borderColor);

	console.log('');
	return processImage(input, options);
}

/**
 * Replace color in image (GUI mode)
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

	const borderColor = await getBorderColor(input);

	return startGuiServer({
		htmlFile: 'recolor.html',
		title: 'PicLet - Recolor',
		imageInfo: {
			filePath: input,
			fileName: basename(input),
			width: dims[0],
			height: dims[1],
			borderColor,
		},
		defaults: {
			fromColor: borderColor || '#ffffff',
			toColor: '#000000',
			fuzz: 10,
		},
		onPreview: async (opts) => {
			const fromColor = (opts.fromColor as string) ?? '#ffffff';
			const toColor = (opts.toColor as string) ?? '#000000';
			const fuzz = (opts.fuzz as number) ?? 10;
			return generatePreview(input, { fromColor, toColor, fuzz });
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

			const fromColor = (opts.fromColor as string) ?? '#ffffff';
			const toColor = (opts.toColor as string) ?? '#000000';
			const fuzz = (opts.fuzz as number) ?? 10;
			const options: ProcessOptions = { fromColor, toColor, fuzz };

			const fileInfo = getFileInfo(input);
			const outputExt = fileInfo.extension.toLowerCase() === '.gif' ? '.gif' : '.png';
			const output = `${fileInfo.dirname}/${fileInfo.filename}_recolor${outputExt}`;

			logs.push({ type: 'info', message: `Replacing ${fromColor} → ${toColor}...` });

			const success = await replaceColor(input, output, fromColor, toColor, fuzz);

			if (success) {
				logs.push({ type: 'success', message: 'Color replaced' });
				const finalDims = await getDimensions(output);
				const sizeStr = finalDims ? ` (${finalDims[0]}x${finalDims[1]})` : '';
				return {
					success: true,
					output: `${basename(output)}${sizeStr}`,
					logs,
				};
			}

			logs.push({ type: 'error', message: 'Color replacement failed' });
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

		const success = await replaceColor(
			previewInput,
			tempOutput,
			options.fromColor,
			options.toColor,
			options.fuzz,
		);

		if (!success) {
			cleanup(tempSource, tempOutput);
			return { success: false, error: 'Color replacement failed' };
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
	id: 'recolor',
	name: 'Recolor',
	icon: 'recolor.ico',
	extensions: ['.png', '.jpg', '.jpeg', '.gif', '.bmp'],
};
