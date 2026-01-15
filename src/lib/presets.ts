/**
 * Presets configuration for store icon packs
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';

/** Single icon definition in a preset */
export interface PresetIcon {
	filename: string;
	width: number;
	height: number;
}

/** A complete preset definition */
export interface Preset {
	id: string;
	name: string;
	description: string;
	icons: PresetIcon[];
}

/** Presets file structure */
export interface PresetsConfig {
	version: number;
	presets: Preset[];
}

/** Built-in presets */
const BUILT_IN_PRESETS: Preset[] = [
	// ── Game Asset Stores ──
	{
		id: 'unity-asset',
		name: 'Unity Asset Store',
		description: 'Unity Asset Store package images',
		icons: [
			{ filename: 'icon-160.png', width: 160, height: 160 },
			{ filename: 'card-420x280.png', width: 420, height: 280 },
			{ filename: 'cover-1200x630.png', width: 1200, height: 630 },
			{ filename: 'screenshot-1920x1080.png', width: 1920, height: 1080 },
		],
	},
	{
		id: 'unreal-fab',
		name: 'Unreal / Fab',
		description: 'Unreal Marketplace & Fab assets',
		icons: [
			{ filename: 'icon-256.png', width: 256, height: 256 },
			{ filename: 'thumbnail-284.png', width: 284, height: 284 },
			{ filename: 'featured-894x488.png', width: 894, height: 488 },
			{ filename: 'gallery-1920x1080.png', width: 1920, height: 1080 },
		],
	},
	{
		id: 'godot-asset',
		name: 'Godot Asset Library',
		description: 'Godot Asset Library images',
		icons: [
			{ filename: 'icon-64.png', width: 64, height: 64 },
			{ filename: 'icon-128.png', width: 128, height: 128 },
			{ filename: 'screenshot-1280x720.png', width: 1280, height: 720 },
			{ filename: 'screenshot-1920x1080.png', width: 1920, height: 1080 },
		],
	},
	{
		id: 'blender-market',
		name: 'Blender Market',
		description: 'Blender Market product images',
		icons: [
			{ filename: 'icon-128.png', width: 128, height: 128 },
			{ filename: 'thumbnail-256.png', width: 256, height: 256 },
			{ filename: 'preview-1920x1080.png', width: 1920, height: 1080 },
		],
	},
	{
		id: 'steam',
		name: 'Steam',
		description: 'Steam store assets',
		icons: [
			{ filename: 'capsule-small-231x87.png', width: 231, height: 87 },
			{ filename: 'capsule-main-616x353.png', width: 616, height: 353 },
			{ filename: 'header-460x215.png', width: 460, height: 215 },
			{ filename: 'hero-1920x620.png', width: 1920, height: 620 },
			{ filename: 'library-capsule-600x900.png', width: 600, height: 900 },
			{ filename: 'library-hero-3840x1240.png', width: 3840, height: 1240 },
		],
	},
	{
		id: 'itch-io',
		name: 'itch.io',
		description: 'itch.io game page assets',
		icons: [
			{ filename: 'cover-630x500.png', width: 630, height: 500 },
			{ filename: 'thumbnail-315x250.png', width: 315, height: 250 },
			{ filename: 'banner-960x540.png', width: 960, height: 540 },
		],
	},
	// ── Extensions & Packages ──
	{
		id: 'chrome-extension',
		name: 'Chrome Extension',
		description: 'Chrome Web Store extension icons',
		icons: [
			{ filename: 'icon-16.png', width: 16, height: 16 },
			{ filename: 'icon-32.png', width: 32, height: 32 },
			{ filename: 'icon-48.png', width: 48, height: 48 },
			{ filename: 'icon-128.png', width: 128, height: 128 },
			{ filename: 'promo-440x280.png', width: 440, height: 280 },
			{ filename: 'promo-1400x560.png', width: 1400, height: 560 },
		],
	},
	{
		id: 'firefox-addon',
		name: 'Firefox Add-on',
		description: 'Firefox Add-ons icons',
		icons: [
			{ filename: 'icon-48.png', width: 48, height: 48 },
			{ filename: 'icon-96.png', width: 96, height: 96 },
			{ filename: 'icon-128.png', width: 128, height: 128 },
		],
	},
	{
		id: 'vscode-extension',
		name: 'VS Code Extension',
		description: 'VS Code Marketplace icons',
		icons: [
			{ filename: 'icon-128.png', width: 128, height: 128 },
			{ filename: 'icon-256.png', width: 256, height: 256 },
		],
	},
	{
		id: 'npm-package',
		name: 'npm Package',
		description: 'npm package icons',
		icons: [
			{ filename: 'logo-64.png', width: 64, height: 64 },
			{ filename: 'logo-128.png', width: 128, height: 128 },
			{ filename: 'logo-256.png', width: 256, height: 256 },
			{ filename: 'banner-1200x600.png', width: 1200, height: 600 },
		],
	},
	{
		id: 'windows-store',
		name: 'Windows Store',
		description: 'Microsoft Store app icons',
		icons: [
			{ filename: 'Square44x44Logo.png', width: 44, height: 44 },
			{ filename: 'Square150x150Logo.png', width: 150, height: 150 },
			{ filename: 'Square310x310Logo.png', width: 310, height: 310 },
			{ filename: 'Wide310x150Logo.png', width: 310, height: 150 },
			{ filename: 'StoreLogo-50.png', width: 50, height: 50 },
			{ filename: 'SplashScreen-620x300.png', width: 620, height: 300 },
		],
	},
];

/** Get presets file path */
export function getPresetsPath(): string {
	const picletDir = join(homedir(), '.piclet');
	return join(picletDir, 'presets.json');
}

/** Ensure presets directory exists */
function ensurePresetsDir(): void {
	const presetsPath = getPresetsPath();
	const dir = dirname(presetsPath);
	if (!existsSync(dir)) {
		mkdirSync(dir, { recursive: true });
	}
}

/** Load presets (built-in + user-defined) */
export function loadPresets(): Preset[] {
	const presetsPath = getPresetsPath();
	let userPresets: Preset[] = [];

	if (existsSync(presetsPath)) {
		try {
			const data = readFileSync(presetsPath, 'utf-8');
			const config: PresetsConfig = JSON.parse(data);
			userPresets = config.presets || [];
		} catch {
			// Ignore parse errors, use built-in only
		}
	}

	// Merge: built-in first, then user presets (user can override built-in by ID)
	const presetMap = new Map<string, Preset>();
	for (const preset of BUILT_IN_PRESETS) {
		presetMap.set(preset.id, preset);
	}
	for (const preset of userPresets) {
		presetMap.set(preset.id, preset);
	}

	return Array.from(presetMap.values());
}

/** Get a single preset by ID */
export function getPreset(id: string): Preset | undefined {
	const presets = loadPresets();
	return presets.find((p) => p.id === id);
}

/** Save user presets */
export function savePresets(presets: Preset[]): void {
	ensurePresetsDir();
	const config: PresetsConfig = {
		version: 1,
		presets,
	};
	writeFileSync(getPresetsPath(), JSON.stringify(config, null, 2));
}

/** Add or update a preset */
export function savePreset(preset: Preset): void {
	const presetsPath = getPresetsPath();
	let userPresets: Preset[] = [];

	if (existsSync(presetsPath)) {
		try {
			const data = readFileSync(presetsPath, 'utf-8');
			const config: PresetsConfig = JSON.parse(data);
			userPresets = config.presets || [];
		} catch {
			// Start fresh
		}
	}

	// Update or add
	const idx = userPresets.findIndex((p) => p.id === preset.id);
	if (idx >= 0) {
		userPresets[idx] = preset;
	} else {
		userPresets.push(preset);
	}

	savePresets(userPresets);
}

/** Get built-in preset IDs (for UI distinction) */
export function getBuiltInPresetIds(): string[] {
	return BUILT_IN_PRESETS.map((p) => p.id);
}

/** Delete a user-defined preset by ID */
export function deletePreset(id: string): { success: boolean; error?: string } {
	// Cannot delete built-in presets
	if (BUILT_IN_PRESETS.some((p) => p.id === id)) {
		return { success: false, error: 'Cannot delete built-in presets' };
	}

	const presetsPath = getPresetsPath();
	if (!existsSync(presetsPath)) {
		return { success: false, error: 'Preset not found' };
	}

	try {
		const data = readFileSync(presetsPath, 'utf-8');
		const config: PresetsConfig = JSON.parse(data);
		const userPresets = config.presets || [];

		const idx = userPresets.findIndex((p) => p.id === id);
		if (idx < 0) {
			return { success: false, error: 'Preset not found' };
		}

		userPresets.splice(idx, 1);
		savePresets(userPresets);
		return { success: true };
	} catch {
		return { success: false, error: 'Failed to delete preset' };
	}
}
