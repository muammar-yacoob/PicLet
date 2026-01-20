import { existsSync, readFileSync, renameSync } from 'node:fs';
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
	flipHorizontal,
	flipVertical,
	getDimensions,
	isMultiFrame,
	rotate,
} from '../lib/magick.js';
import { getFileInfo, normalizePath } from '../lib/paths.js';
import {
	isUsingDefaults,
	pauseOnError,
	select as promptSelect,
} from '../lib/prompts.js';

/** Transform operation types */
type TransformType = 'flip-h' | 'flip-v' | 'rotate-90' | 'rotate-180' | 'rotate-270';

/** Processing options for transform */
interface ProcessOptions {
	transform: TransformType;
}

const TRANSFORM_LABELS: Record<TransformType, string> = {
	'flip-h': 'Flip Horizontal',
	'flip-v': 'Flip Vertical',
	'rotate-90': 'Rotate 90°',
	'rotate-180': 'Rotate 180°',
	'rotate-270': 'Rotate 270°',
};

/**
 * Core processing logic for transform
 */
async function processImage(
	input: string,
	options: ProcessOptions,
): Promise<boolean> {
	const fileInfo = getFileInfo(input);
	const outputExt = fileInfo.extension.toLowerCase() === '.gif' ? '.gif' : '.png';
	const suffix = options.transform.replace('-', '');
	const output = `${fileInfo.dirname}/${fileInfo.filename}_${suffix}${outputExt}`;

	wip(`Applying ${TRANSFORM_LABELS[options.transform]}...`);

	let success = false;
	switch (options.transform) {
		case 'flip-h':
			success = await flipHorizontal(input, output);
			break;
		case 'flip-v':
			success = await flipVertical(input, output);
			break;
		case 'rotate-90':
			success = await rotate(input, output, 90);
			break;
		case 'rotate-180':
			success = await rotate(input, output, 180);
			break;
		case 'rotate-270':
			success = await rotate(input, output, 270);
			break;
	}

	if (!success) {
		wipDone(false, 'Transform failed');
		return false;
	}
	wipDone(true, TRANSFORM_LABELS[options.transform]);

	// Final dimensions
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
	console.log(`${BOLD}Transform Options:${RESET}`);
	console.log(`  ${DIM}1. Flip Horizontal (mirror)${RESET}`);
	console.log(`  ${DIM}2. Flip Vertical${RESET}`);
	console.log(`  ${DIM}3. Rotate 90° clockwise${RESET}`);
	console.log(`  ${DIM}4. Rotate 180°${RESET}`);
	console.log(`  ${DIM}5. Rotate 270° clockwise${RESET}`);
	console.log('');

	const transform = await promptSelect<TransformType>(
		'Select transform',
		[
			{ value: 'flip-h', title: 'Flip Horizontal' },
			{ value: 'flip-v', title: 'Flip Vertical' },
			{ value: 'rotate-90', title: 'Rotate 90°' },
			{ value: 'rotate-180', title: 'Rotate 180°' },
			{ value: 'rotate-270', title: 'Rotate 270°' },
		],
		'flip-h',
	);

	return { transform: transform ?? 'flip-h' };
}

/**
 * Transform image (CLI mode)
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

	header('PicLet Transform');

	// Get original dimensions
	wip('Analyzing image...');
	const dims = await getDimensions(input);
	if (!dims) {
		wipDone(false, 'Failed to read image');
		return false;
	}
	wipDone(true, `Size: ${dims[0]}x${dims[1]}`);

	// Collect options via CLI
	const options = await collectOptionsCLI();

	console.log('');
	return processImage(input, options);
}

/**
 * Transform image (GUI mode)
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
		htmlFile: 'transform.html',
		title: 'PicLet - Transform',
		imageInfo: {
			filePath: input,
			fileName: basename(input),
			width: dims[0],
			height: dims[1],
			borderColor: null,
		},
		defaults: {
			transform: 'flip-h',
		},
		onPreview: async (opts) => {
			const transform = (opts.transform as TransformType) ?? 'flip-h';
			return generatePreview(input, { transform });
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

			const transform = (opts.transform as TransformType) ?? 'flip-h';
			const options: ProcessOptions = { transform };

			const fileInfo = getFileInfo(input);
			const outputExt = fileInfo.extension.toLowerCase() === '.gif' ? '.gif' : '.png';
			const suffix = transform.replace('-', '');
			const output = `${fileInfo.dirname}/${fileInfo.filename}_${suffix}${outputExt}`;

			logs.push({ type: 'info', message: `Applying ${TRANSFORM_LABELS[transform]}...` });

			let success = false;
			switch (transform) {
				case 'flip-h':
					success = await flipHorizontal(input, output);
					break;
				case 'flip-v':
					success = await flipVertical(input, output);
					break;
				case 'rotate-90':
					success = await rotate(input, output, 90);
					break;
				case 'rotate-180':
					success = await rotate(input, output, 180);
					break;
				case 'rotate-270':
					success = await rotate(input, output, 270);
					break;
			}

			if (success) {
				logs.push({ type: 'success', message: 'Transform applied' });
				const finalDims = await getDimensions(output);
				const sizeStr = finalDims ? ` (${finalDims[0]}x${finalDims[1]})` : '';
				return {
					success: true,
					output: `${basename(output)}${sizeStr}`,
					logs,
				};
			}

			logs.push({ type: 'error', message: 'Transform failed' });
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

		let success = false;
		switch (options.transform) {
			case 'flip-h':
				success = await flipHorizontal(previewInput, tempOutput);
				break;
			case 'flip-v':
				success = await flipVertical(previewInput, tempOutput);
				break;
			case 'rotate-90':
				success = await rotate(previewInput, tempOutput, 90);
				break;
			case 'rotate-180':
				success = await rotate(previewInput, tempOutput, 180);
				break;
			case 'rotate-270':
				success = await rotate(previewInput, tempOutput, 270);
				break;
		}

		if (!success) {
			cleanup(tempSource, tempOutput);
			return { success: false, error: 'Transform failed' };
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
	id: 'transform',
	name: 'Transform',
	icon: 'transform.ico',
	extensions: ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico'],
};
