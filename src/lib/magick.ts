import { exec } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, unlinkSync } from 'node:fs';
import { dirname } from 'node:path';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

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
 */
export async function getDimensions(
	imagePath: string,
): Promise<[number, number] | null> {
	try {
		const { stdout } = await execAsync(
			`convert "${imagePath}" -ping -format "%w %h" info:`,
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
 */
export async function getBorderColor(
	imagePath: string,
): Promise<string | null> {
	try {
		const { stdout } = await execAsync(
			`convert "${imagePath}" -format "%[pixel:u.p{0,0}]" info:`,
		);
		return stdout.trim();
	} catch {
		return null;
	}
}

/**
 * Trim transparent/whitespace edges from image
 */
export async function trim(
	inputPath: string,
	outputPath: string,
): Promise<boolean> {
	try {
		await execAsync(`convert "${inputPath}" -trim +repage "${outputPath}"`);
		return true;
	} catch {
		return false;
	}
}

/**
 * Make image square by adding transparent padding
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

	try {
		await execAsync(
			`convert "${inputPath}" -background none -gravity center -extent ${size}x${size} "${outputPath}"`,
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
 */
export async function scaleWithPadding(
	inputPath: string,
	outputPath: string,
	width: number,
	height: number,
): Promise<boolean> {
	try {
		await execAsync(
			`convert "${inputPath}" -resize ${width}x${height} -background none -gravity center -extent ${width}x${height} "${outputPath}"`,
		);
		return true;
	} catch {
		return false;
	}
}

/**
 * Scale image to exact dimensions (may distort)
 */
export async function resize(
	inputPath: string,
	outputPath: string,
	width: number,
	height: number,
): Promise<boolean> {
	try {
		await execAsync(
			`convert "${inputPath}" -resize ${width}x${height}! "${outputPath}"`,
		);
		return true;
	} catch {
		return false;
	}
}

/**
 * Scale image to fill area and crop to exact size (cover mode)
 */
export async function scaleFillCrop(
	inputPath: string,
	outputPath: string,
	width: number,
	height: number,
): Promise<boolean> {
	try {
		await execAsync(
			`convert "${inputPath}" -resize ${width}x${height}^ -gravity center -extent ${width}x${height} "${outputPath}"`,
		);
		return true;
	} catch {
		return false;
	}
}

/**
 * Remove background color from image
 */
export async function removeBackground(
	inputPath: string,
	outputPath: string,
	color: string,
	fuzz: number,
): Promise<boolean> {
	try {
		await execAsync(
			`convert "${inputPath}" -fuzz ${fuzz}% -transparent "${color}" "${outputPath}"`,
		);
		return true;
	} catch {
		return false;
	}
}

/**
 * Remove background using flood-fill from edges only
 */
export async function removeBackgroundBorderOnly(
	inputPath: string,
	outputPath: string,
	color: string,
	fuzz: number,
): Promise<boolean> {
	try {
		await execAsync(
			`convert "${inputPath}" -bordercolor "${color}" -border 1x1 -fill none -fuzz ${fuzz}% -draw "matte 0,0 floodfill" -shave 1x1 "${outputPath}"`,
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
