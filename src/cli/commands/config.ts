import chalk from 'chalk';
import type { Command } from 'commander';
import { getConfigPath, loadConfig, resetConfig } from '../../lib/config.js';

export function registerConfigCommand(program: Command): void {
	const configCmd = program
		.command('config')
		.description('Display current settings')
		.action(() => {
			const config = loadConfig();
			console.log(chalk.white.bold('\n  PicLet Configuration'));
			console.log(chalk.gray(`  ${getConfigPath()}\n`));
			console.log(JSON.stringify(config, null, 2));
			console.log();
		});

	configCmd
		.command('reset')
		.description('Restore defaults')
		.action(() => {
			resetConfig();
			console.log(chalk.green('Configuration reset to defaults.'));
		});
}
