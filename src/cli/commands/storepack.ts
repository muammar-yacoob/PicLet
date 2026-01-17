import chalk from 'chalk';
import type { Command } from 'commander';
import * as storepack from '../../tools/storepack.js';
import { runToolOnFiles, validateExtensions } from '../utils.js';

export function registerStorepackCommand(program: Command): void {
	program
		.command('storepack <files...>')
		.description('Generate assets for app stores (Windows, Unity, Steam, etc.)')
		.option('-y, --yes', 'Use defaults, skip prompts')
		.option('-g, --gui', 'Use GUI for options')
		.action(async (files: string[], options: { yes?: boolean; gui?: boolean }) => {
			// GUI mode
			if (options.gui) {
				const { valid, invalid } = validateExtensions(files, storepack.config.extensions);
				if (invalid.length > 0) {
					console.error(chalk.red('Invalid file types:'));
					for (const file of invalid) {
						console.error(chalk.red(`  - ${file}`));
					}
				}
				if (valid.length === 0) {
					process.exit(1);
				}
				const result = await storepack.runGUI(valid[0]);
				process.exit(result ? 0 : 1);
			}

			const success = await runToolOnFiles(
				'storepack',
				files,
				options.yes ?? false,
			);
			process.exit(success ? 0 : 1);
		});
}
