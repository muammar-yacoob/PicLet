import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';

/** PicLet configuration */
export interface PicLetConfig {
	removeBg: {
		fuzz: number;
		trim: boolean;
		preserveInner: boolean;
		makeSquare: boolean;
	};
	rescale: {
		defaultScale: number;
		makeSquare: boolean;
	};
	iconpack: {
		platforms: ('web' | 'android' | 'ios')[];
	};
}

/** Default configuration */
export const DEFAULT_CONFIG: PicLetConfig = {
	removeBg: {
		fuzz: 10,
		trim: true,
		preserveInner: false,
		makeSquare: false,
	},
	rescale: {
		defaultScale: 50,
		makeSquare: false,
	},
	iconpack: {
		platforms: ['web', 'android', 'ios'],
	},
};

/** Get config directory path */
function getConfigDir(): string {
	return join(homedir(), '.config', 'piclet');
}

/** Get config file path */
export function getConfigPath(): string {
	return join(getConfigDir(), 'config.json');
}

/** Load configuration from file */
export function loadConfig(): PicLetConfig {
	const configPath = getConfigPath();

	if (!existsSync(configPath)) {
		return { ...DEFAULT_CONFIG };
	}

	try {
		const content = readFileSync(configPath, 'utf-8');
		const loaded = JSON.parse(content) as Partial<PicLetConfig>;
		return {
			removeBg: { ...DEFAULT_CONFIG.removeBg, ...loaded.removeBg },
			rescale: { ...DEFAULT_CONFIG.rescale, ...loaded.rescale },
			iconpack: { ...DEFAULT_CONFIG.iconpack, ...loaded.iconpack },
		};
	} catch {
		return { ...DEFAULT_CONFIG };
	}
}

/** Save configuration to file */
export function saveConfig(config: PicLetConfig): void {
	const configPath = getConfigPath();
	const configDir = dirname(configPath);

	if (!existsSync(configDir)) {
		mkdirSync(configDir, { recursive: true });
	}

	writeFileSync(configPath, JSON.stringify(config, null, 2));
}

/** Reset configuration to defaults */
export function resetConfig(): void {
	const configPath = getConfigPath();
	const configDir = dirname(configPath);

	if (!existsSync(configDir)) {
		mkdirSync(configDir, { recursive: true });
	}

	writeFileSync(configPath, JSON.stringify(DEFAULT_CONFIG, null, 2));
}
