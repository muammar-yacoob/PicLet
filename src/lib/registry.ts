import { exec } from 'node:child_process';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

/**
 * Check if running inside WSL
 */
export function isWSL(): boolean {
	return (
		process.platform === 'linux' &&
		(process.env.WSL_DISTRO_NAME !== undefined ||
			process.env.WSLENV !== undefined)
	);
}

/**
 * Convert WSL path to Windows path
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
 * Convert Windows path to WSL path
 */
export function windowsToWsl(winPath: string): string {
	const match = winPath.match(/^([A-Za-z]):\\(.*)$/);
	if (match) {
		const drive = match[1].toLowerCase();
		const rest = match[2].replace(/\\/g, '/');
		return `/mnt/${drive}/${rest}`;
	}
	return winPath;
}

/**
 * Get the directory where this module is located
 */
export function getModuleDir(): string {
	const currentFile = fileURLToPath(import.meta.url);
	return dirname(currentFile);
}

/**
 * Add a registry key with value
 */
export async function addRegistryKey(
	keyPath: string,
	valueName: string,
	value: string,
	type = 'REG_SZ',
): Promise<boolean> {
	const valueArg = valueName ? `/v "${valueName}"` : '/ve';
	const cmd = `reg.exe add "${keyPath}" ${valueArg} /t ${type} /d "${value}" /f`;

	try {
		await execAsync(cmd);
		return true;
	} catch (error) {
		console.error(`Failed to add registry key: ${keyPath}`);
		console.error((error as Error).message);
		return false;
	}
}

/**
 * Delete a registry key
 */
export async function deleteRegistryKey(keyPath: string): Promise<boolean> {
	const cmd = `reg.exe delete "${keyPath}" /f`;

	try {
		await execAsync(cmd);
		return true;
	} catch (error) {
		// Key might not exist, which is fine
		if (!(error as Error).message.includes('unable to find')) {
			console.error(`Failed to delete registry key: ${keyPath}`);
		}
		return false;
	}
}

/**
 * Check if a registry key exists
 */
export async function registryKeyExists(keyPath: string): Promise<boolean> {
	const cmd = `reg.exe query "${keyPath}" 2>/dev/null`;

	try {
		await execAsync(cmd);
		return true;
	} catch {
		return false;
	}
}
