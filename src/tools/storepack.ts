import { existsSync, mkdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import { startGuiServer } from '../lib/gui-server.js';
import { error, header, info, success, wip, wipDone } from '../lib/logger.js';
import {
	checkImageMagick,
	cleanup,
	getDimensions,
	resize,
	scaleFillCrop,
	scaleWithPadding,
} from '../lib/magick.js';
import { getFileInfo, normalizePath } from '../lib/paths.js';
import { loadPresets, type Preset } from '../lib/presets.js';
import { pauseOnError, select as promptSelect } from '../lib/prompts.js';

type ScaleMode = 'fit' | 'fill' | 'stretch';

/**
 * Scale image using the specified mode
 */
async function scaleImage(
	input: string,
	output: string,
	width: number,
	height: number,
	mode: ScaleMode,
): Promise<boolean> {
	switch (mode) {
		case 'fill':
			return scaleFillCrop(input, output, width, height);
		case 'stretch':
			return resize(input, output, width, height);
		case 'fit':
		default:
			return scaleWithPadding(input, output, width, height);
	}
}

/**
 * Generate images for a preset
 */
async function generatePresetImages(
	sourceImg: string,
	outputDir: string,
	preset: Preset,
	scaleMode: ScaleMode = 'fit',
	logs?: Array<{ type: string; message: string }>,
): Promise<number> {
	let failed = 0;
	const total = preset.icons.length;

	for (let i = 0; i < total; i++) {
		const icon = preset.icons[i];
		const outputPath = join(outputDir, icon.filename);

		if (logs) {
			logs.push({ type: 'info', message: `[${i + 1}/${total}] ${icon.filename}` });
		} else {
			wip(`[${i + 1}/${total}] Generating ${icon.filename}...`);
		}

		const scaled = await scaleImage(
			sourceImg,
			outputPath,
			icon.width,
			icon.height,
			scaleMode,
		);

		if (scaled) {
			if (!logs) {
				wipDone(true, `[${i + 1}/${total}] ${icon.filename} (${icon.width}x${icon.height})`);
			}
		} else {
			if (logs) {
				logs.push({ type: 'error', message: `Failed: ${icon.filename}` });
			} else {
				wipDone(false, `[${i + 1}/${total}] Failed: ${icon.filename}`);
			}
			failed++;
		}
	}

	return failed;
}

/**
 * Generate store assets (CLI mode)
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

	const fileInfo = getFileInfo(input);

	header('PicLet Store Pack');

	// Analyze source image
	wip('Analyzing source image...');
	const dims = await getDimensions(input);
	if (!dims) {
		wipDone(false, 'Failed to read image');
		return false;
	}
	wipDone(true, `Source: ${dims[0]}x${dims[1]}`);

	// Load presets
	const presets = loadPresets();
	const choices = presets.map((p) => ({
		title: p.name,
		value: p.id,
		description: p.description,
	}));

	// Select preset
	console.log('');
	const selectedId = await promptSelect('Select target store:', choices, presets[0].id);
	const preset = presets.find((p) => p.id === selectedId);

	if (!preset) {
		error('Preset not found');
		return false;
	}

	// Create output directory
	const outputDir = `${fileInfo.dirname}/${fileInfo.filename}_${preset.id}`;
	mkdirSync(outputDir, { recursive: true });
	info(`Output: ${outputDir}`);

	// Prepare source (make square for consistent scaling)
	console.log('');
	wip('Preparing source...');
	const tempSource = join(outputDir, '.source.png');

	if (!(await squarify(input, tempSource))) {
		wipDone(false, 'Failed to prepare source');
		return false;
	}
	wipDone(true, 'Source prepared');

	// Generate images
	console.log('');
	header(`Generating ${preset.name} Images`);

	const failed = await generatePresetImages(tempSource, outputDir, preset);
	cleanup(tempSource);

	console.log('');
	if (failed === 0) {
		success(`All ${preset.icons.length} images generated!`);
	} else {
		error(`${failed}/${preset.icons.length} images failed`);
	}

	info(`Output: ${outputDir}`);
	return failed === 0;
}

/**
 * Generate store assets (GUI mode)
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
	const presets = loadPresets();

	return startGuiServer({
		htmlFile: 'storepack.html',
		title: 'PicLet - Store Pack',
		imageInfo: {
			filePath: input,
			fileName: basename(input),
			width: dims[0],
			height: dims[1],
			borderColor: null,
		},
		defaults: {
			presets: presets.map((p) => ({
				id: p.id,
				name: p.name,
				description: p.description,
				icons: p.icons,
			})),
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

			const presetId = opts.preset as string;
			const scaleMode = (opts.scaleMode as ScaleMode) || 'fit';
			const preset = presets.find((p) => p.id === presetId);

			if (!preset) {
				return {
					success: false,
					error: 'Preset not found',
					logs: [{ type: 'error', message: 'No preset selected' }],
				};
			}

			// Create output directory
			const outputDir = `${fileInfo.dirname}/${fileInfo.filename}_${preset.id}`;
			mkdirSync(outputDir, { recursive: true });
			logs.push({ type: 'info', message: `Output: ${outputDir}` });
			logs.push({ type: 'info', message: `Scale mode: ${scaleMode}` });

			// Generate images directly from source
			logs.push({ type: 'info', message: `Generating ${preset.icons.length} images...` });
			const failed = await generatePresetImages(input, outputDir, preset, scaleMode, logs);

			if (failed === 0) {
				logs.push({ type: 'success', message: `All ${preset.icons.length} images generated` });
				return {
					success: true,
					output: `${preset.icons.length} images saved to ${fileInfo.filename}_${preset.id}/`,
					logs,
				};
			}

			return {
				success: false,
				error: `${failed} image(s) failed`,
				logs,
			};
		},
	});
}

export const config = {
	id: 'storepack',
	name: 'Store Pack',
	icon: 'storepack.ico',
	extensions: ['.png', '.jpg', '.jpeg', '.gif'],
};
