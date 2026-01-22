import chalk from 'chalk';
import type { Command } from 'commander';
import * as recolor from '../../tools/recolor.js';
import { picletTool } from '../tools.js';
import { runToolOnFiles, validateExtensions } from '../utils.js';

export function registerRecolorCommand(program: Command): void {
	program
		.command('recolor <files...>')
		.alias('replace-color')
		.description('Replace one color with another')
		.option('-y, --yes', 'Use defaults, skip prompts')
		.option('-g, --gui', 'Use GUI for options')
		.action(async (files: string[], options: { yes?: boolean; gui?: boolean }) => {
			// GUI mode - open unified PicLet interface
			if (options.gui) {
				const { valid, invalid } = validateExtensions(files, recolor.config.extensions);
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
				'recolor',
				files,
				options.yes ?? false,
			);
			process.exit(success ? 0 : 1);
		});
}
