import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { startGuiServer } from '../lib/gui-server.js';
import {
	BOLD,
	DIM,
	RESET,
	error,
	header,
	info,
	success,
	wip,
	wipDone,
} from '../lib/logger.js';
import {
	checkImageMagick,
	cleanup,
	extractAllFrames,
	extractFirstFrame,
	getDimensions,
	getFrameCount,
} from '../lib/magick.js';
import { getFileInfo, normalizePath } from '../lib/paths.js';
import {
	confirm as promptConfirm,
	pauseOnError,
} from '../lib/prompts.js';

/**
 * Extract frames from animated GIF (CLI mode)
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

	header('PicLet Extract Frames');

	wip('Analyzing GIF...');
	const dims = await getDimensions(input);
	if (!dims) {
		wipDone(false, 'Failed to read image');
		return false;
	}

	const frameCount = await getFrameCount(input);
	wipDone(true, `Size: ${dims[0]}x${dims[1]}, ${frameCount} frames`);

	if (frameCount <= 1) {
		info('Image has only 1 frame, nothing to extract');
		return true;
	}

	console.log('');
	console.log(`${BOLD}Extract Frames:${RESET}`);
	console.log(`  ${DIM}This will create ${frameCount} PNG files${RESET}`);
	console.log('');

	const proceed = await promptConfirm(`Extract ${frameCount} frames?`, true);
	if (!proceed) {
		info('Cancelled');
		return false;
	}

	const fileInfo = getFileInfo(input);
	const outputDir = `${fileInfo.dirname}/${fileInfo.filename}_frames`;

	console.log('');
	wip('Extracting frames...');

	mkdirSync(outputDir, { recursive: true });
	const frames = await extractAllFrames(input, outputDir, 'frame');

	if (frames.length === 0) {
		wipDone(false, 'Extraction failed');
		return false;
	}

	wipDone(true, `Extracted ${frames.length} frames`);

	console.log('');
	success(`Output: ${outputDir}/`);
	return true;
}

/**
 * Extract frames from animated GIF (GUI mode)
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

	const frameCount = await getFrameCount(input);
	const fileInfo = getFileInfo(input);

	return startGuiServer({
		htmlFile: 'extract-frames.html',
		title: 'PicLet - Extract Frames',
		imageInfo: {
			filePath: input,
			fileName: basename(input),
			width: dims[0],
			height: dims[1],
			borderColor: null,
		},
		defaults: {
			frameCount,
		},
		onPreview: async (opts) => {
			const frameIndex = (opts.frameIndex as number) ?? 0;
			return generateFramePreview(input, frameIndex);
		},
		onProcess: async () => {
			const logs: Array<{ type: string; message: string }> = [];

			if (!(await checkImageMagick())) {
				return {
					success: false,
					error: 'ImageMagick not found',
					logs: [{ type: 'error', message: 'ImageMagick not found. Install with: sudo apt install imagemagick' }],
				};
			}

			logs.push({ type: 'info', message: `Extracting ${frameCount} frames...` });

			const outputDir = `${fileInfo.dirname}/${fileInfo.filename}_frames`;
			mkdirSync(outputDir, { recursive: true });

			const frames = await extractAllFrames(input, outputDir, 'frame');

			if (frames.length > 0) {
				logs.push({ type: 'success', message: `Extracted ${frames.length} frames` });
				return {
					success: true,
					output: `${frames.length} frames -> ${fileInfo.filename}_frames/`,
					logs,
				};
			}

			logs.push({ type: 'error', message: 'Extraction failed' });
			return { success: false, error: 'Extraction failed', logs };
		},
	});
}

/**
 * Generate preview for a specific frame
 */
async function generateFramePreview(
	input: string,
	frameIndex: number,
): Promise<{ success: boolean; imageData?: string; width?: number; height?: number; error?: string }> {
	const tempDir = tmpdir();
	const timestamp = Date.now();
	const tempOutput = join(tempDir, `piclet-frame-${timestamp}.png`);

	try {
		if (!(await extractFirstFrame(input, tempOutput, frameIndex))) {
			return { success: false, error: 'Failed to extract frame' };
		}

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
		cleanup(tempOutput);
		return { success: false, error: (err as Error).message };
	}
}

export const config = {
	id: 'extract-frames',
	name: 'Extract Frames',
	icon: 'extract.ico',
	extensions: ['.gif'],
};
