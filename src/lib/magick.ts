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
 * Get GIF-optimized output command suffix
 * Uses -layers Optimize to properly save animated GIFs
 */
function getGifOutputSuffix(outputPath: string): string {
	return isGif(outputPath) ? ' -layers Optimize' : '';
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
 * Extract first frame from GIF/ICO for fast preview
 * Returns the input path if not a multi-frame format
 */
export async function extractFirstFrame(
	inputPath: string,
	outputPath: string,
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
		// Extract first frame only - much faster than processing all frames
		await execAsync(`convert "${inputPath}[0]" "${outputPath}"`);
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
