/**
 * Unified PicLet tool - combines all tools with chaining support
 */
import { existsSync, mkdirSync, readFileSync, renameSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { startGuiServer } from '../lib/gui-server.js';
import { error } from '../lib/logger.js';
import {
	checkImageMagick,
	cleanup,
	createIco,
	createIcoFromMultiple,
	getBorderColor,
	getDimensions,
	removeBackground,
	removeBackgroundBorderOnly,
	resize,
	scaleFillCrop,
	scaleToSize,
	scaleWithPadding,
	squarify,
	trim,
} from '../lib/magick.js';
import { getFileInfo, normalizePath } from '../lib/paths.js';
import { loadPresets } from '../lib/presets.js';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface PreviewResult {
	success: boolean;
	imageData?: string;
	width?: number;
	height?: number;
	error?: string;
}

interface ProcessResult {
	success: boolean;
	output?: string;
	error?: string;
	logs: Array<{ type: string; message: string }>;
}

interface ToolOptions {
	tools: string[];
	original?: boolean;
	removebg?: { fuzz: number; trim: boolean; preserveInner: boolean };
	scale?: { width: number; height: number; makeSquare: boolean };
	makeicon?: { trim: boolean; makeSquare: boolean };
	iconpack?: { web: boolean; android: boolean; ios: boolean };
	storepack?: { preset: string; scaleMode: string };
}

// Tool execution order (for chaining)
const TOOL_ORDER = ['removebg', 'scale', 'makeicon', 'iconpack', 'storepack'];

// ─────────────────────────────────────────────────────────────────────────────
// Preview - Chains enabled tools
// ─────────────────────────────────────────────────────────────────────────────

async function generateCombinedPreview(
	input: string,
	borderColor: string | null,
	opts: ToolOptions,
): Promise<PreviewResult> {
	const tempDir = tmpdir();
	const ts = Date.now();
	const temps: string[] = [];

	const makeTempPath = (suffix: string) => {
		const p = join(tempDir, `piclet-${ts}-${suffix}.png`);
		temps.push(p);
		return p;
	};

	try {
		let current = input;

		// If just showing original, scale it for preview and return
		if (opts.original || opts.tools.length === 0) {
			const dims = await getDimensions(input);
			let previewPath = input;

			if (dims && (dims[0] > 512 || dims[1] > 512)) {
				const scaled = makeTempPath('orig-preview');
				const targetSize = Math.min(512, Math.max(dims[0], dims[1]));
				if (await scaleToSize(input, scaled, targetSize)) {
					previewPath = scaled;
				}
			}

			const buffer = readFileSync(previewPath);
			const finalDims = await getDimensions(previewPath);
			cleanup(...temps);

			return {
				success: true,
				imageData: `data:image/png;base64,${buffer.toString('base64')}`,
				width: finalDims?.[0] ?? dims?.[0],
				height: finalDims?.[1] ?? dims?.[1],
			};
		}

		// Get ordered list of active tools
		const activeTools = TOOL_ORDER.filter(t => opts.tools.includes(t));

		// Process each tool in order
		for (const tool of activeTools) {
			switch (tool) {
				case 'removebg': {
					const rbOpts = opts.removebg!;
					const out = makeTempPath('removebg');
					let success = false;

					if (rbOpts.preserveInner && borderColor) {
						success = await removeBackgroundBorderOnly(current, out, borderColor, rbOpts.fuzz);
					}
					if (!success && borderColor) {
						success = await removeBackground(current, out, borderColor, rbOpts.fuzz);
					}
					if (!success) {
						cleanup(...temps);
						return { success: false, error: 'Background removal failed' };
					}

					// Trim if enabled
					if (rbOpts.trim) {
						const trimOut = makeTempPath('trim');
						if (await trim(out, trimOut)) {
							current = trimOut;
						} else {
							current = out;
						}
					} else {
						current = out;
					}
					break;
				}

				case 'scale': {
					const scOpts = opts.scale!;
					const out = makeTempPath('scale');
					let success = false;

					if (scOpts.makeSquare) {
						const max = Math.max(scOpts.width, scOpts.height);
						success = await scaleWithPadding(current, out, max, max);
					} else {
						success = await resize(current, out, scOpts.width, scOpts.height);
					}

					if (!success) {
						cleanup(...temps);
						return { success: false, error: 'Scale failed' };
					}
					current = out;
					break;
				}

				case 'makeicon': {
					// For preview, just show what the icon source would look like
					const miOpts = opts.makeicon!;
					let out = current;

					if (miOpts.trim && current === input) {
						const trimOut = makeTempPath('mi-trim');
						if (await trim(current, trimOut)) {
							out = trimOut;
							current = out;
						}
					}

					if (miOpts.makeSquare) {
						const sqOut = makeTempPath('mi-sq');
						if (await squarify(current, sqOut)) {
							current = sqOut;
						}
					}
					break;
				}

				// iconpack and storepack don't affect preview
			}
		}

		// Scale down for preview display if needed
		const dims = await getDimensions(current);
		let previewPath = current;

		if (dims && (dims[0] > 512 || dims[1] > 512)) {
			const scaled = makeTempPath('preview');
			const targetSize = Math.min(512, Math.max(dims[0], dims[1]));
			if (await scaleToSize(current, scaled, targetSize)) {
				previewPath = scaled;
			}
		}

		const buffer = readFileSync(previewPath);
		const finalDims = await getDimensions(previewPath);
		cleanup(...temps);

		return {
			success: true,
			imageData: `data:image/png;base64,${buffer.toString('base64')}`,
			width: finalDims?.[0],
			height: finalDims?.[1],
		};
	} catch (err) {
		cleanup(...temps);
		return { success: false, error: (err as Error).message };
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// Process - Chains enabled tools and produces output
// ─────────────────────────────────────────────────────────────────────────────

async function processCombined(
	input: string,
	borderColor: string | null,
	opts: ToolOptions,
	logs: Array<{ type: string; message: string }>,
): Promise<string[]> {
	const fileInfo = getFileInfo(input);
	const outputs: string[] = [];
	const temps: string[] = [];

	const makeTempPath = (suffix: string) => {
		const p = `${fileInfo.dirname}/${fileInfo.filename}_${suffix}.png`;
		temps.push(p);
		return p;
	};

	let current = input;
	const activeTools = TOOL_ORDER.filter(t => opts.tools.includes(t));

	for (const tool of activeTools) {
		switch (tool) {
			case 'removebg': {
				logs.push({ type: 'info', message: 'Removing background...' });
				const rbOpts = opts.removebg!;
				const out = makeTempPath('nobg');
				let success = false;

				if (rbOpts.preserveInner && borderColor) {
					success = await removeBackgroundBorderOnly(current, out, borderColor, rbOpts.fuzz);
					if (!success) {
						logs.push({ type: 'warn', message: 'Border-only failed, trying full removal' });
					}
				}
				if (!success && borderColor) {
					success = await removeBackground(current, out, borderColor, rbOpts.fuzz);
				}
				if (!success) {
					logs.push({ type: 'error', message: 'Background removal failed' });
					cleanup(...temps);
					return [];
				}
				logs.push({ type: 'success', message: 'Background removed' });

				if (rbOpts.trim) {
					logs.push({ type: 'info', message: 'Trimming edges...' });
					const trimOut = makeTempPath('trimmed');
					if (await trim(out, trimOut)) {
						cleanup(out);
						temps.splice(temps.indexOf(out), 1);
						current = trimOut;
						logs.push({ type: 'success', message: 'Trimmed' });
					} else {
						current = out;
					}
				} else {
					current = out;
				}

				// If this is the last tool, save output
				if (activeTools.indexOf(tool) === activeTools.length - 1) {
					const finalOut = `${fileInfo.dirname}/${fileInfo.filename}_nobg.png`;
					renameSync(current, finalOut);
					temps.splice(temps.indexOf(current), 1);
					outputs.push(basename(finalOut));
				}
				break;
			}

			case 'scale': {
				logs.push({ type: 'info', message: 'Scaling image...' });
				const scOpts = opts.scale!;
				const out = makeTempPath('scaled');
				let success = false;

				if (scOpts.makeSquare) {
					const max = Math.max(scOpts.width, scOpts.height);
					success = await scaleWithPadding(current, out, max, max);
				} else {
					success = await resize(current, out, scOpts.width, scOpts.height);
				}

				if (!success) {
					logs.push({ type: 'error', message: 'Scale failed' });
					cleanup(...temps);
					return [];
				}

				const dims = await getDimensions(out);
				logs.push({ type: 'success', message: `Scaled to ${dims?.[0]}×${dims?.[1]}` });

				// Clean up previous temp if it's not the input
				if (current !== input && temps.includes(current)) {
					cleanup(current);
					temps.splice(temps.indexOf(current), 1);
				}
				current = out;

				// If this is the last tool, save output
				if (activeTools.indexOf(tool) === activeTools.length - 1) {
					const finalOut = `${fileInfo.dirname}/${fileInfo.filename}_scaled${fileInfo.extension}`;
					renameSync(current, finalOut);
					temps.splice(temps.indexOf(current), 1);
					outputs.push(basename(finalOut));
				}
				break;
			}

			case 'makeicon': {
				logs.push({ type: 'info', message: 'Creating ICO...' });
				const miOpts = opts.makeicon!;

				// Prepare source
				let iconSource = current;

				if (miOpts.trim && current === input) {
					const trimOut = makeTempPath('mi-trim');
					if (await trim(current, trimOut)) {
						iconSource = trimOut;
					}
				}

				if (miOpts.makeSquare) {
					const sqOut = makeTempPath('mi-sq');
					if (await squarify(iconSource, sqOut)) {
						if (iconSource !== current && iconSource !== input) cleanup(iconSource);
						iconSource = sqOut;
					}
				}

				// Scale to 512 for best quality
				const scaled = makeTempPath('mi-512');
				if (!(await scaleToSize(iconSource, scaled, 512))) {
					logs.push({ type: 'error', message: 'Failed to prepare icon source' });
					cleanup(...temps);
					return [];
				}
				if (iconSource !== current && iconSource !== input) cleanup(iconSource);

				// Create ICO
				const icoOut = `${fileInfo.dirname}/${fileInfo.filename}.ico`;
				if (!(await createIco(scaled, icoOut))) {
					logs.push({ type: 'error', message: 'ICO creation failed' });
					cleanup(...temps);
					return [];
				}
				cleanup(scaled);
				temps.splice(temps.indexOf(scaled), 1);

				logs.push({ type: 'success', message: 'Created ICO (256, 128, 64, 48, 32, 16)' });
				outputs.push(basename(icoOut));
				break;
			}

			case 'iconpack': {
				logs.push({ type: 'info', message: 'Generating icon pack...' });
				const ipOpts = opts.iconpack!;
				const outputDir = `${fileInfo.dirname}/${fileInfo.filename}_icons`;
				mkdirSync(outputDir, { recursive: true });

				// Prepare 1024px source
				const sqTemp = makeTempPath('ip-sq');
				const srcTemp = makeTempPath('ip-src');

				if (!(await squarify(current, sqTemp))) {
					logs.push({ type: 'error', message: 'Failed to prepare source' });
					cleanup(...temps);
					return [];
				}
				if (!(await scaleToSize(sqTemp, srcTemp, 1024))) {
					cleanup(...temps);
					return [];
				}
				cleanup(sqTemp);

				let count = 0;

				if (ipOpts.web) {
					const webDir = `${outputDir}/web`;
					mkdirSync(webDir, { recursive: true });

					// Favicon
					const t16 = `${webDir}/.t16.png`, t32 = `${webDir}/.t32.png`, t48 = `${webDir}/.t48.png`;
					await scaleToSize(srcTemp, t16, 16);
					await scaleToSize(srcTemp, t32, 32);
					await scaleToSize(srcTemp, t48, 48);
					await createIcoFromMultiple([t16, t32, t48], `${webDir}/favicon.ico`);
					cleanup(t16, t32, t48);
					count++;

					const webIcons = [
						{ name: 'favicon-16x16.png', size: 16 }, { name: 'favicon-32x32.png', size: 32 },
						{ name: 'apple-touch-icon.png', size: 180 }, { name: 'android-chrome-192x192.png', size: 192 },
						{ name: 'android-chrome-512x512.png', size: 512 }, { name: 'mstile-150x150.png', size: 150 },
					];
					for (const i of webIcons) {
						await scaleToSize(srcTemp, `${webDir}/${i.name}`, i.size);
						count++;
					}
					logs.push({ type: 'success', message: `Web: ${count} icons` });
				}

				if (ipOpts.android) {
					const androidDir = `${outputDir}/android`;
					const androidIcons = [
						{ name: 'mipmap-mdpi/ic_launcher.png', size: 48 },
						{ name: 'mipmap-hdpi/ic_launcher.png', size: 72 },
						{ name: 'mipmap-xhdpi/ic_launcher.png', size: 96 },
						{ name: 'mipmap-xxhdpi/ic_launcher.png', size: 144 },
						{ name: 'mipmap-xxxhdpi/ic_launcher.png', size: 192 },
						{ name: 'playstore-icon.png', size: 512 },
					];
					const startCount = count;
					for (const i of androidIcons) {
						const p = `${androidDir}/${i.name}`;
						mkdirSync(dirname(p), { recursive: true });
						await scaleToSize(srcTemp, p, i.size);
						count++;
					}
					logs.push({ type: 'success', message: `Android: ${count - startCount} icons` });
				}

				if (ipOpts.ios) {
					const iosDir = `${outputDir}/ios`;
					mkdirSync(iosDir, { recursive: true });
					const iosSizes = [20, 29, 40, 58, 60, 76, 80, 87, 120, 152, 167, 180, 1024];
					const startCount = count;
					for (const s of iosSizes) {
						await scaleToSize(srcTemp, `${iosDir}/AppIcon-${s}.png`, s);
						count++;
					}
					logs.push({ type: 'success', message: `iOS: ${count - startCount} icons` });
				}

				cleanup(srcTemp);
				outputs.push(`${count} icons → ${fileInfo.filename}_icons/`);
				break;
			}

			case 'storepack': {
				logs.push({ type: 'info', message: 'Generating store assets...' });
				const spOpts = opts.storepack!;
				const presets = loadPresets();
				const preset = presets.find(p => p.id === spOpts.preset);

				if (!preset) {
					logs.push({ type: 'error', message: 'Preset not found' });
					return [];
				}

				const outputDir = `${fileInfo.dirname}/${fileInfo.filename}_${preset.id}`;
				mkdirSync(outputDir, { recursive: true });

				let count = 0;
				for (const icon of preset.icons) {
					const out = join(outputDir, icon.filename);
					let success = false;

					switch (spOpts.scaleMode) {
						case 'fill':
							success = await scaleFillCrop(current, out, icon.width, icon.height);
							break;
						case 'stretch':
							success = await resize(current, out, icon.width, icon.height);
							break;
						default:
							success = await scaleWithPadding(current, out, icon.width, icon.height);
					}
					if (success) count++;
				}

				logs.push({ type: 'success', message: `Generated ${count}/${preset.icons.length} images` });
				outputs.push(`${count} images → ${fileInfo.filename}_${preset.id}/`);
				break;
			}
		}
	}

	// Cleanup any remaining temps
	cleanup(...temps);
	return outputs;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main GUI Entry Point
// ─────────────────────────────────────────────────────────────────────────────

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
	const presets = loadPresets();

	return startGuiServer({
		htmlFile: 'piclet.html',
		title: 'PicLet',
		imageInfo: {
			filePath: input,
			fileName: basename(input),
			width: dims[0],
			height: dims[1],
			borderColor,
		},
		defaults: {
			presets: presets.map(p => ({ id: p.id, name: p.name })),
		},
		onPreview: async (opts) => {
			const toolOpts = opts as unknown as ToolOptions;
			// Allow empty tools array - will show original image
			if (!toolOpts.tools) {
				toolOpts.tools = [];
			}
			return generateCombinedPreview(input, borderColor, toolOpts);
		},
		onProcess: async (opts) => {
			const logs: Array<{ type: string; message: string }> = [];
			const toolOpts = opts as unknown as ToolOptions;

			if (!toolOpts.tools || toolOpts.tools.length === 0) {
				return { success: false, error: 'No tools selected', logs };
			}

			if (!(await checkImageMagick())) {
				return {
					success: false,
					error: 'ImageMagick not found',
					logs: [{ type: 'error', message: 'ImageMagick not found. Install: sudo apt install imagemagick' }],
				};
			}

			const outputs = await processCombined(input, borderColor, toolOpts, logs);

			if (outputs.length > 0) {
				return {
					success: true,
					output: outputs.join('\n'),
					logs,
				};
			}

			return { success: false, error: 'Processing failed', logs };
		},
	});
}

export const config = {
	id: 'piclet',
	name: 'PicLet',
	icon: 'banana.ico',
	extensions: ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico'],
};
