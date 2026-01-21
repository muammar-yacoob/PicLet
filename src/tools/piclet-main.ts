/**
 * Unified PicLet tool - combines all tools with chaining support
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, extname, join } from 'node:path';
import { startGuiServer } from '../lib/gui-server.js';
import { error } from '../lib/logger.js';
import {
	checkImageMagick,
	cleanup,
	createIco,
	createIcoFromMultiple,
	deleteGifFrame,
	extractAllFrames,
	extractFirstFrame,
	getBorderColor,
	getDimensions,
	getFrameCount,
	isMultiFrame,
	removeBackground,
	removeBackgroundBorderOnly,
	removeBackgroundEdgeAware,
	replaceGifFrame,
	resize,
	scaleFillCrop,
	scaleToSize,
	scaleWithPadding,
	simplifyGif,
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

interface Dimension {
	width: number;
	height: number;
	filename?: string;
}

interface ToolOptions {
	tools: string[];
	original?: boolean;
	removebg?: { fuzz: number; trim: boolean; preserveInner: boolean; edgeDetect: boolean; edgeStrength: number };
	scale?: { width: number; height: number; makeSquare: boolean };
	icons?: {
		trim: boolean;
		makeSquare: boolean;
		ico: boolean;
		web: boolean;
		android: boolean;
		ios: boolean;
	};
	storepack?: { dimensions: Dimension[]; scaleMode: string; presetName?: string };
}

// Tool execution order (for chaining)
const TOOL_ORDER = ['removebg', 'scale', 'icons', 'storepack'];

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

		// For GIFs, extract first frame only for fast preview
		if (isMultiFrame(input)) {
			const frameTemp = makeTempPath('frame');
			if (await extractFirstFrame(input, frameTemp)) {
				current = frameTemp;
			}
		}

		// If just showing original, scale it for preview and return
		if (opts.original || opts.tools.length === 0) {
			const dims = await getDimensions(current);
			let previewPath = current;

			if (dims && (dims[0] > 512 || dims[1] > 512)) {
				const scaled = makeTempPath('orig-preview');
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

					if (rbOpts.edgeDetect && borderColor) {
						// Use edge feathering for smoother cutouts
						success = await removeBackgroundEdgeAware(current, out, borderColor, rbOpts.fuzz, rbOpts.edgeStrength);
					} else if (rbOpts.preserveInner && borderColor) {
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

				case 'icons': {
					// For preview, show what the icon source would look like after trim/squarify
					const icOpts = opts.icons!;

					if (icOpts.trim && current === input) {
						const trimOut = makeTempPath('ic-trim');
						if (await trim(current, trimOut)) {
							current = trimOut;
						}
					}

					if (icOpts.makeSquare) {
						const sqOut = makeTempPath('ic-sq');
						if (await squarify(current, sqOut)) {
							current = sqOut;
						}
					}
					break;
				}

				// storepack doesn't affect preview
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

interface ProcessedResult {
	outputs: string[];
	singleFilePath?: string; // Full path if single file output (for preview)
}

async function processCombined(
	input: string,
	borderColor: string | null,
	opts: ToolOptions,
	logs: Array<{ type: string; message: string }>,
): Promise<ProcessedResult> {
	const fileInfo = getFileInfo(input);
	const outputs: string[] = [];
	const temps: string[] = [];
	let singleFilePath: string | undefined;
	// Preserve GIF extension for animated files, use PNG for others
	const outputExt = fileInfo.extension.toLowerCase() === '.gif' ? '.gif' : '.png';

	const makeTempPath = (suffix: string) => {
		const p = `${fileInfo.dirname}/${fileInfo.filename}_${suffix}${outputExt}`;
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

				if (rbOpts.edgeDetect && borderColor) {
					logs.push({ type: 'info', message: 'Using edge feathering...' });
					success = await removeBackgroundEdgeAware(current, out, borderColor, rbOpts.fuzz, rbOpts.edgeStrength);
					if (!success) {
						logs.push({ type: 'warn', message: 'Edge feathering failed, trying standard removal' });
					}
				} else if (rbOpts.preserveInner && borderColor) {
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
					return { outputs: [] };
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
					const finalOut = `${fileInfo.dirname}/${fileInfo.filename}_nobg${outputExt}`;
					renameSync(current, finalOut);
					temps.splice(temps.indexOf(current), 1);
					outputs.push(basename(finalOut));
					singleFilePath = finalOut;
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
					return { outputs: [] };
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
					const finalOut = `${fileInfo.dirname}/${fileInfo.filename}_scaled${outputExt}`;
					renameSync(current, finalOut);
					temps.splice(temps.indexOf(current), 1);
					outputs.push(basename(finalOut));
					singleFilePath = finalOut;
				}
				break;
			}

			case 'icons': {
				logs.push({ type: 'info', message: 'Generating icons...' });
				const icOpts = opts.icons!;

				// Need at least one output format
				if (!icOpts.ico && !icOpts.web && !icOpts.android && !icOpts.ios) {
					logs.push({ type: 'error', message: 'No output format selected' });
					return { outputs: [] };
				}

				// Prepare source - apply trim and squarify
				let iconSource = current;

				if (icOpts.trim && current === input) {
					logs.push({ type: 'info', message: 'Trimming edges...' });
					const trimOut = makeTempPath('ic-trim');
					if (await trim(current, trimOut)) {
						iconSource = trimOut;
						logs.push({ type: 'success', message: 'Trimmed' });
					}
				}

				if (icOpts.makeSquare) {
					logs.push({ type: 'info', message: 'Making square...' });
					const sqOut = makeTempPath('ic-sq');
					if (await squarify(iconSource, sqOut)) {
						if (iconSource !== current && iconSource !== input) cleanup(iconSource);
						iconSource = sqOut;
						logs.push({ type: 'success', message: 'Made square' });
					}
				}

				// Prepare high-res source (1024px for packs, 512px for ICO only)
				const maxSize = icOpts.web || icOpts.android || icOpts.ios ? 1024 : 512;
				const srcTemp = makeTempPath('ic-src');
				if (!(await scaleToSize(iconSource, srcTemp, maxSize))) {
					logs.push({ type: 'error', message: 'Failed to prepare icon source' });
					cleanup(...temps);
					return { outputs: [] };
				}
				if (iconSource !== current && iconSource !== input) cleanup(iconSource);

				let totalCount = 0;

				// Generate ICO file
				if (icOpts.ico) {
					logs.push({ type: 'info', message: 'Creating ICO file...' });
					const icoOut = `${fileInfo.dirname}/${fileInfo.filename}.ico`;
					if (await createIco(srcTemp, icoOut)) {
						logs.push({ type: 'success', message: 'ICO: 6 sizes (256, 128, 64, 48, 32, 16)' });
						outputs.push(basename(icoOut));
						totalCount += 6;
					} else {
						logs.push({ type: 'warn', message: 'ICO creation failed' });
					}
				}

				// Generate icon packs (Web, Android, iOS)
				const needsPacks = icOpts.web || icOpts.android || icOpts.ios;
				if (needsPacks) {
					const outputDir = `${fileInfo.dirname}/${fileInfo.filename}_icons`;
					mkdirSync(outputDir, { recursive: true });

					if (icOpts.web) {
						logs.push({ type: 'info', message: 'Generating Web icons...' });
						const webDir = `${outputDir}/web`;
						mkdirSync(webDir, { recursive: true });

						// Favicon.ico
						const t16 = `${webDir}/.t16.png`, t32 = `${webDir}/.t32.png`, t48 = `${webDir}/.t48.png`;
						await scaleToSize(srcTemp, t16, 16);
						await scaleToSize(srcTemp, t32, 32);
						await scaleToSize(srcTemp, t48, 48);
						await createIcoFromMultiple([t16, t32, t48], `${webDir}/favicon.ico`);
						cleanup(t16, t32, t48);
						totalCount++;

						const webIcons = [
							{ name: 'favicon-16x16.png', size: 16 }, { name: 'favicon-32x32.png', size: 32 },
							{ name: 'apple-touch-icon.png', size: 180 }, { name: 'android-chrome-192x192.png', size: 192 },
							{ name: 'android-chrome-512x512.png', size: 512 }, { name: 'mstile-150x150.png', size: 150 },
						];
						for (const i of webIcons) {
							await scaleToSize(srcTemp, `${webDir}/${i.name}`, i.size);
							totalCount++;
						}
						logs.push({ type: 'success', message: 'Web: 7 icons' });
					}

					if (icOpts.android) {
						logs.push({ type: 'info', message: 'Generating Android icons...' });
						const androidDir = `${outputDir}/android`;
						const androidIcons = [
							{ name: 'mipmap-mdpi/ic_launcher.png', size: 48 },
							{ name: 'mipmap-hdpi/ic_launcher.png', size: 72 },
							{ name: 'mipmap-xhdpi/ic_launcher.png', size: 96 },
							{ name: 'mipmap-xxhdpi/ic_launcher.png', size: 144 },
							{ name: 'mipmap-xxxhdpi/ic_launcher.png', size: 192 },
							{ name: 'playstore-icon.png', size: 512 },
						];
						for (const i of androidIcons) {
							const p = `${androidDir}/${i.name}`;
							mkdirSync(dirname(p), { recursive: true });
							await scaleToSize(srcTemp, p, i.size);
							totalCount++;
						}
						logs.push({ type: 'success', message: 'Android: 6 icons' });
					}

					if (icOpts.ios) {
						logs.push({ type: 'info', message: 'Generating iOS icons...' });
						const iosDir = `${outputDir}/ios`;
						mkdirSync(iosDir, { recursive: true });
						const iosSizes = [20, 29, 40, 58, 60, 76, 80, 87, 120, 152, 167, 180, 1024];
						for (const s of iosSizes) {
							await scaleToSize(srcTemp, `${iosDir}/AppIcon-${s}.png`, s);
							totalCount++;
						}
						logs.push({ type: 'success', message: `iOS: ${iosSizes.length} icons` });
					}

					outputs.push(`${totalCount} icons → ${fileInfo.filename}_icons/`);
				}

				cleanup(srcTemp);
				logs.push({ type: 'success', message: `Generated ${totalCount} total icons` });
				break;
			}

			case 'storepack': {
				logs.push({ type: 'info', message: 'Generating store assets...' });
				const spOpts = opts.storepack!;

				if (!spOpts.dimensions || spOpts.dimensions.length === 0) {
					logs.push({ type: 'error', message: 'No dimensions specified' });
					return { outputs: [] };
				}

				const folderName = spOpts.presetName || 'assets';
				const outputDir = `${fileInfo.dirname}/${fileInfo.filename}_${folderName}`;
				mkdirSync(outputDir, { recursive: true });

				let count = 0;
				for (const dim of spOpts.dimensions) {
					const filename = dim.filename || `${dim.width}x${dim.height}.png`;
					const out = join(outputDir, filename);
					let success = false;

					switch (spOpts.scaleMode) {
						case 'fill':
							success = await scaleFillCrop(current, out, dim.width, dim.height);
							break;
						case 'stretch':
							success = await resize(current, out, dim.width, dim.height);
							break;
						default:
							success = await scaleWithPadding(current, out, dim.width, dim.height);
					}
					if (success) count++;
				}

				logs.push({ type: 'success', message: `Generated ${count}/${spOpts.dimensions.length} images` });
				outputs.push(`${count} images → ${fileInfo.filename}_${folderName}/`);
				break;
			}
		}
	}

	// Cleanup any remaining temps
	cleanup(...temps);
	return { outputs, singleFilePath };
}

// ─────────────────────────────────────────────────────────────────────────────
// Main GUI Entry Point
// ─────────────────────────────────────────────────────────────────────────────

export async function runGUI(inputRaw: string): Promise<boolean> {
	let currentInput = normalizePath(inputRaw);

	if (!existsSync(currentInput)) {
		error(`File not found: ${currentInput}`);
		return false;
	}

	const dims = await getDimensions(currentInput);
	if (!dims) {
		error('Failed to read image dimensions');
		return false;
	}

	let currentBorderColor = await getBorderColor(currentInput);
	let currentFrameCount = isMultiFrame(currentInput) ? await getFrameCount(currentInput) : 1;
	const presets = loadPresets();

	// Helper to generate frame thumbnail
	async function generateFrameThumbnail(frameIndex: number): Promise<{ success: boolean; imageData?: string; error?: string }> {
		const tempDir = tmpdir();
		const tempOutput = join(tempDir, `piclet-frame-${Date.now()}-${frameIndex}.png`);
		try {
			if (!(await extractFirstFrame(currentInput, tempOutput, frameIndex))) {
				return { success: false, error: 'Failed to extract frame' };
			}
			// Scale down for thumbnail
			const thumbOutput = join(tempDir, `piclet-thumb-${Date.now()}-${frameIndex}.png`);
			await scaleToSize(tempOutput, thumbOutput, 96);
			const buffer = readFileSync(thumbOutput);
			cleanup(tempOutput, thumbOutput);
			return {
				success: true,
				imageData: `data:image/png;base64,${buffer.toString('base64')}`,
			};
		} catch (err) {
			cleanup(tempOutput);
			return { success: false, error: (err as Error).message };
		}
	}

	// Helper to generate processed frame preview (for thumbnails)
	async function generateFramePreview(
		frameIndex: number,
		opts: ToolOptions,
	): Promise<{ success: boolean; imageData?: string; error?: string }> {
		const tempDir = tmpdir();
		const ts = Date.now();
		const frameFile = join(tempDir, `piclet-fp-${ts}-${frameIndex}.png`);
		const temps: string[] = [frameFile];

		try {
			// Extract single frame
			if (!(await extractFirstFrame(currentInput, frameFile, frameIndex))) {
				return { success: false, error: 'Failed to extract frame' };
			}

			let current = frameFile;

			// Apply tools in order
			const activeTools = ['removebg', 'scale', 'icons'].filter(t => opts.tools.includes(t));

			for (const tool of activeTools) {
				const tempOut = join(tempDir, `piclet-fp-${ts}-${frameIndex}-${tool}.png`);
				temps.push(tempOut);

				switch (tool) {
					case 'removebg': {
						const rbOpts = opts.removebg!;
						let success = false;
						if (rbOpts.preserveInner && currentBorderColor) {
							success = await removeBackgroundBorderOnly(current, tempOut, currentBorderColor, rbOpts.fuzz);
						}
						if (!success && currentBorderColor) {
							success = await removeBackground(current, tempOut, currentBorderColor, rbOpts.fuzz);
						}
						if (success) {
							if (rbOpts.trim) {
								const trimOut = join(tempDir, `piclet-fp-${ts}-${frameIndex}-trim.png`);
								temps.push(trimOut);
								if (await trim(tempOut, trimOut)) {
									current = trimOut;
								} else {
									current = tempOut;
								}
							} else {
								current = tempOut;
							}
						}
						break;
					}
					case 'scale': {
						const scOpts = opts.scale!;
						if (scOpts.makeSquare) {
							const max = Math.max(scOpts.width, scOpts.height);
							if (await scaleWithPadding(current, tempOut, max, max)) {
								current = tempOut;
							}
						} else {
							if (await resize(current, tempOut, scOpts.width, scOpts.height)) {
								current = tempOut;
							}
						}
						break;
					}
					case 'icons': {
						const icOpts = opts.icons!;
						if (icOpts.trim) {
							const trimOut = join(tempDir, `piclet-fp-${ts}-${frameIndex}-ictrim.png`);
							temps.push(trimOut);
							if (await trim(current, trimOut)) {
								current = trimOut;
							}
						}
						if (icOpts.makeSquare) {
							if (await squarify(current, tempOut)) {
								current = tempOut;
							}
						}
						break;
					}
				}
			}

			// Scale down for thumbnail
			const thumbOut = join(tempDir, `piclet-fp-${ts}-${frameIndex}-thumb.png`);
			temps.push(thumbOut);
			await scaleToSize(current, thumbOut, 96);

			const buffer = readFileSync(thumbOut);
			cleanup(...temps);

			return {
				success: true,
				imageData: `data:image/png;base64,${buffer.toString('base64')}`,
			};
		} catch (err) {
			cleanup(...temps);
			return { success: false, error: (err as Error).message };
		}
	}

	return startGuiServer({
		htmlFile: 'piclet.html',
		title: 'PicLet',
		imageInfo: {
			filePath: currentInput,
			fileName: basename(currentInput),
			width: dims[0],
			height: dims[1],
			borderColor: currentBorderColor,
			frameCount: currentFrameCount,
		},
		defaults: {
			// Return full preset data for the UI
			presets: presets.map(p => ({
				id: p.id,
				name: p.name,
				description: p.description,
				icons: p.icons,
			})),
		},
		onPreview: async (opts) => {
			const toolOpts = opts as unknown as ToolOptions & { frameIndex?: number };
			// Allow empty tools array - will show original image
			if (!toolOpts.tools) {
				toolOpts.tools = [];
			}

			// For GIFs with frameIndex, preview that specific frame
			if (isMultiFrame(currentInput) && typeof toolOpts.frameIndex === 'number') {
				const tempDir = tmpdir();
				const ts = Date.now();
				const frameFile = join(tempDir, `piclet-prev-${ts}.png`);

				if (!(await extractFirstFrame(currentInput, frameFile, toolOpts.frameIndex))) {
					return { success: false, error: 'Failed to extract frame' };
				}

				// Generate preview with the extracted frame
				const result = await generateCombinedPreview(frameFile, currentBorderColor, toolOpts);
				cleanup(frameFile);
				return result;
			}

			return generateCombinedPreview(currentInput, currentBorderColor, toolOpts);
		},
		onProcess: async (opts) => {
			const logs: Array<{ type: string; message: string }> = [];
			const toolOpts = opts as unknown as ToolOptions & {
				exportMode?: 'frame' | 'all-frames' | 'gif';
				frameIndex?: number;
			};

			// Handle GIF export modes
			if (toolOpts.exportMode && isMultiFrame(currentInput)) {
				return processGifExport(currentInput, currentBorderColor, toolOpts, logs);
			}

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

			const result = await processCombined(currentInput, currentBorderColor, toolOpts, logs);

			if (result.outputs.length > 0) {
				return {
					success: true,
					output: result.outputs.join('\n'),
					outputPath: result.singleFilePath,
					logs,
				};
			}

			return { success: false, error: 'Processing failed', logs };
		},
		onLoadImage: async (data) => {
			try {
				// Save base64 data to temp file
				const ext = extname(data.fileName) || '.png';
				const tempPath = join(tmpdir(), `piclet-load-${Date.now()}${ext}`);
				const buffer = Buffer.from(data.data, 'base64');
				writeFileSync(tempPath, buffer);

				// Get dimensions and border color
				const newDims = await getDimensions(tempPath);
				if (!newDims) {
					cleanup(tempPath);
					return { success: false, error: 'Failed to read image dimensions' };
				}

				const newBorderColor = await getBorderColor(tempPath);
				const newFrameCount = isMultiFrame(tempPath) ? await getFrameCount(tempPath) : 1;

				// Update current image
				currentInput = tempPath;
				currentBorderColor = newBorderColor;
				currentFrameCount = newFrameCount;

				return {
					success: true,
					filePath: tempPath,
					fileName: data.fileName,
					width: newDims[0],
					height: newDims[1],
					borderColor: newBorderColor,
					frameCount: newFrameCount,
				};
			} catch (err) {
				return { success: false, error: (err as Error).message };
			}
		},
		onFrameThumbnail: generateFrameThumbnail,
		onFramePreview: async (frameIndex, opts) => {
			const toolOpts = opts as unknown as ToolOptions;
			if (!toolOpts.tools) toolOpts.tools = [];
			return generateFramePreview(frameIndex, toolOpts);
		},
		onSimplifyGif: async (skipFactor) => {
			try {
				// Create simplified GIF in temp location
				const tempPath = join(tmpdir(), `piclet-simplified-${Date.now()}.gif`);
				const result = await simplifyGif(currentInput, tempPath, skipFactor);

				if (!result.success) {
					return { success: false, error: 'Failed to simplify GIF' };
				}

				// Get dimensions of simplified GIF
				const newDims = await getDimensions(tempPath);
				if (!newDims) {
					cleanup(tempPath);
					return { success: false, error: 'Failed to read simplified GIF dimensions' };
				}

				// Update current input to the simplified version
				currentInput = tempPath;
				currentFrameCount = result.frameCount ?? 1;

				return {
					success: true,
					filePath: tempPath,
					fileName: basename(currentInput),
					width: newDims[0],
					height: newDims[1],
					frameCount: currentFrameCount,
				};
			} catch (err) {
				return { success: false, error: (err as Error).message };
			}
		},
		onDeleteFrame: async (frameIndex) => {
			try {
				const tempPath = join(tmpdir(), `piclet-edited-${Date.now()}.gif`);
				const result = await deleteGifFrame(currentInput, tempPath, frameIndex);

				if (!result.success) {
					return { success: false, error: 'Failed to delete frame' };
				}

				// Update current input
				currentInput = tempPath;
				currentFrameCount = result.frameCount ?? 1;

				return { success: true, frameCount: currentFrameCount };
			} catch (err) {
				return { success: false, error: (err as Error).message };
			}
		},
		onReplaceFrame: async (frameIndex, imageData) => {
			try {
				// Save base64 image data to temp file
				const buffer = Buffer.from(imageData, 'base64');
				const tempImagePath = join(tmpdir(), `piclet-replace-${Date.now()}.png`);
				writeFileSync(tempImagePath, buffer);

				const tempPath = join(tmpdir(), `piclet-edited-${Date.now()}.gif`);
				const result = await replaceGifFrame(currentInput, tempPath, frameIndex, tempImagePath);

				// Cleanup temp image
				cleanup(tempImagePath);

				if (!result.success) {
					return { success: false, error: 'Failed to replace frame' };
				}

				// Update current input
				currentInput = tempPath;
				currentFrameCount = result.frameCount ?? currentFrameCount;

				return { success: true, frameCount: currentFrameCount };
			} catch (err) {
				return { success: false, error: (err as Error).message };
			}
		},
	});
}

// ─────────────────────────────────────────────────────────────────────────────
// GIF Export Processing
// ─────────────────────────────────────────────────────────────────────────────

async function processGifExport(
	input: string,
	borderColor: string | null,
	opts: ToolOptions & { exportMode?: string; frameIndex?: number },
	logs: Array<{ type: string; message: string }>,
): Promise<{ success: boolean; output?: string; outputPath?: string; error?: string; logs: Array<{ type: string; message: string }> }> {
	if (!(await checkImageMagick())) {
		return {
			success: false,
			error: 'ImageMagick not found',
			logs: [{ type: 'error', message: 'ImageMagick not found' }],
		};
	}

	const fileInfo = getFileInfo(input);
	const tempDir = tmpdir();
	const ts = Date.now();

	switch (opts.exportMode) {
		case 'frame': {
			// Export single selected frame
			const frameIndex = opts.frameIndex ?? 0;
			logs.push({ type: 'info', message: `Exporting frame ${frameIndex + 1}...` });

			const frameFile = join(tempDir, `piclet-export-${ts}.png`);
			if (!(await extractFirstFrame(input, frameFile, frameIndex))) {
				logs.push({ type: 'error', message: 'Failed to extract frame' });
				return { success: false, error: 'Failed to extract frame', logs };
			}

			// Apply tools if any
			let outputFile = frameFile;
			if (opts.tools && opts.tools.length > 0) {
				const processedLogs: Array<{ type: string; message: string }> = [];
				const result = await processCombined(frameFile, borderColor, opts, processedLogs);
				logs.push(...processedLogs);

				if (result.outputs.length === 0) {
					cleanup(frameFile);
					return { success: false, error: 'Processing failed', logs };
				}
			}

			// Move to final location
			const finalOutput = `${fileInfo.dirname}/${fileInfo.filename}_frame${frameIndex + 1}.png`;
			if (outputFile === frameFile) {
				renameSync(frameFile, finalOutput);
			}

			logs.push({ type: 'success', message: `Exported frame ${frameIndex + 1}` });
			return { success: true, output: basename(finalOutput), logs };
		}

		case 'all-frames': {
			// Export all frames as PNGs
			logs.push({ type: 'info', message: 'Extracting all frames...' });

			const outputDir = `${fileInfo.dirname}/${fileInfo.filename}_frames`;
			mkdirSync(outputDir, { recursive: true });

			const frames = await extractAllFrames(input, outputDir, 'frame');

			if (frames.length === 0) {
				logs.push({ type: 'error', message: 'Failed to extract frames' });
				return { success: false, error: 'Failed to extract frames', logs };
			}

			// Apply tools to each frame if any
			if (opts.tools && opts.tools.length > 0) {
				logs.push({ type: 'info', message: `Processing ${frames.length} frames...` });
				for (let i = 0; i < frames.length; i++) {
					const frameLogs: Array<{ type: string; message: string }> = [];
					await processCombined(frames[i], borderColor, opts, frameLogs);
				}
				logs.push({ type: 'success', message: `Processed ${frames.length} frames` });
			}

			logs.push({ type: 'success', message: `Exported ${frames.length} frames` });
			return { success: true, output: `${frames.length} frames -> ${fileInfo.filename}_frames/`, logs };
		}

		case 'gif': {
			// Process and export as GIF
			logs.push({ type: 'info', message: 'Processing GIF...' });

			// Use standard processing which handles GIFs with -coalesce
			const result = await processCombined(input, borderColor, opts, logs);

			if (result.outputs.length > 0) {
				return { success: true, output: result.outputs.join('\n'), outputPath: result.singleFilePath, logs };
			}

			return { success: false, error: 'Processing failed', logs };
		}

		default:
			return { success: false, error: 'Unknown export mode', logs };
	}
}

export const config = {
	id: 'piclet',
	name: 'PicLet',
	icon: 'banana.ico',
	extensions: ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico'],
};
