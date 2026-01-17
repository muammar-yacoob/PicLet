import chalk from 'chalk';
import type { Command } from 'commander';
import { clearOverrides, setOverrides } from '../../lib/prompts.js';
import * as removeBg from '../../tools/remove-bg.js';
import { runToolOnFiles, validateExtensions } from '../utils.js';

export function registerRemoveBgCommand(program: Command): void {
	program
		.command('remove-bg <files...>')
		.alias('removebg')
		.description('Remove solid background from image')
		.option('-y, --yes', 'Use defaults, skip prompts')
		.option('-g, --gui', 'Use TUI (terminal GUI) for options')
		.option('-f, --fuzz <percent>', 'Fuzz tolerance 0-100 (default: 10)')
		.option('-t, --trim', 'Trim transparent edges (default: true)')
		.option('--no-trim', 'Do not trim transparent edges')
		.option('-p, --preserve-inner', 'Preserve inner areas of same color')
		.option('-s, --square', 'Make output square with padding')
		.action(async (files: string[], options: { yes?: boolean; gui?: boolean; fuzz?: string; trim?: boolean; preserveInner?: boolean; square?: boolean }) => {
			// GUI mode - open HTML interface in browser
			if (options.gui) {
				const { valid, invalid } = validateExtensions(files, removeBg.config.extensions);
				if (invalid.length > 0) {
					console.error(chalk.red('Invalid file types:'));
					for (const file of invalid) {
						console.error(chalk.red(`  - ${file}`));
					}
				}
				if (valid.length === 0) {
					process.exit(1);
				}
				// Only process first file in GUI mode
				const result = await removeBg.runGUI(valid[0]);
				process.exit(result ? 0 : 1);
			}

			// Set overrides from CLI args
			if (options.fuzz !== undefined) {
				setOverrides({ 'fuzz': Number(options.fuzz) });
			}
			if (options.trim !== undefined) {
				setOverrides({ 'trim': options.trim });
			}
			if (options.preserveInner) {
				setOverrides({ 'preserve inner': true });
			}
			if (options.square) {
				setOverrides({ 'square': true });
			}

			const success = await runToolOnFiles(
				'remove-bg',
				files,
				options.yes ?? false,
			);
			clearOverrides();
			process.exit(success ? 0 : 1);
		});
}
