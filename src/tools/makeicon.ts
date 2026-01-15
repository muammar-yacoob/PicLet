import { existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { startGuiServer } from '../lib/gui-server.js';
import { error, header, success, wip, wipDone } from '../lib/logger.js';
import {
	checkImageMagick,
	cleanup,
	createIco,
	getDimensions,
	scaleToSize,
	squarify,
	trim,
} from '../lib/magick.js';
import { getFileInfo, normalizePath } from '../lib/paths.js';
import { pauseOnError } from '../lib/prompts.js';

/** Processing options for makeicon */
interface ProcessOptions {
	trim: boolean;
	makeSquare: boolean;
}

/**
 * Convert PNG to ICO with multiple resolutions
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
	const output = `${fileInfo.dirname}/${fileInfo.filename}.ico`;
	const tempTrimmed = `${fileInfo.dirname}/${fileInfo.filename}_trimmed.png`;
	const tempSquare = `${fileInfo.dirname}/${fileInfo.filename}_square.png`;
	const tempScaled = `${fileInfo.dirname}/${fileInfo.filename}_scaled.png`;

	header('PicLet Make Icon');

	// Get original dimensions
	wip('Analyzing image...');
	const dims = await getDimensions(input);
	if (!dims) {
		wipDone(false, 'Failed to read image');
		return false;
	}
	wipDone(true, `Original size: ${dims[0]}x${dims[1]}`);

	// Step 1: Trim transparent areas
	wip('Trimming transparent areas...');
	if (!(await trim(input, tempTrimmed))) {
		wipDone(false, 'Trim failed');
		cleanup(tempTrimmed);
		return false;
	}
	wipDone(true, 'Trimmed');

	// Step 2: Make square
	wip('Making square...');
	if (!(await squarify(tempTrimmed, tempSquare))) {
		wipDone(false, 'Square padding failed');
		cleanup(tempTrimmed, tempSquare);
		return false;
	}
	cleanup(tempTrimmed);
	wipDone(true, 'Made square');

	// Step 3: Scale to 512px for best quality source
	wip('Scaling to 512px...');
	if (!(await scaleToSize(tempSquare, tempScaled, 512))) {
		wipDone(false, 'Scaling failed');
		cleanup(tempSquare, tempScaled);
		return false;
	}
	cleanup(tempSquare);
	wipDone(true, 'Scaled to 512x512');

	// Step 4: Create ICO with multiple resolutions
	wip('Creating icon (256, 128, 64, 48, 32, 16)...');
	if (!(await createIco(tempScaled, output))) {
		wipDone(false, 'Icon creation failed');
		cleanup(tempScaled);
		return false;
	}
	cleanup(tempScaled);
	wipDone(true, 'Icon created');

	console.log('');
	success(`Output: ${output}`);
	return true;
}

/**
 * Process image for icon creation (shared logic)
 */
async function processForIcon(
	input: string,
	output: string,
	options: ProcessOptions,
	logs?: Array<{ type: string; message: string }>,
): Promise<boolean> {
	const fileInfo = getFileInfo(input);
	const tempTrimmed = `${fileInfo.dirname}/${fileInfo.filename}_trimmed.png`;
	const tempSquare = `${fileInfo.dirname}/${fileInfo.filename}_square.png`;
	const tempScaled = `${fileInfo.dirname}/${fileInfo.filename}_scaled.png`;

	let currentInput = input;

	// Step 1: Trim (optional)
	if (options.trim) {
		logs?.push({ type: 'info', message: 'Trimming transparent areas...' });
		if (!(await trim(currentInput, tempTrimmed))) {
			cleanup(tempTrimmed);
			return false;
		}
		currentInput = tempTrimmed;
		logs?.push({ type: 'success', message: 'Trimmed' });
	}

	// Step 2: Squarify (optional)
	if (options.makeSquare) {
		logs?.push({ type: 'info', message: 'Making square...' });
		if (!(await squarify(currentInput, tempSquare))) {
			cleanup(tempTrimmed, tempSquare);
			return false;
		}
		if (currentInput === tempTrimmed) cleanup(tempTrimmed);
		currentInput = tempSquare;
		logs?.push({ type: 'success', message: 'Made square' });
	}

	// Step 3: Scale to 512px
	logs?.push({ type: 'info', message: 'Scaling to 512px...' });
	if (!(await scaleToSize(currentInput, tempScaled, 512))) {
		cleanup(tempTrimmed, tempSquare, tempScaled);
		return false;
	}
	if (currentInput === tempSquare) cleanup(tempSquare);
	else if (currentInput === tempTrimmed) cleanup(tempTrimmed);
	logs?.push({ type: 'success', message: 'Scaled to 512x512' });

	// Step 4: Create ICO
	logs?.push({ type: 'info', message: 'Creating icon (256, 128, 64, 48, 32, 16)...' });
	if (!(await createIco(tempScaled, output))) {
		cleanup(tempScaled);
		return false;
	}
	cleanup(tempScaled);
	logs?.push({ type: 'success', message: 'Icon created' });

	return true;
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
	const tempTrimmed = join(tempDir, `piclet-preview-trimmed-${timestamp}.png`);
	const tempSquare = join(tempDir, `piclet-preview-square-${timestamp}.png`);
	const tempOutput = join(tempDir, `piclet-preview-${timestamp}.png`);

	try {
		let currentInput = input;

		// Trim if enabled
		if (options.trim) {
			if (!(await trim(currentInput, tempTrimmed))) {
				cleanup(tempTrimmed);
				return { success: false, error: 'Trim failed' };
			}
			currentInput = tempTrimmed;
		}

		// Squarify if enabled
		if (options.makeSquare) {
			if (!(await squarify(currentInput, tempSquare))) {
				cleanup(tempTrimmed, tempSquare);
				return { success: false, error: 'Square failed' };
			}
			if (currentInput === tempTrimmed) cleanup(tempTrimmed);
			currentInput = tempSquare;
		}

		// Scale to preview size (256px)
		if (!(await scaleToSize(currentInput, tempOutput, 256))) {
			cleanup(tempTrimmed, tempSquare, tempOutput);
			return { success: false, error: 'Scale failed' };
		}
		if (currentInput === tempSquare) cleanup(tempSquare);
		else if (currentInput === tempTrimmed) cleanup(tempTrimmed);

		const buffer = readFileSync(tempOutput);
		const base64 = buffer.toString('base64');
		const imageData = `data:image/png;base64,${base64}`;

		const dims = await getDimensions(tempOutput);
		cleanup(tempOutput);

		return {
			success: true,
			imageData,
			width: dims?.[0],
			height: dims?.[1],
		};
	} catch (err) {
		cleanup(tempTrimmed, tempSquare, tempOutput);
		return { success: false, error: (err as Error).message };
	}
}

/**
 * Convert PNG to ICO (GUI mode)
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
		htmlFile: 'makeicon.html',
		title: 'PicLet - Make Icon',
		imageInfo: {
			filePath: input,
			fileName: basename(input),
			width: dims[0],
			height: dims[1],
			borderColor: null,
		},
		defaults: {
			trim: true,
			makeSquare: true,
		},
		onPreview: async (opts) => {
			const options: ProcessOptions = {
				trim: (opts.trim as boolean) ?? true,
				makeSquare: (opts.makeSquare as boolean) ?? true,
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
				trim: (opts.trim as boolean) ?? true,
				makeSquare: (opts.makeSquare as boolean) ?? true,
			};

			const output = `${fileInfo.dirname}/${fileInfo.filename}.ico`;

			const success = await processForIcon(input, output, options, logs);

			if (success) {
				return {
					success: true,
					output: `${fileInfo.filename}.ico`,
					logs,
				};
			}

			return { success: false, error: 'Icon creation failed', logs };
		},
	});
}

export const config = {
	id: 'makeicon',
	name: 'Make Icon',
	icon: 'makeicon.ico',
	extensions: ['.png'],
};
