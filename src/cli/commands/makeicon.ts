import chalk from 'chalk';
import type { Command } from 'commander';
import * as makeicon from '../../tools/makeicon.js';
import { picletTool } from '../tools.js';
import { runToolOnFiles, validateExtensions } from '../utils.js';

export function registerMakeiconCommand(program: Command): void {
	program
		.command('makeicon <files...>')
		.description('Convert PNG to multi-resolution ICO file')
		.option('-y, --yes', 'Use defaults, skip prompts')
		.option('-g, --gui', 'Use GUI for confirmation')
		.action(async (files: string[], options: { yes?: boolean; gui?: boolean }) => {
			// GUI mode - open unified PicLet interface
			if (options.gui) {
				const { valid, invalid } = validateExtensions(files, makeicon.config.extensions);
				if (invalid.length > 0) {
					console.error(chalk.red('Invalid file types:'));
					for (const file of invalid) {
						console.error(chalk.red(`  - ${file}`));
					}
				}
				if (valid.length === 0) {
					process.exit(1);
				}
				const result = await picletTool.runGUI(valid[0]);
				process.exit(result ? 0 : 1);
			}

			const success = await runToolOnFiles(
				'makeicon',
				files,
				options.yes ?? false,
			);
			process.exit(success ? 0 : 1);
		});
}
