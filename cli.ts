import chalk from 'chalk';
import { Command } from 'commander';
import { install } from './install.js';
import { printBanner, toWSLPath } from './lib/index.js';
import {
	compress,
	getConfigPath,
	loadToolsConfig,
	loop,
	mkv2mp4,
	resetToolsConfig,
	shrink,
	thumb,
	togif,
} from './tools/index.js';
import { uninstall } from './uninstall.js';

const program = new Command();

// Custom help formatting
function showHelp() {
	printBanner();

	const dim = chalk.gray;
	const cmd = chalk.cyan;
	const arg = chalk.yellow;
	const opt = chalk.magenta;
	const head = chalk.white.bold;

	console.log(
		`  ${head('Usage:')} vidlet ${cmd('<command>')} ${arg('<file>')} ${opt('[options]')}`,
	);
	console.log();
	console.log(head('  Video Tools'));
	console.log(
		`    ${cmd('compress')} ${arg('<file>')}   Reduce file size with H.264`,
	);
	console.log(
		`    ${cmd('togif')} ${arg('<file>')}      Convert to optimized GIF`,
	);
	console.log(`    ${cmd('mkv2mp4')} ${arg('<file>')}    Convert MKV to MP4`);
	console.log(
		`    ${cmd('shrink')} ${arg('<file>')}     Speed up for YouTube Shorts`,
	);
	console.log(
		`    ${cmd('thumb')} ${arg('<file>')}      Extract thumbnail frame`,
	);
	console.log(`    ${cmd('loop')} ${arg('<file>')}       Create seamless loop`);
	console.log();
	console.log(head('  Setup'));
	console.log(`    ${cmd('install')}           Add Windows right-click menu`);
	console.log(`    ${cmd('uninstall')}         Remove right-click menu`);
	console.log();
	console.log(head('  Config'));
	console.log(`    ${cmd('config')}            Display current settings`);
	console.log(`    ${cmd('config reset')}      Restore defaults`);
	console.log();
	console.log(head('  Examples'));
	console.log(
		`    $ vidlet ${cmd('compress')} ${arg('video.mp4')} ${opt('-b 2000 -p fast -o small.mp4')}`,
	);
	console.log(
		`    $ vidlet ${cmd('togif')} ${arg('clip.mp4')} ${opt('-f 20 -w 640 -d bayer -o preview.gif')}`,
	);
	console.log(
		`    $ vidlet ${cmd('mkv2mp4')} ${arg('movie.mkv')} ${opt('--no-copy -c 18 -o converted.mp4')}`,
	);
	console.log(
		`    $ vidlet ${cmd('shrink')} ${arg('gameplay.mp4')} ${opt('-t 30 -o short.mp4')}`,
	);
	console.log(
		`    $ vidlet ${cmd('thumb')} ${arg('video.mp4')} ${opt('-s 00:01:30 -o cover.jpg')}`,
	);
	console.log(
		`    $ vidlet ${cmd('loop')} ${arg('animation.mp4')} ${opt('--time 3 -c 0.5 -o loop.mp4')}`,
	);

	console.log();
	console.log(head('  Requirements'));
	console.log('    - WSL (Windows Subsystem for Linux)');
	console.log('    - FFmpeg: sudo apt install ffmpeg');
}

// Override default help
program.helpInformation = () => '';
program.on('--help', () => {});

program
	.name('vidlet')
	.description('Video utility toolkit with Windows shell integration')
	.version('1.0.0')
	.action(() => {
		showHelp();
	});

// Help command
program
	.command('help')
	.description('Show help')
	.action(() => {
		showHelp();
	});

// Install command
program
	.command('install')
	.description('Install Windows shell context menu integration')
	.action(async () => {
		try {
			await install();
		} catch (error) {
			console.error(chalk.red(`Error: ${(error as Error).message}`));
			process.exit(1);
		}
	});

// Uninstall command
program
	.command('uninstall')
	.description('Remove Windows shell context menu integration')
	.action(async () => {
		try {
			await uninstall();
		} catch (error) {
			console.error(chalk.red(`Error: ${(error as Error).message}`));
			process.exit(1);
		}
	});

// Compress command
program
	.command('compress <file>')
	.description('Compress video using H.264 encoding')
	.option('-b, --bitrate <kbps>', 'Bitrate in kb/s (default: 2500)')
	.option(
		'-p, --preset <preset>',
		'Encoding preset: ultrafast|fast|medium|slow|veryslow',
	)
	.option('-o, --output <path>', 'Output file path')
	.addHelpText(
		'after',
		`
${chalk.white.bold('Examples:')}
  ${chalk.dim('$')} vidlet compress video.mp4
  ${chalk.dim('$')} vidlet compress video.mp4 --bitrate 2000
  ${chalk.dim('$')} vidlet compress video.mp4 -b 1500 -p fast -o small.mp4
`,
	)
	.action(async (file: string, options) => {
		try {
			const input = await resolveInputPath(file);
			await compress({
				input,
				output: options.output,
				bitrate: options.bitrate,
				preset: options.preset,
			});
		} catch (error) {
			console.error(chalk.red(`Error: ${(error as Error).message}`));
			process.exit(1);
		}
	});

// ToGIF command
program
	.command('togif <file>')
	.description('Convert video to optimized GIF')
	.option('-f, --fps <fps>', 'Frames per second (default: 15)')
	.option('-w, --width <pixels>', 'Output width (default: 480)')
	.option(
		'-d, --dither <method>',
		'Dither: none|floyd_steinberg|sierra2|sierra2_4a|bayer',
	)
	.option('-o, --output <path>', 'Output file path')
	.addHelpText(
		'after',
		`
${chalk.white.bold('Examples:')}
  ${chalk.dim('$')} vidlet togif clip.mp4
  ${chalk.dim('$')} vidlet togif clip.mp4 --fps 20 --width 640
  ${chalk.dim('$')} vidlet togif clip.mp4 -f 12 -w 320 -o preview.gif
`,
	)
	.action(async (file: string, options) => {
		try {
			const input = await resolveInputPath(file);
			await togif({
				input,
				output: options.output,
				fps: options.fps,
				width: options.width,
				dither: options.dither,
			});
		} catch (error) {
			console.error(chalk.red(`Error: ${(error as Error).message}`));
			process.exit(1);
		}
	});

// MKV to MP4 command
program
	.command('mkv2mp4 <file>')
	.description('Convert MKV to MP4')
	.option('--no-copy', 'Re-encode instead of stream copy')
	.option('-c, --crf <value>', 'CRF quality 0-51 (default: 23, lower=better)')
	.option('-o, --output <path>', 'Output file path')
	.addHelpText(
		'after',
		`
${chalk.white.bold('Examples:')}
  ${chalk.dim('$')} vidlet mkv2mp4 movie.mkv              ${chalk.dim('# Fast remux')}
  ${chalk.dim('$')} vidlet mkv2mp4 movie.mkv --no-copy    ${chalk.dim('# Re-encode')}
  ${chalk.dim('$')} vidlet mkv2mp4 movie.mkv --no-copy -c 18
`,
	)
	.action(async (file: string, options) => {
		try {
			const input = await resolveInputPath(file);
			await mkv2mp4({
				input,
				output: options.output,
				copyStreams: options.copy !== false,
				crf: options.crf,
			});
		} catch (error) {
			console.error(chalk.red(`Error: ${(error as Error).message}`));
			process.exit(1);
		}
	});

// Shrink command
program
	.command('shrink <file>')
	.description('Speed up video to fit target duration')
	.option(
		'-t, --target <seconds>',
		'Target duration (default: 59.5 for Shorts)',
	)
	.option('-o, --output <path>', 'Output file path')
	.addHelpText(
		'after',
		`
${chalk.white.bold('Examples:')}
  ${chalk.dim('$')} vidlet shrink gameplay.mp4            ${chalk.dim('# Fit to 59.5s')}
  ${chalk.dim('$')} vidlet shrink gameplay.mp4 -t 30      ${chalk.dim('# Fit to 30s')}
`,
	)
	.action(async (file: string, options) => {
		try {
			const input = await resolveInputPath(file);
			await shrink({
				input,
				output: options.output,
				targetDuration: options.target,
			});
		} catch (error) {
			console.error(chalk.red(`Error: ${(error as Error).message}`));
			process.exit(1);
		}
	});

// Thumbnail command
program
	.command('thumb <file>')
	.description('Extract thumbnail from video frame')
	.option(
		'-s, --timestamp <time>',
		'Timestamp HH:MM:SS or seconds (default: 00:00:01)',
	)
	.option('-o, --output <path>', 'Output file path')
	.addHelpText(
		'after',
		`
${chalk.white.bold('Examples:')}
  ${chalk.dim('$')} vidlet thumb video.mp4
  ${chalk.dim('$')} vidlet thumb video.mp4 -s 00:01:30
  ${chalk.dim('$')} vidlet thumb video.mp4 -s 45 -o cover.jpg
`,
	)
	.action(async (file: string, options) => {
		try {
			const input = await resolveInputPath(file);
			await thumb({
				input,
				output: options.output,
				timestamp: options.timestamp,
			});
		} catch (error) {
			console.error(chalk.red(`Error: ${(error as Error).message}`));
			process.exit(1);
		}
	});

// Loop command
program
	.command('loop <file>')
	.description('Create seamless looping video')
	.option('--time <seconds>', 'Loop duration (skips auto-detection)')
	.option(
		'-d, --search-duration <s>',
		'Search duration in seconds (default: 5)',
	)
	.option('--min <seconds>', 'Minimum loop length (default: 1)')
	.option('--max <seconds>', 'Maximum loop length (default: 3)')
	.option('-t, --threshold <0-1>', 'Similarity threshold (default: 0.98)')
	.option('-c, --crossfade <seconds>', 'Crossfade duration (default: 0.5)')
	.option('-o, --output <path>', 'Output file path')
	.addHelpText(
		'after',
		`
${chalk.white.bold('Examples:')}
  ${chalk.dim('$')} vidlet loop animation.mp4
  ${chalk.dim('$')} vidlet loop clip.mp4 --time 3         ${chalk.dim('# Manual 3s loop')}
  ${chalk.dim('$')} vidlet loop clip.mp4 -t 0.95          ${chalk.dim('# Lower threshold')}
  ${chalk.dim('$')} vidlet loop clip.mp4 --min 2 --max 5  ${chalk.dim('# Longer loops')}
`,
	)
	.action(async (file: string, options) => {
		try {
			const input = await resolveInputPath(file);
			await loop({
				input,
				output: options.output,
				time: options.time ? Number.parseFloat(options.time) : undefined,
				searchDuration: options.searchDuration,
				minLength: options.min,
				maxLength: options.max,
				threshold: options.threshold,
				crossfade: options.crossfade,
			});
		} catch (error) {
			console.error(chalk.red(`Error: ${(error as Error).message}`));
			process.exit(1);
		}
	});

// Config command
const configCmd = program
	.command('config')
	.description('Display current settings')
	.action(async () => {
		try {
			const config = await loadToolsConfig();
			console.log(chalk.white.bold('\n  VidLet Configuration'));
			console.log(chalk.gray(`  ${getConfigPath()}\n`));
			console.log(JSON.stringify(config, null, 2));
		} catch (error) {
			console.error(chalk.red(`Error: ${(error as Error).message}`));
			process.exit(1);
		}
	});

configCmd
	.command('reset')
	.description('Reset to defaults')
	.action(async () => {
		try {
			await resetToolsConfig();
			console.log(chalk.green('Configuration reset to defaults.'));
		} catch (error) {
			console.error(chalk.red(`Error: ${(error as Error).message}`));
			process.exit(1);
		}
	});

/**
 * Resolve input path - converts Windows path to WSL if needed
 */
async function resolveInputPath(inputPath: string): Promise<string> {
	if (/^[A-Za-z]:/.test(inputPath)) {
		return toWSLPath(inputPath);
	}
	return inputPath;
}

// Parse and run
program.parseAsync(process.argv).catch((error) => {
	console.error(chalk.red(`Error: ${error.message}`));
	process.exit(1);
});
