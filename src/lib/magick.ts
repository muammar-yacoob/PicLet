import { exec } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, unlinkSync } from 'node:fs';
import { dirname } from 'node:path';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

/**
 * Get input path with frame selector for multi-frame formats (ICO)
 * ICO files contain multiple resolutions - [0] selects the largest
 * Used for operations that need a single frame (icon generation)
 */
function getInputSelector(imagePath: string): string {
	const lowerPath = imagePath.toLowerCase();
	if (lowerPath.endsWith('.ico')) {
		return `"${imagePath}[0]"`;
	}
	return `"${imagePath}"`;
}

/**
 * Get input path for preview (first frame only for GIFs and ICOs)
 * This prevents slow processing of all animation frames during preview
 */
function getPreviewInputSelector(imagePath: string): string {
	const lowerPath = imagePath.toLowerCase();
	if (lowerPath.endsWith('.ico') || lowerPath.endsWith('.gif')) {
		return `"${imagePath}[0]"`;
	}
	return `"${imagePath}"`;
}

/**
 * Check if file is an animated GIF
 */
function isGif(imagePath: string): boolean {
	return imagePath.toLowerCase().endsWith('.gif');
}

/**
 * Get GIF output command suffix (placeholder for future optimization)
 * No layer optimization is used to ensure each frame is stored as a complete image,
 * preventing overlap artifacts when frames are extracted individually.
 */
function getGifOutputSuffix(_outputPath: string): string {
	return '';
}

/**
 * Get coalesce prefix for GIF input (processes all frames properly)
 */
function getCoalescePrefix(inputPath: string): string {
	return isGif(inputPath) ? '-coalesce ' : '';
}

/**
 * Check if ImageMagick is installed
 */
export async function checkImageMagick(): Promise<boolean> {
	try {
		await execAsync('command -v convert');
		return true;
	} catch {
		return false;
	}
}

/**
 * Get image dimensions
 * Returns [width, height] or null on error
 * Uses first frame only for multi-frame formats (GIF, ICO)
 */
export async function getDimensions(
	imagePath: string,
): Promise<[number, number] | null> {
	try {
		const input = getPreviewInputSelector(imagePath);
		const { stdout } = await execAsync(
			`convert ${input} -ping -format "%w %h" info:`,
		);
		const [w, h] = stdout.trim().split(' ').map(Number);
		if (Number.isNaN(w) || Number.isNaN(h)) return null;
		return [w, h];
	} catch {
		return null;
	}
}

/**
 * Get border color (samples top-left pixel)
 * Uses first frame only for multi-frame formats (GIF, ICO)
 */
export async function getBorderColor(
	imagePath: string,
): Promise<string | null> {
	try {
		const input = getPreviewInputSelector(imagePath);
		const { stdout } = await execAsync(
			`convert ${input} -format "%[pixel:u.p{0,0}]" info:`,
		);
		return stdout.trim();
	} catch {
		return null;
	}
}

/**
 * Trim transparent/whitespace edges from image
 * Preserves animation for GIF files
 */
export async function trim(
	inputPath: string,
	outputPath: string,
): Promise<boolean> {
	try {
		const coalesce = getCoalescePrefix(inputPath);
		const gifSuffix = getGifOutputSuffix(outputPath);
		await execAsync(`convert "${inputPath}" ${coalesce}-trim +repage${gifSuffix} "${outputPath}"`);
		return true;
	} catch {
		return false;
	}
}

/**
 * Make image square by adding transparent padding
 * Preserves animation for GIF files
 */
export async function squarify(
	inputPath: string,
	outputPath: string,
): Promise<boolean> {
	const dims = await getDimensions(inputPath);
	if (!dims) return false;

	const [width, height] = dims;

	// Already square - just copy
	if (width === height) {
		if (inputPath !== outputPath) {
			copyFileSync(inputPath, outputPath);
		}
		return true;
	}

	const size = Math.max(width, height);
	const coalesce = getCoalescePrefix(inputPath);
	const gifSuffix = getGifOutputSuffix(outputPath);

	try {
		await execAsync(
			`convert "${inputPath}" ${coalesce}-background none -gravity center -extent ${size}x${size}${gifSuffix} "${outputPath}"`,
		);
		return true;
	} catch {
		return false;
	}
}

/**
 * Scale image to specific size with transparent padding
 */
export async function scaleToSize(
	inputPath: string,
	outputPath: string,
	size: number,
): Promise<boolean> {
	try {
		await execAsync(
			`convert "${inputPath}" -resize ${size}x${size} -background none -gravity center -extent ${size}x${size} "${outputPath}"`,
		);
		return true;
	} catch {
		return false;
	}
}

/**
 * Scale image with custom dimensions and padding
 * Preserves animation for GIF files
 */
export async function scaleWithPadding(
	inputPath: string,
	outputPath: string,
	width: number,
	height: number,
): Promise<boolean> {
	try {
		const coalesce = getCoalescePrefix(inputPath);
		const gifSuffix = getGifOutputSuffix(outputPath);
		await execAsync(
			`convert "${inputPath}" ${coalesce}-resize ${width}x${height} -background none -gravity center -extent ${width}x${height}${gifSuffix} "${outputPath}"`,
		);
		return true;
	} catch {
		return false;
	}
}

/**
 * Scale image to exact dimensions (may distort)
 * Preserves animation for GIF files
 */
export async function resize(
	inputPath: string,
	outputPath: string,
	width: number,
	height: number,
): Promise<boolean> {
	try {
		const coalesce = getCoalescePrefix(inputPath);
		const gifSuffix = getGifOutputSuffix(outputPath);
		await execAsync(
			`convert "${inputPath}" ${coalesce}-resize ${width}x${height}!${gifSuffix} "${outputPath}"`,
		);
		return true;
	} catch {
		return false;
	}
}

/**
 * Scale image to fill area and crop to exact size (cover mode)
 * Preserves animation for GIF files
 */
export async function scaleFillCrop(
	inputPath: string,
	outputPath: string,
	width: number,
	height: number,
): Promise<boolean> {
	try {
		const coalesce = getCoalescePrefix(inputPath);
		const gifSuffix = getGifOutputSuffix(outputPath);
		await execAsync(
			`convert "${inputPath}" ${coalesce}-resize ${width}x${height}^ -background none -gravity center -extent ${width}x${height}${gifSuffix} "${outputPath}"`,
		);
		return true;
	} catch {
		return false;
	}
}

/**
 * Remove background color from image
 * Preserves animation for GIF files
 */
export async function removeBackground(
	inputPath: string,
	outputPath: string,
	color: string,
	fuzz: number,
): Promise<boolean> {
	try {
		const coalesce = getCoalescePrefix(inputPath);
		const gifSuffix = getGifOutputSuffix(outputPath);
		await execAsync(
			`convert "${inputPath}" ${coalesce}-fuzz ${fuzz}% -transparent "${color}"${gifSuffix} "${outputPath}"`,
		);
		return true;
	} catch {
		return false;
	}
}

/**
 * Remove background using flood-fill from edges only
 * Preserves animation for GIF files
 */
export async function removeBackgroundBorderOnly(
	inputPath: string,
	outputPath: string,
	color: string,
	fuzz: number,
): Promise<boolean> {
	try {
		const coalesce = getCoalescePrefix(inputPath);
		const gifSuffix = getGifOutputSuffix(outputPath);
		await execAsync(
			`convert "${inputPath}" ${coalesce}-bordercolor "${color}" -border 1x1 -fill none -fuzz ${fuzz}% -draw "matte 0,0 floodfill" -shave 1x1${gifSuffix} "${outputPath}"`,
		);
		return true;
	} catch {
		return false;
	}
}

/**
 * Remove background with edge feathering for smoother cutouts
 * Uses flood-fill from borders, then applies edge feathering for soft transitions
 * This produces cleaner edges without harsh jagged boundaries
 *
 * @param featherAmount - Edge feathering radius (0-100, higher = softer edges)
 */
export async function removeBackgroundEdgeAware(
	inputPath: string,
	outputPath: string,
	color: string,
	fuzz: number,
	featherAmount = 50,
): Promise<boolean> {
	try {
		// Map feather amount (0-100) to blur radius (0.5 to 3 pixels)
		const featherRadius = 0.5 + (featherAmount / 100) * 2.5;
		const coalesce = getCoalescePrefix(inputPath);

		if (isGif(inputPath)) {
			// For GIFs: use -channel A -blur to feather alpha on each frame directly
			// (+clone approach doesn't work with multi-frame images)
			await execAsync(
				`convert "${inputPath}" ${coalesce}` +
				`-bordercolor "${color}" -border 1x1 ` +
				`-fill none -fuzz ${fuzz}% -draw "matte 0,0 floodfill" ` +
				`-shave 1x1 ` +
				`-channel A -blur 0x${featherRadius} +channel ` +
				`"${outputPath}"`,
			);
		} else {
			// For single images: use +clone approach for precise alpha feathering
			await execAsync(
				`convert "${inputPath}" ` +
				`-bordercolor "${color}" -border 1x1 ` +
				`-fill none -fuzz ${fuzz}% -draw "matte 0,0 floodfill" ` +
				`-shave 1x1 ` +
				`\\( +clone -alpha extract -blur 0x${featherRadius} \\) ` +
				`-compose CopyOpacity -composite ` +
				`"${outputPath}"`,
			);
		}
		return true;
	} catch {
		// Fall back to standard border-only method
		return removeBackgroundBorderOnly(inputPath, outputPath, color, fuzz);
	}
}

/**
 * Create ICO file with multiple resolutions
 */
export async function createIco(
	inputPath: string,
	outputPath: string,
	sizes: number[] = [256, 128, 64, 48, 32, 16],
): Promise<boolean> {
	try {
		const sizeStr = sizes.join(',');
		await execAsync(
			`convert "${inputPath}" -define icon:auto-resize=${sizeStr} "${outputPath}"`,
		);
		return true;
	} catch {
		return false;
	}
}

/**
 * Create ICO from multiple PNG files
 */
export async function createIcoFromMultiple(
	pngPaths: string[],
	outputPath: string,
): Promise<boolean> {
	try {
		const inputs = pngPaths.map((p) => `"${p}"`).join(' ');
		await execAsync(`convert ${inputs} "${outputPath}"`);
		return true;
	} catch {
		return false;
	}
}

/**
 * Ensure output directory exists
 */
export function ensureDir(filePath: string): void {
	const dir = dirname(filePath);
	if (!existsSync(dir)) {
		mkdirSync(dir, { recursive: true });
	}
}

/**
 * Clean up temporary files
 */
export function cleanup(...files: string[]): void {
	for (const file of files) {
		try {
			if (existsSync(file)) {
				unlinkSync(file);
			}
		} catch {
			// Ignore cleanup errors
		}
	}
}

/**
 * Extract a frame from GIF/ICO for preview
 * @param frameIndex - Which frame to extract (default 0 = first frame)
 * Returns the input path if not a multi-frame format
 *
 * OPTIMIZED: Instead of coalescing ALL frames then extracting one,
 * we only coalesce frames 0 through frameIndex, which is much faster
 * for GIFs with many frames.
 */
export async function extractFirstFrame(
	inputPath: string,
	outputPath: string,
	frameIndex = 0,
): Promise<boolean> {
	const lowerPath = inputPath.toLowerCase();
	if (!lowerPath.endsWith('.gif') && !lowerPath.endsWith('.ico')) {
		// Not a multi-frame format, just copy
		try {
			copyFileSync(inputPath, outputPath);
			return true;
		} catch {
			return false;
		}
	}

	try {
		if (lowerPath.endsWith('.gif')) {
			if (frameIndex === 0) {
				// Frame 0 is always complete - no coalescing needed
				await execAsync(`convert "${inputPath}[0]" "${outputPath}"`);
			} else {
				// Only load and coalesce frames 0 through frameIndex, then keep only the last one
				// This is MUCH faster than coalescing all frames
				await execAsync(
					`convert "${inputPath}[0-${frameIndex}]" -coalesce -delete 0--2 "${outputPath}"`,
				);
			}
		} else {
			// ICO files don't need coalescing
			await execAsync(`convert "${inputPath}[${frameIndex}]" "${outputPath}"`);
		}
		return true;
	} catch {
		return false;
	}
}

/**
 * Check if file is a multi-frame format (GIF or ICO)
 */
export function isMultiFrame(imagePath: string): boolean {
	const lowerPath = imagePath.toLowerCase();
	return lowerPath.endsWith('.gif') || lowerPath.endsWith('.ico');
}

/**
 * Get frame count from animated GIF
 */
export async function getFrameCount(imagePath: string): Promise<number> {
	try {
		const { stdout } = await execAsync(
			`identify -format "%n\\n" "${imagePath}" | head -1`,
		);
		const count = parseInt(stdout.trim(), 10);
		return Number.isNaN(count) ? 1 : count;
	} catch {
		return 1;
	}
}

/**
 * Get the frame delay of a GIF in centiseconds (1/100th of a second)
 * Returns the delay of the first frame (most GIFs use uniform delay)
 */
export async function getGifDelay(imagePath: string): Promise<number> {
	try {
		const { stdout } = await execAsync(
			`identify -format "%T\\n" "${imagePath}" | head -1`,
		);
		const delay = parseInt(stdout.trim(), 10);
		return Number.isNaN(delay) || delay <= 0 ? 10 : delay; // Default 10cs (100ms)
	} catch {
		return 10;
	}
}

/**
 * Set uniform frame delay on a GIF (in centiseconds)
 * Modifies the file in-place
 */
export async function setGifDelay(imagePath: string, delayCentiseconds: number): Promise<boolean> {
	try {
		await execAsync(
			`convert "${imagePath}" -delay ${delayCentiseconds} "${imagePath}"`,
		);
		return true;
	} catch {
		return false;
	}
}

/**
 * Extract all frames from animated GIF to individual PNG files
 * Returns array of output file paths
 *
 * OPTIMIZED: Uses +adjoin for direct file output without intermediate buffering
 */
export async function extractAllFrames(
	inputPath: string,
	outputDir: string,
	baseName: string,
): Promise<string[]> {
	try {
		// Ensure output directory exists
		ensureDir(`${outputDir}/dummy`);

		// Extract frames with optimizations:
		// - coalesce: properly handle delta-encoded frames
		// - +adjoin: write frames directly to separate files (more efficient)
		await execAsync(
			`convert "${inputPath}" -coalesce +adjoin "${outputDir}/${baseName}-%04d.png"`,
		);

		// Get list of created files
		const { stdout } = await execAsync(`ls -1 "${outputDir}/${baseName}"-*.png 2>/dev/null || true`);
		const files = stdout.trim().split('\n').filter(f => f.length > 0);
		return files;
	} catch {
		return [];
	}
}

/**
 * Flip image horizontally (mirror)
 * Preserves animation for GIF files
 */
export async function flipHorizontal(
	inputPath: string,
	outputPath: string,
): Promise<boolean> {
	try {
		const coalesce = getCoalescePrefix(inputPath);
		const gifSuffix = getGifOutputSuffix(outputPath);
		await execAsync(
			`convert "${inputPath}" ${coalesce}-flop${gifSuffix} "${outputPath}"`,
		);
		return true;
	} catch {
		return false;
	}
}

/**
 * Flip image vertically
 * Preserves animation for GIF files
 */
export async function flipVertical(
	inputPath: string,
	outputPath: string,
): Promise<boolean> {
	try {
		const coalesce = getCoalescePrefix(inputPath);
		const gifSuffix = getGifOutputSuffix(outputPath);
		await execAsync(
			`convert "${inputPath}" ${coalesce}-flip${gifSuffix} "${outputPath}"`,
		);
		return true;
	} catch {
		return false;
	}
}

/**
 * Rotate image by specified degrees
 * Preserves animation for GIF files
 */
export async function rotate(
	inputPath: string,
	outputPath: string,
	degrees: number,
): Promise<boolean> {
	try {
		const coalesce = getCoalescePrefix(inputPath);
		const gifSuffix = getGifOutputSuffix(outputPath);
		await execAsync(
			`convert "${inputPath}" ${coalesce}-rotate ${degrees} -background none${gifSuffix} "${outputPath}"`,
		);
		return true;
	} catch {
		return false;
	}
}

/**
 * Apply grayscale filter
 * Preserves animation for GIF files
 */
export async function filterGrayscale(
	inputPath: string,
	outputPath: string,
): Promise<boolean> {
	try {
		const coalesce = getCoalescePrefix(inputPath);
		const gifSuffix = getGifOutputSuffix(outputPath);
		await execAsync(
			`convert "${inputPath}" ${coalesce}-colorspace Gray${gifSuffix} "${outputPath}"`,
		);
		return true;
	} catch {
		return false;
	}
}

/**
 * Apply sepia tone filter
 * Preserves animation for GIF files
 */
export async function filterSepia(
	inputPath: string,
	outputPath: string,
	intensity = 80,
): Promise<boolean> {
	try {
		const coalesce = getCoalescePrefix(inputPath);
		const gifSuffix = getGifOutputSuffix(outputPath);
		await execAsync(
			`convert "${inputPath}" ${coalesce}-sepia-tone ${intensity}%${gifSuffix} "${outputPath}"`,
		);
		return true;
	} catch {
		return false;
	}
}

/**
 * Invert image colors (negative)
 * Preserves animation for GIF files
 */
export async function filterInvert(
	inputPath: string,
	outputPath: string,
): Promise<boolean> {
	try {
		const coalesce = getCoalescePrefix(inputPath);
		const gifSuffix = getGifOutputSuffix(outputPath);
		await execAsync(
			`convert "${inputPath}" ${coalesce}-negate${gifSuffix} "${outputPath}"`,
		);
		return true;
	} catch {
		return false;
	}
}

/**
 * Apply vintage filter (desaturate + warm tint)
 * Preserves animation for GIF files
 */
export async function filterVintage(
	inputPath: string,
	outputPath: string,
): Promise<boolean> {
	try {
		const coalesce = getCoalescePrefix(inputPath);
		const gifSuffix = getGifOutputSuffix(outputPath);
		await execAsync(
			`convert "${inputPath}" ${coalesce}-modulate 100,70,100 -fill "#704214" -colorize 15%${gifSuffix} "${outputPath}"`,
		);
		return true;
	} catch {
		return false;
	}
}

/**
 * Increase saturation (vivid colors)
 * Preserves animation for GIF files
 */
export async function filterVivid(
	inputPath: string,
	outputPath: string,
): Promise<boolean> {
	try {
		const coalesce = getCoalescePrefix(inputPath);
		const gifSuffix = getGifOutputSuffix(outputPath);
		await execAsync(
			`convert "${inputPath}" ${coalesce}-modulate 100,130,100${gifSuffix} "${outputPath}"`,
		);
		return true;
	} catch {
		return false;
	}
}

/**
 * Add solid color border to image
 * Preserves animation for GIF files
 */
export async function addBorder(
	inputPath: string,
	outputPath: string,
	width: number,
	color: string,
): Promise<boolean> {
	try {
		const coalesce = getCoalescePrefix(inputPath);
		const gifSuffix = getGifOutputSuffix(outputPath);
		await execAsync(
			`convert "${inputPath}" ${coalesce}-bordercolor "${color}" -border ${width}${gifSuffix} "${outputPath}"`,
		);
		return true;
	} catch {
		return false;
	}
}

/**
 * Replace one color with another
 * Preserves animation for GIF files
 */
export async function replaceColor(
	inputPath: string,
	outputPath: string,
	fromColor: string,
	toColor: string,
	fuzz: number,
): Promise<boolean> {
	try {
		const coalesce = getCoalescePrefix(inputPath);
		const gifSuffix = getGifOutputSuffix(outputPath);
		await execAsync(
			`convert "${inputPath}" ${coalesce}-fuzz ${fuzz}% -fill "${toColor}" -opaque "${fromColor}"${gifSuffix} "${outputPath}"`,
		);
		return true;
	} catch {
		return false;
	}
}

/**
 * Delete a frame from animated GIF
 * @returns Object with success status and new frame count
 */
export async function deleteGifFrame(
	inputPath: string,
	outputPath: string,
	frameIndex: number,
): Promise<{ success: boolean; frameCount?: number }> {
	try {
		const originalCount = await getFrameCount(inputPath);
		if (originalCount <= 1) {
			return { success: false }; // Can't delete the only frame
		}
		if (frameIndex < 0 || frameIndex >= originalCount) {
			return { success: false };
		}

		// Coalesce first (full frames), then delete the specific frame
		await execAsync(
			`convert "${inputPath}" -coalesce -delete ${frameIndex} "${outputPath}"`,
		);

		const newCount = await getFrameCount(outputPath);
		return { success: true, frameCount: newCount };
	} catch {
		return { success: false };
	}
}

/**
 * Replace a frame in animated GIF with another image
 * The replacement image is scaled/cropped to match GIF dimensions
 * @returns Object with success status
 */
export async function replaceGifFrame(
	inputPath: string,
	outputPath: string,
	frameIndex: number,
	replacementPath: string,
): Promise<{ success: boolean; frameCount?: number }> {
	try {
		const frameCount = await getFrameCount(inputPath);
		if (frameIndex < 0 || frameIndex >= frameCount) {
			return { success: false };
		}

		// Get GIF dimensions
		const dims = await getDimensions(inputPath);
		if (!dims) return { success: false };

		// Scale/crop replacement to match GIF dimensions (cover mode + crop)
		const tempReplacement = `${outputPath}.tmp.png`;
		await execAsync(
			`convert "${replacementPath}" -resize ${dims[0]}x${dims[1]}^ -gravity center -extent ${dims[0]}x${dims[1]} "${tempReplacement}"`,
		);

		// Build frame list: all frames except the one being replaced
		// Then insert the replacement at the right position
		if (frameIndex === 0) {
			// Replace first frame
			await execAsync(
				`convert "${tempReplacement}" \\( "${inputPath}" -coalesce \\) -delete 1 "${outputPath}"`,
			);
		} else if (frameIndex === frameCount - 1) {
			// Replace last frame
			await execAsync(
				`convert \\( "${inputPath}" -coalesce -delete -1 \\) "${tempReplacement}" "${outputPath}"`,
			);
		} else {
			// Replace middle frame - need to split and rejoin
			await execAsync(
				`convert \\( "${inputPath}" -coalesce \\) -delete ${frameIndex} "${outputPath}.frames.gif" && ` +
				`convert "${outputPath}.frames.gif[0-${frameIndex - 1}]" "${tempReplacement}" "${outputPath}.frames.gif[${frameIndex}-]" "${outputPath}" && ` +
				`rm -f "${outputPath}.frames.gif"`,
			);
		}

		// Cleanup temp file
		try { unlinkSync(tempReplacement); } catch { /* ignore */ }

		const newCount = await getFrameCount(outputPath);
		return { success: true, frameCount: newCount };
	} catch {
		return { success: false };
	}
}

/**
 * Simplify animated GIF by keeping only every Nth frame
 * @param skipFactor - Keep every Nth frame (2 = keep every 2nd, 3 = every 3rd, etc.)
 * @returns Object with success status and new frame count
 *
 * This is useful for large GIFs that would be slow to process.
 * Skipping frames reduces processing time proportionally.
 */
export async function simplifyGif(
	inputPath: string,
	outputPath: string,
	skipFactor: number,
): Promise<{ success: boolean; frameCount?: number }> {
	if (skipFactor < 2) {
		// No simplification needed
		if (inputPath !== outputPath) {
			try {
				copyFileSync(inputPath, outputPath);
				const count = await getFrameCount(outputPath);
				return { success: true, frameCount: count };
			} catch {
				return { success: false };
			}
		}
		const count = await getFrameCount(inputPath);
		return { success: true, frameCount: count };
	}

	try {
		// Get original frame count and delay
		const originalCount = await getFrameCount(inputPath);
		if (originalCount <= 1) {
			// Not an animated GIF
			copyFileSync(inputPath, outputPath);
			return { success: true, frameCount: 1 };
		}

		const originalDelay = await getGifDelay(inputPath);
		// Multiply delay by skip factor to maintain the same playback duration
		const newDelay = originalDelay * skipFactor;

		// Build frame index list: 0, N, 2N, 3N, ...
		const frameIndices: number[] = [];
		for (let i = 0; i < originalCount; i += skipFactor) {
			frameIndices.push(i);
		}

		// Use ImageMagick to extract specific frames and reconstruct GIF
		// The -coalesce ensures proper rendering of delta-encoded frames
		// -delay adjusts timing to compensate for skipped frames
		const keepPattern = frameIndices.join(',');

		await execAsync(
			`convert "${inputPath}[${keepPattern}]" -coalesce -delay ${newDelay} "${outputPath}"`,
		);

		const newCount = await getFrameCount(outputPath);
		return { success: true, frameCount: newCount };
	} catch {
		return { success: false };
	}
}
