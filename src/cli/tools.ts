import * as border from '../tools/border.js';
import * as extractFrames from '../tools/extract-frames.js';
import * as filter from '../tools/filter.js';
import * as iconpack from '../tools/iconpack.js';
import * as makeicon from '../tools/makeicon.js';
import * as picletMain from '../tools/piclet-main.js';
import * as recolor from '../tools/recolor.js';
import * as removeBg from '../tools/remove-bg.js';
import * as rescale from '../tools/rescale.js';
import * as storepack from '../tools/storepack.js';
import * as transform from '../tools/transform.js';

/** Tool configuration */
export interface ToolConfig {
	id: string;
	name: string;
	icon: string;
	extensions: string[];
}

/** Tool with config and run function */
export interface Tool {
	config: ToolConfig;
	run: (file: string) => Promise<boolean>;
	runGUI?: (file: string) => Promise<boolean>;
}

/** Unified tool (GUI only) */
export interface UnifiedTool {
	config: ToolConfig;
	runGUI: (file: string) => Promise<boolean>;
}

/** All available tools (individual) */
export const tools: Tool[] = [
	{ config: makeicon.config, run: makeicon.run, runGUI: makeicon.runGUI },
	{ config: removeBg.config, run: removeBg.run, runGUI: removeBg.runGUI },
	{ config: rescale.config, run: rescale.run, runGUI: rescale.runGUI },
	{ config: iconpack.config, run: iconpack.run, runGUI: iconpack.runGUI },
	{ config: storepack.config, run: storepack.run, runGUI: storepack.runGUI },
	{ config: transform.config, run: transform.run, runGUI: transform.runGUI },
	{ config: filter.config, run: filter.run, runGUI: filter.runGUI },
	{ config: border.config, run: border.run, runGUI: border.runGUI },
	{ config: recolor.config, run: recolor.run, runGUI: recolor.runGUI },
	{ config: extractFrames.config, run: extractFrames.run, runGUI: extractFrames.runGUI },
];

/** Unified PicLet tool (all-in-one) */
export const picletTool: UnifiedTool = {
	config: picletMain.config,
	runGUI: picletMain.runGUI,
};

/** Tools that use TUI (terminal GUI) mode */
export const tuiTools = ['makeicon', 'remove-bg', 'rescale', 'iconpack', 'storepack', 'transform', 'filter', 'border', 'recolor', 'extract-frames'];

/** Get tool by ID */
export function getTool(id: string): Tool | undefined {
	return tools.find((t) => t.config.id === id);
}

/** Get all unique extensions from tools */
export function getAllExtensions(): string[] {
	const extensions = new Set<string>();
	for (const { config } of tools) {
		for (const ext of config.extensions) {
			extensions.add(ext);
		}
	}
	return Array.from(extensions);
}

/** Get tools that support a given extension */
export function getToolsForExtension(extension: string): Tool[] {
	return tools.filter((t) => t.config.extensions.includes(extension));
}
