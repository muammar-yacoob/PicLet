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
	{
		id: 'windows-store',
		name: 'Windows Store',
		description: 'Microsoft Store app icons',
		icons: [
			{ filename: 'Square44x44Logo.png', width: 44, height: 44 },
			{ filename: 'Square71x71Logo.png', width: 71, height: 71 },
			{ filename: 'Square150x150Logo.png', width: 150, height: 150 },
			{ filename: 'Square310x310Logo.png', width: 310, height: 310 },
			{ filename: 'Wide310x150Logo.png', width: 310, height: 150 },
			{ filename: 'StoreLogo.png', width: 50, height: 50 },
			{ filename: 'BadgeLogo.png', width: 24, height: 24 },
			{ filename: 'SplashScreen.png', width: 620, height: 300 },
		],
	},
	{
		id: 'office-store',
		name: 'Office Add-ins',
		description: 'Microsoft Office add-in icons',
		icons: [
			{ filename: 'icon-16.png', width: 16, height: 16 },
			{ filename: 'icon-32.png', width: 32, height: 32 },
			{ filename: 'icon-64.png', width: 64, height: 64 },
			{ filename: 'icon-80.png', width: 80, height: 80 },
			{ filename: 'icon-128.png', width: 128, height: 128 },
			{ filename: 'high-res-icon.png', width: 512, height: 512 },
		],
	},
	{
		id: 'unity-asset',
		name: 'Unity Asset Store',
		description: 'Unity Asset Store package icons',
		icons: [
			{ filename: 'icon.png', width: 128, height: 128 },
			{ filename: 'icon-large.png', width: 160, height: 160 },
			{ filename: 'card-image.png', width: 420, height: 280 },
			{ filename: 'cover-image.png', width: 1200, height: 630 },
			{ filename: 'social-media.png', width: 1280, height: 720 },
		],
	},
	{
		id: 'blender-market',
		name: 'Blender Market',
		description: 'Blender Market product images',
		icons: [
			{ filename: 'thumbnail.png', width: 256, height: 256 },
			{ filename: 'preview-small.png', width: 640, height: 360 },
			{ filename: 'preview-large.png', width: 1920, height: 1080 },
			{ filename: 'icon.png', width: 128, height: 128 },
		],
	},
	{
		id: 'steam',
		name: 'Steam',
		description: 'Steam store assets',
		icons: [
			{ filename: 'capsule-small.png', width: 231, height: 87 },
			{ filename: 'capsule-main.png', width: 616, height: 353 },
			{ filename: 'header.png', width: 460, height: 215 },
			{ filename: 'hero.png', width: 1920, height: 620 },
			{ filename: 'logo.png', width: 940, height: 400 },
			{ filename: 'library-capsule.png', width: 600, height: 900 },
			{ filename: 'library-hero.png', width: 3840, height: 1240 },
			{ filename: 'icon.png', width: 32, height: 32 },
		],
	},
	{
		id: 'itch-io',
		name: 'itch.io',
		description: 'itch.io game page assets',
		icons: [
			{ filename: 'cover.png', width: 630, height: 500 },
			{ filename: 'thumbnail.png', width: 315, height: 250 },
			{ filename: 'banner.png', width: 960, height: 540 },
			{ filename: 'icon.png', width: 64, height: 64 },
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
