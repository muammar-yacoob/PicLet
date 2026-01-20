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
	checkImageMagick,
	cleanup,
	extractFirstFrame,
	filterGrayscale,
	filterInvert,
	filterSepia,
	filterVintage,
	filterVivid,
	getDimensions,
	isMultiFrame,
} from '../lib/magick.js';
import { getFileInfo, normalizePath } from '../lib/paths.js';
import {
	pauseOnError,
	select as promptSelect,
} from '../lib/prompts.js';

/** Filter types */
type FilterType = 'grayscale' | 'sepia' | 'invert' | 'vintage' | 'vivid';

/** Processing options for filter */
interface ProcessOptions {
	filter: FilterType;
}

const FILTER_LABELS: Record<FilterType, string> = {
	'grayscale': 'Grayscale',
	'sepia': 'Sepia',
	'invert': 'Invert',
	'vintage': 'Vintage',
	'vivid': 'Vivid',
};

/**
 * Apply filter to image file
 */
async function applyFilter(
	input: string,
	output: string,
	filter: FilterType,
): Promise<boolean> {
	switch (filter) {
		case 'grayscale':
			return filterGrayscale(input, output);
		case 'sepia':
			return filterSepia(input, output);
		case 'invert':
			return filterInvert(input, output);
		case 'vintage':
			return filterVintage(input, output);
		case 'vivid':
			return filterVivid(input, output);
		default:
			return false;
	}
}

/**
 * Core processing logic for filter
 */
async function processImage(
	input: string,
	options: ProcessOptions,
): Promise<boolean> {
	const fileInfo = getFileInfo(input);
	const outputExt = fileInfo.extension.toLowerCase() === '.gif' ? '.gif' : '.png';
	const output = `${fileInfo.dirname}/${fileInfo.filename}_${options.filter}${outputExt}`;

	wip(`Applying ${FILTER_LABELS[options.filter]} filter...`);

	const success = await applyFilter(input, output, options.filter);

	if (!success) {
		wipDone(false, 'Filter failed');
		return false;
	}
	wipDone(true, FILTER_LABELS[options.filter]);

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
	console.log(`${BOLD}Filter Options:${RESET}`);
	console.log(`  ${DIM}1. Grayscale - Black and white${RESET}`);
	console.log(`  ${DIM}2. Sepia - Warm brownish tint${RESET}`);
	console.log(`  ${DIM}3. Invert - Negative colors${RESET}`);
	console.log(`  ${DIM}4. Vintage - Desaturated warm tone${RESET}`);
	console.log(`  ${DIM}5. Vivid - Increased saturation${RESET}`);
	console.log('');

	const filter = await promptSelect<FilterType>(
		'Select filter',
		[
			{ value: 'grayscale', title: 'Grayscale' },
			{ value: 'sepia', title: 'Sepia' },
			{ value: 'invert', title: 'Invert' },
			{ value: 'vintage', title: 'Vintage' },
			{ value: 'vivid', title: 'Vivid' },
		],
		'grayscale',
	);

	return { filter: filter ?? 'grayscale' };
}

/**
 * Apply filter to image (CLI mode)
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

	header('PicLet Filter');

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
 * Apply filter to image (GUI mode)
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
		htmlFile: 'filter.html',
		title: 'PicLet - Filter',
		imageInfo: {
			filePath: input,
			fileName: basename(input),
			width: dims[0],
			height: dims[1],
			borderColor: null,
		},
		defaults: {
			filter: 'grayscale',
		},
		onPreview: async (opts) => {
			const filter = (opts.filter as FilterType) ?? 'grayscale';
			return generatePreview(input, { filter });
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

			const filter = (opts.filter as FilterType) ?? 'grayscale';
			const options: ProcessOptions = { filter };

			const fileInfo = getFileInfo(input);
			const outputExt = fileInfo.extension.toLowerCase() === '.gif' ? '.gif' : '.png';
			const output = `${fileInfo.dirname}/${fileInfo.filename}_${filter}${outputExt}`;

			logs.push({ type: 'info', message: `Applying ${FILTER_LABELS[filter]} filter...` });

			const success = await applyFilter(input, output, filter);

			if (success) {
				logs.push({ type: 'success', message: 'Filter applied' });
				const finalDims = await getDimensions(output);
				const sizeStr = finalDims ? ` (${finalDims[0]}x${finalDims[1]})` : '';
				return {
					success: true,
					output: `${basename(output)}${sizeStr}`,
					logs,
				};
			}

			logs.push({ type: 'error', message: 'Filter failed' });
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

		const success = await applyFilter(previewInput, tempOutput, options.filter);

		if (!success) {
			cleanup(tempSource, tempOutput);
			return { success: false, error: 'Filter failed' };
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
	id: 'filter',
	name: 'Filter',
	icon: 'filter.ico',
	extensions: ['.png', '.jpg', '.jpeg', '.gif', '.bmp'],
};
