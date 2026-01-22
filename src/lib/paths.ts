import { existsSync, mkdirSync } from 'node:fs';
import { basename, dirname, extname, join, resolve } from 'node:path';

/**
 * Convert Windows path to WSL path
 * C:\Users\... → /mnt/c/Users/...
 */
export function windowsToWsl(winPath: string): string {
	// Already a WSL path
	if (winPath.startsWith('/mnt/')) {
		return winPath;
	}

	// Windows path pattern: C:\... or C:/...
	const match = winPath.match(/^([A-Za-z]):[/\\](.*)$/);
	if (match) {
		const drive = match[1].toLowerCase();
		const rest = match[2].replace(/\\/g, '/');
		return `/mnt/${drive}/${rest}`;
	}

	return winPath;
}

/**
 * Convert WSL path to Windows path
 * /mnt/c/Users/... → C:\Users\...
 */
export function wslToWindows(wslPath: string): string {
	const match = wslPath.match(/^\/mnt\/([a-z])\/(.*)$/i);
	if (match) {
		const drive = match[1].toUpperCase();
		const rest = match[2].replace(/\//g, '\\');
		return `${drive}:\\${rest}`;
	}
	return wslPath;
}

/**
 * Normalize a path - convert Windows paths if needed, resolve relative paths
 */
export function normalizePath(inputPath: string): string {
	if (/^[A-Za-z]:[/\\]/.test(inputPath)) {
		return windowsToWsl(inputPath);
	}
	return resolve(inputPath);
}

/**
 * Get file info from a path
 */
export interface FileInfo {
	dirname: string;
	basename: string;
	filename: string;
	extension: string;
}

export function getFileInfo(filePath: string): FileInfo {
	const dir = dirname(filePath);
	const base = basename(filePath);
	const ext = extname(filePath);
	const name = base.slice(0, -ext.length);

	return {
		dirname: dir,
		basename: base,
		filename: name,
		extension: ext,
	};
}

/**
 * Get the PicLet output directory for a given input file.
 * Creates a "PicLet" subdirectory in the same folder as the input.
 * Avoids nesting (won't create PicLet/PicLet).
 */
export function getOutputDir(inputPath: string): string {
	const dir = dirname(inputPath);
	// Avoid nesting if already in a PicLet directory
	if (basename(dir) === 'PicLet') {
		return dir;
	}
	return join(dir, 'PicLet');
}

/**
 * Ensure the PicLet output directory exists
 */
export function ensureOutputDir(inputPath: string): string {
	const outDir = getOutputDir(inputPath);
	if (!existsSync(outDir)) {
		mkdirSync(outDir, { recursive: true });
	}
	return outDir;
}

/**
 * Generate output path with suffix in PicLet subdirectory
 */
export function getOutputPath(
	inputPath: string,
	suffix: string,
	newExtension?: string,
): string {
	const info = getFileInfo(inputPath);
	const outDir = getOutputDir(inputPath);
	const ext = newExtension ?? info.extension;
	return join(outDir, `${info.filename}${suffix}${ext}`);
}
