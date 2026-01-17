import { join } from 'node:path';
import { wslToWindows } from '../lib/paths.js';
import { addRegistryKey, deleteRegistryKey } from '../lib/registry.js';
import { getAllExtensions, getToolsForExtension, picletTool, tuiTools } from './tools.js';
import { getDistDir, getMenuBasePath } from './utils.js';

/** Tool registration result */
export interface RegistrationResult {
	extension: string;
	toolName: string;
	success: boolean;
}

/** Register unified PicLet menu item directly on context menu (no submenu) */
async function registerUnifiedMenu(
	extension: string,
	iconsDir: string,
	launcherPath: string,
): Promise<RegistrationResult> {
	const basePath = `HKCU\\Software\\Classes\\SystemFileAssociations\\${extension}\\shell\\PicLet`;
	const iconsDirWin = wslToWindows(iconsDir);
	const launcherWin = wslToWindows(launcherPath);

	// Create direct PicLet menu item (not a submenu)
	const menuSuccess = await addRegistryKey(basePath, 'MUIVerb', 'PicLet');
	const iconSuccess = await addRegistryKey(basePath, 'Icon', `${iconsDirWin}\\banana.ico`);

	// Enable multi-select
	await addRegistryKey(basePath, 'MultiSelectModel', 'Player');

	// Command - opens unified GUI
	const commandValue = `wscript.exe //B "${launcherWin}" piclet "%1" -g`;
	const cmdSuccess = await addRegistryKey(`${basePath}\\command`, '', commandValue);

	return {
		extension,
		toolName: 'PicLet',
		success: menuSuccess && iconSuccess && cmdSuccess,
	};
}

/** Register PicLet submenu for a single extension (legacy - individual tools) */
async function registerMenuForExtension(
	extension: string,
	iconsDir: string,
	launcherPath: string,
): Promise<RegistrationResult[]> {
	const results: RegistrationResult[] = [];
	const basePath = getMenuBasePath(extension);
	const iconsDirWin = wslToWindows(iconsDir);
	const launcherWin = wslToWindows(launcherPath);
	const extensionTools = getToolsForExtension(extension);

	// Create parent PicLet menu
	await addRegistryKey(basePath, 'MUIVerb', 'PicLet');
	await addRegistryKey(basePath, 'Icon', `${iconsDirWin}\\banana.ico`);
	await addRegistryKey(basePath, 'SubCommands', '');

	// Create submenu for each tool
	for (const { config } of extensionTools) {
		const toolPath = `${basePath}\\shell\\${config.id}`;

		const menuSuccess = await addRegistryKey(toolPath, 'MUIVerb', config.name);
		const iconSuccess = await addRegistryKey(
			toolPath,
			'Icon',
			`${iconsDirWin}\\${config.icon}`,
		);

		// Enable multi-select
		await addRegistryKey(toolPath, 'MultiSelectModel', 'Player');

		// Command - use VBScript launcher for hidden cmd.exe window
		let commandValue: string;
		if (tuiTools.includes(config.id)) {
			// GUI mode - opens Edge app window
			commandValue = `wscript.exe //B "${launcherWin}" ${config.id} "%1" -g`;
		} else {
			// Run headless with defaults
			commandValue = `wscript.exe //B "${launcherWin}" ${config.id} "%1" -y`;
		}
		const cmdSuccess = await addRegistryKey(
			`${toolPath}\\command`,
			'',
			commandValue,
		);

		results.push({
			extension,
			toolName: config.name,
			success: menuSuccess && iconSuccess && cmdSuccess,
		});
	}

	return results;
}

/** Unregister PicLet menu for a single extension */
async function unregisterMenuForExtension(
	extension: string,
): Promise<RegistrationResult[]> {
	const results: RegistrationResult[] = [];
	const basePath = getMenuBasePath(extension);
	const extensionTools = getToolsForExtension(extension);

	// Delete each tool's submenu
	for (const { config } of extensionTools) {
		const toolPath = `${basePath}\\shell\\${config.id}`;
		await deleteRegistryKey(`${toolPath}\\command`);
		const success = await deleteRegistryKey(toolPath);

		results.push({
			extension,
			toolName: config.name,
			success,
		});
	}

	// Delete the shell container
	await deleteRegistryKey(`${basePath}\\shell`);

	// Delete parent PicLet menu
	await deleteRegistryKey(basePath);

	return results;
}

/** Register all tools - unified mode (single PicLet menu item) */
export async function registerAllTools(): Promise<RegistrationResult[]> {
	const distDir = getDistDir();
	const iconsDir = join(distDir, 'icons');
	const launcherPath = join(distDir, 'launcher.vbs');
	const results: RegistrationResult[] = [];

	// Register unified PicLet menu for each supported extension
	for (const extension of picletTool.config.extensions) {
		const result = await registerUnifiedMenu(extension, iconsDir, launcherPath);
		results.push(result);
	}

	return results;
}

/** Unregister all tools */
export async function unregisterAllTools(): Promise<RegistrationResult[]> {
	const results: RegistrationResult[] = [];

	// Unregister from all extensions (both unified and legacy)
	const allExts = new Set([...getAllExtensions(), ...picletTool.config.extensions]);
	for (const extension of allExts) {
		const basePath = getMenuBasePath(extension);

		// Try to delete any submenus (legacy)
		const extResults = await unregisterMenuForExtension(extension);
		results.push(...extResults);

		// Also delete the unified command if it exists
		await deleteRegistryKey(`${basePath}\\command`);
		await deleteRegistryKey(basePath);
	}

	return results;
}
