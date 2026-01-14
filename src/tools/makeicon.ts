import { existsSync } from 'node:fs';
import { error, header, success, wip, wipDone } from '../lib/logger.js';
import {
	checkImageMagick,
	cleanup,
	createIco,
	getDimensions,
	scaleToSize,
	squarify,
	trim,
} from '../lib/magick.js';
import { getFileInfo, normalizePath } from '../lib/paths.js';
import { pauseOnError } from '../lib/prompts.js';

/**
 * Convert PNG to ICO with multiple resolutions
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
	const output = `${fileInfo.dirname}/${fileInfo.filename}.ico`;
	const tempTrimmed = `${fileInfo.dirname}/${fileInfo.filename}_trimmed.png`;
	const tempSquare = `${fileInfo.dirname}/${fileInfo.filename}_square.png`;
	const tempScaled = `${fileInfo.dirname}/${fileInfo.filename}_scaled.png`;

	header('PicLet Make Icon');

	// Get original dimensions
	wip('Analyzing image...');
	const dims = await getDimensions(input);
	if (!dims) {
		wipDone(false, 'Failed to read image');
		return false;
	}
	wipDone(true, `Original size: ${dims[0]}x${dims[1]}`);

	// Step 1: Trim transparent areas
	wip('Trimming transparent areas...');
	if (!(await trim(input, tempTrimmed))) {
		wipDone(false, 'Trim failed');
		cleanup(tempTrimmed);
		return false;
	}
	wipDone(true, 'Trimmed');

	// Step 2: Make square
	wip('Making square...');
	if (!(await squarify(tempTrimmed, tempSquare))) {
		wipDone(false, 'Square padding failed');
		cleanup(tempTrimmed, tempSquare);
		return false;
	}
	cleanup(tempTrimmed);
	wipDone(true, 'Made square');

	// Step 3: Scale to 512px for best quality source
	wip('Scaling to 512px...');
	if (!(await scaleToSize(tempSquare, tempScaled, 512))) {
		wipDone(false, 'Scaling failed');
		cleanup(tempSquare, tempScaled);
		return false;
	}
	cleanup(tempSquare);
	wipDone(true, 'Scaled to 512x512');

	// Step 4: Create ICO with multiple resolutions
	wip('Creating icon (256, 128, 64, 48, 32, 16)...');
	if (!(await createIco(tempScaled, output))) {
		wipDone(false, 'Icon creation failed');
		cleanup(tempScaled);
		return false;
	}
	cleanup(tempScaled);
	wipDone(true, 'Icon created');

	console.log('');
	success(`Output: ${output}`);
	return true;
}

export const config = {
	id: 'makeicon',
	name: 'Make Icon',
	icon: 'makeicon.ico',
	extensions: ['.png'],
};
