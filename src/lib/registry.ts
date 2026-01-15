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
	// Escape inner quotes for Windows command line
	const escapedValue = value.replace(/"/g, '\\"');
	const cmd = `reg.exe add "${keyPath}" ${valueArg} /t ${type} /d "${escapedValue}" /f`;

	try {
		await execAsync(cmd);
		return true;
	} catch (error) {
		const message = (error as Error).message;
		// Silently ignore WSL interop errors (can't run reg.exe)
		const ignoredErrors = ['Exec format error', 'not found'];
		const shouldIgnore = ignoredErrors.some((e) =>
			message.toLowerCase().includes(e.toLowerCase()),
		);
		if (!shouldIgnore) {
			console.error(`Failed to add registry key: ${keyPath}`);
			console.error(message);
		}
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
		const message = (error as Error).message;
		// Silently ignore expected errors:
		// - "unable to find" = key doesn't exist
		// - "Exec format error" = WSL can't run reg.exe (interop disabled)
		// - "not found" = reg.exe not in PATH
		const ignoredErrors = ['unable to find', 'Exec format error', 'not found'];
		const shouldIgnore = ignoredErrors.some((e) =>
			message.toLowerCase().includes(e.toLowerCase()),
		);
		if (!shouldIgnore) {
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
