import { existsSync, mkdirSync } from 'node:fs';
import { basename, dirname } from 'node:path';
import { startGuiServer } from '../lib/gui-server.js';
import {
	DIM,
	RESET,
	clearLine,
	error,
	header,
	info,
	separator,
	step,
	success,
	warn,
	wip,
	wipDone,
} from '../lib/logger.js';
import {
	checkImageMagick,
	cleanup,
	createIcoFromMultiple,
	getDimensions,
	scaleToSize,
	squarify,
} from '../lib/magick.js';
import { getFileInfo, normalizePath } from '../lib/paths.js';
import { multiSelect as promptMultiSelect, pauseOnError } from '../lib/prompts.js';

// Icon definitions for each platform
interface IconDef {
	filename: string;
	size: number;
}

const WEB_ICONS: IconDef[] = [
	{ filename: 'favicon-16x16.png', size: 16 },
	{ filename: 'favicon-32x32.png', size: 32 },
	{ filename: 'favicon-48x48.png', size: 48 },
	{ filename: 'apple-touch-icon.png', size: 180 },
	{ filename: 'android-chrome-192x192.png', size: 192 },
	{ filename: 'android-chrome-512x512.png', size: 512 },
	{ filename: 'mstile-150x150.png', size: 150 },
];

const ANDROID_ICONS: IconDef[] = [
	{ filename: 'mipmap-mdpi/ic_launcher.png', size: 48 },
	{ filename: 'mipmap-hdpi/ic_launcher.png', size: 72 },
	{ filename: 'mipmap-xhdpi/ic_launcher.png', size: 96 },
	{ filename: 'mipmap-xxhdpi/ic_launcher.png', size: 144 },
	{ filename: 'mipmap-xxxhdpi/ic_launcher.png', size: 192 },
	{ filename: 'playstore-icon.png', size: 512 },
];

const IOS_ICONS: IconDef[] = [
	// 20pt - Notifications
	{ filename: 'AppIcon-20.png', size: 20 },
	{ filename: 'AppIcon-20@2x.png', size: 40 },
	{ filename: 'AppIcon-20@3x.png', size: 60 },
	// 29pt - Settings
	{ filename: 'AppIcon-29.png', size: 29 },
	{ filename: 'AppIcon-29@2x.png', size: 58 },
	{ filename: 'AppIcon-29@3x.png', size: 87 },
	// 40pt - Spotlight
	{ filename: 'AppIcon-40.png', size: 40 },
	{ filename: 'AppIcon-40@2x.png', size: 80 },
	{ filename: 'AppIcon-40@3x.png', size: 120 },
	// 60pt - iPhone App
	{ filename: 'AppIcon-60@2x.png', size: 120 },
	{ filename: 'AppIcon-60@3x.png', size: 180 },
	// 76pt - iPad App
	{ filename: 'AppIcon-76.png', size: 76 },
	{ filename: 'AppIcon-76@2x.png', size: 152 },
	// 83.5pt - iPad Pro
	{ filename: 'AppIcon-83.5@2x.png', size: 167 },
	// App Store
	{ filename: 'AppIcon-1024.png', size: 1024 },
];

/**
 * Generate icons for a platform
 */
async function generateIcons(
	outputDir: string,
	sourceImg: string,
	icons: IconDef[],
): Promise<number> {
	const total = icons.length;
	let current = 0;
	let failed = 0;

	for (const icon of icons) {
		current++;
		const outputPath = `${outputDir}/${icon.filename}`;

		// Create subdirectory if needed
		const subdir = dirname(outputPath);
		if (!existsSync(subdir)) {
			mkdirSync(subdir, { recursive: true });
		}

		clearLine();
		wip(`[${current}/${total}] Generating ${icon.filename}...`);

		if (await scaleToSize(sourceImg, outputPath, icon.size)) {
			clearLine();
			success(
				`[${current}/${total}] ${icon.filename} (${icon.size}x${icon.size})`,
			);
		} else {
			clearLine();
			error(`[${current}/${total}] Failed: ${icon.filename}`);
			failed++;
		}
	}

	return failed;
}

/**
 * Generate favicon.ico from multiple sizes
 */
async function generateFavicon(
	outputDir: string,
	sourceImg: string,
): Promise<boolean> {
	wip('Generating favicon.ico...');

	const temp16 = `${outputDir}/.temp_16.png`;
	const temp32 = `${outputDir}/.temp_32.png`;
	const temp48 = `${outputDir}/.temp_48.png`;

	await scaleToSize(sourceImg, temp16, 16);
	await scaleToSize(sourceImg, temp32, 32);
	await scaleToSize(sourceImg, temp48, 48);

	const result = await createIcoFromMultiple(
		[temp16, temp32, temp48],
		`${outputDir}/favicon.ico`,
	);

	cleanup(temp16, temp32, temp48);

	if (result) {
		wipDone(true, 'favicon.ico (16, 32, 48)');
		return true;
	}
	wipDone(false, 'favicon.ico failed');
	return false;
}

/**
 * Generate icon sets for Web, Android, iOS platforms
 */
export async function run(inputRaw: string): Promise<boolean> {
	// Check dependencies
	if (!(await checkImageMagick())) {
		error('ImageMagick not found. Please install it:');
		console.log('  sudo apt update && sudo apt install imagemagick');
		await pauseOnError();
		return false;
	}

	// Normalize path
	const input = normalizePath(inputRaw);

	if (!existsSync(input)) {
		error(`File not found: ${input}`);
		await pauseOnError();
		return false;
	}

	// Get file info
	const fileInfo = getFileInfo(input);

	header('PicLet Icon Pack Generator');

	// Analyze source image
	wip('Analyzing source image...');
	const dims = await getDimensions(input);
	if (!dims) {
		wipDone(false, 'Failed to read image');
		return false;
	}
	const [origW, origH] = dims;
	wipDone(true, `Source: ${origW}x${origH}`);

	// Warn if small source
	if (origW < 1024 || origH < 1024) {
		warn(
			'Source image is smaller than 1024px. Larger images produce better quality.',
		);
	}

	// Check if square
	if (origW !== origH) {
		warn('Image is not square. Will add transparent padding.');
	}

	// Select platforms
	console.log('');
	const platforms = await promptMultiSelect<string>(
		'Select target platforms:',
		[
			{ title: 'Web (PWA, favicon, apple-touch-icon)', value: 'web' },
			{ title: 'Android (mipmap icons, Play Store)', value: 'android' },
			{ title: 'iOS (App icons, App Store)', value: 'ios' },
		],
		['web', 'android', 'ios'], // Default: all platforms
	);

	if (platforms.length === 0) {
		error('No platforms selected');
		return false;
	}

	const doWeb = platforms.includes('web');
	const doAndroid = platforms.includes('android');
	const doIos = platforms.includes('ios');

	// Create output directory
	const outputDir = `${fileInfo.dirname}/${fileInfo.filename}_icons`;
	mkdirSync(outputDir, { recursive: true });
	info(`Output directory: ${outputDir}`);

	// Prepare source: make square and scale to 1024px for best quality
	console.log('');
	wip('Preparing source image...');
	const tempSource = `${outputDir}/.source_1024.png`;
	const tempSquare = `${outputDir}/.temp_square.png`;

	// First squarify
	if (!(await squarify(input, tempSquare))) {
		wipDone(false, 'Failed to prepare source');
		return false;
	}

	// Then scale to 1024 for high quality source
	if (!(await scaleToSize(tempSquare, tempSource, 1024))) {
		wipDone(false, 'Failed to prepare source');
		cleanup(tempSquare);
		return false;
	}
	cleanup(tempSquare);
	wipDone(true, 'Prepared 1024x1024 source');

	let totalFailed = 0;

	// Generate Web icons
	if (doWeb) {
		console.log('');
		header('Web Icons');
		const webDir = `${outputDir}/web`;
		mkdirSync(webDir, { recursive: true });

		if (!(await generateFavicon(webDir, tempSource))) {
			totalFailed++;
		}

		totalFailed += await generateIcons(webDir, tempSource, WEB_ICONS);
	}

	// Generate Android icons
	if (doAndroid) {
		console.log('');
		header('Android Icons');
		const androidDir = `${outputDir}/android`;
		mkdirSync(androidDir, { recursive: true });

		totalFailed += await generateIcons(androidDir, tempSource, ANDROID_ICONS);
	}

	// Generate iOS icons
	if (doIos) {
		console.log('');
		header('iOS Icons');
		const iosDir = `${outputDir}/ios`;
		mkdirSync(iosDir, { recursive: true });

		totalFailed += await generateIcons(iosDir, tempSource, IOS_ICONS);
	}

	// Cleanup
	cleanup(tempSource);

	// Summary
	console.log('');
	separator();

	if (totalFailed === 0) {
		success('All icons generated successfully!');
	} else {
		warn(`${totalFailed} icon(s) failed to generate`);
	}

	console.log('');
	info(`Icons saved to: ${outputDir}`);

	if (doWeb) {
		step('web/ - Favicon, PWA icons, Apple touch icon');
	}
	if (doAndroid) {
		step('android/ - mipmap folders, Play Store icon');
	}
	if (doIos) {
		step('ios/ - All iOS app icon sizes');
	}

	return totalFailed === 0;
}

/**
 * Generate icon pack (GUI mode)
 */
export async function runGUI(inputRaw: string): Promise<boolean> {
	const input = normalizePath(inputRaw);

	if (!existsSync(input)) {
		error(`File not found: ${input}`);
		return false;
	}

	const dims = await getDimensions(input);
	if (!dims) {
		error('Failed to read image dimensions');
		return false;
	}

	const fileInfo = getFileInfo(input);

	return startGuiServer({
		htmlFile: 'iconpack.html',
		title: 'PicLet - Icon Pack',
		imageInfo: {
			filePath: input,
			fileName: basename(input),
			width: dims[0],
			height: dims[1],
			borderColor: null,
		},
		defaults: {
			web: true,
			android: true,
			ios: true,
		},
		onProcess: async (opts) => {
			const logs: Array<{ type: string; message: string }> = [];

			if (!(await checkImageMagick())) {
				return {
					success: false,
					error: 'ImageMagick not found',
					logs: [{ type: 'error', message: 'ImageMagick not found' }],
				};
			}

			const doWeb = (opts.web as boolean) ?? true;
			const doAndroid = (opts.android as boolean) ?? true;
			const doIos = (opts.ios as boolean) ?? true;

			if (!doWeb && !doAndroid && !doIos) {
				return {
					success: false,
					error: 'No platforms selected',
					logs: [{ type: 'error', message: 'No platforms selected' }],
				};
			}

			// Create output directory
			const outputDir = `${fileInfo.dirname}/${fileInfo.filename}_icons`;
			mkdirSync(outputDir, { recursive: true });
			logs.push({ type: 'info', message: `Output: ${outputDir}` });

			// Prepare source: make square and scale to 1024px
			logs.push({ type: 'info', message: 'Preparing source image...' });
			const tempSource = `${outputDir}/.source_1024.png`;
			const tempSquare = `${outputDir}/.temp_square.png`;

			if (!(await squarify(input, tempSquare))) {
				return { success: false, error: 'Failed to prepare source', logs };
			}

			if (!(await scaleToSize(tempSquare, tempSource, 1024))) {
				cleanup(tempSquare);
				return { success: false, error: 'Failed to prepare source', logs };
			}
			cleanup(tempSquare);
			logs.push({ type: 'success', message: 'Prepared 1024x1024 source' });

			let totalFailed = 0;

			// Generate Web icons
			if (doWeb) {
				logs.push({ type: 'info', message: 'Generating Web icons...' });
				const webDir = `${outputDir}/web`;
				mkdirSync(webDir, { recursive: true });

				if (!(await generateFaviconSilent(webDir, tempSource))) {
					totalFailed++;
				}
				totalFailed += await generateIconsSilent(webDir, tempSource, WEB_ICONS, logs);
				logs.push({ type: 'success', message: `Web: ${WEB_ICONS.length + 1} icons` });
			}

			// Generate Android icons
			if (doAndroid) {
				logs.push({ type: 'info', message: 'Generating Android icons...' });
				const androidDir = `${outputDir}/android`;
				mkdirSync(androidDir, { recursive: true });
				totalFailed += await generateIconsSilent(androidDir, tempSource, ANDROID_ICONS, logs);
				logs.push({ type: 'success', message: `Android: ${ANDROID_ICONS.length} icons` });
			}

			// Generate iOS icons
			if (doIos) {
				logs.push({ type: 'info', message: 'Generating iOS icons...' });
				const iosDir = `${outputDir}/ios`;
				mkdirSync(iosDir, { recursive: true });
				totalFailed += await generateIconsSilent(iosDir, tempSource, IOS_ICONS, logs);
				logs.push({ type: 'success', message: `iOS: ${IOS_ICONS.length} icons` });
			}

			cleanup(tempSource);

			if (totalFailed === 0) {
				return {
					success: true,
					output: `Icons saved to ${fileInfo.filename}_icons/`,
					logs,
				};
			}

			return {
				success: false,
				error: `${totalFailed} icon(s) failed`,
				logs,
			};
		},
	});
}

/**
 * Silent version of generateIcons for GUI mode
 */
async function generateIconsSilent(
	outputDir: string,
	sourceImg: string,
	icons: IconDef[],
	_logs: Array<{ type: string; message: string }>,
): Promise<number> {
	let failed = 0;

	for (const icon of icons) {
		const outputPath = `${outputDir}/${icon.filename}`;
		const subdir = dirname(outputPath);
		if (!existsSync(subdir)) {
			mkdirSync(subdir, { recursive: true });
		}

		if (!(await scaleToSize(sourceImg, outputPath, icon.size))) {
			failed++;
		}
	}

	return failed;
}

/**
 * Silent version of generateFavicon for GUI mode
 */
async function generateFaviconSilent(
	outputDir: string,
	sourceImg: string,
): Promise<boolean> {
	const temp16 = `${outputDir}/.temp_16.png`;
	const temp32 = `${outputDir}/.temp_32.png`;
	const temp48 = `${outputDir}/.temp_48.png`;

	await scaleToSize(sourceImg, temp16, 16);
	await scaleToSize(sourceImg, temp32, 32);
	await scaleToSize(sourceImg, temp48, 48);

	const result = await createIcoFromMultiple(
		[temp16, temp32, temp48],
		`${outputDir}/favicon.ico`,
	);

	cleanup(temp16, temp32, temp48);
	return result;
}

export const config = {
	id: 'iconpack',
	name: 'Icon Pack',
	icon: 'iconpack.ico',
	extensions: ['.png', '.jpg', '.jpeg', '.gif'],
};
