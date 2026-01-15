import prompts from 'prompts';

/** When true, all prompts return their default values without user interaction */
let useDefaults = false;

/** Override values from CLI arguments - keyed by prompt message substring */
const overrides: Record<string, string | number | boolean | string[]> = {};

/**
 * Enable or disable default mode (for --yes flag)
 */
export function setUseDefaults(value: boolean): void {
	useDefaults = value;
}

/**
 * Check if defaults mode is enabled
 */
export function isUsingDefaults(): boolean {
	return useDefaults;
}

/**
 * Set override values from CLI arguments
 */
export function setOverrides(values: Record<string, string | number | boolean | string[]>): void {
	Object.assign(overrides, values);
}

/**
 * Clear all overrides
 */
export function clearOverrides(): void {
	for (const key of Object.keys(overrides)) {
		delete overrides[key];
	}
}

/**
 * Get override value for a prompt message (matches substring)
 */
function getOverride(message: string): string | number | boolean | string[] | undefined {
	const msgLower = message.toLowerCase();
	for (const [key, value] of Object.entries(overrides)) {
		if (msgLower.includes(key.toLowerCase())) {
			return value;
		}
	}
	return undefined;
}

/**
 * Prompt for text input with optional default
 */
export async function text(
	message: string,
	defaultValue?: string,
): Promise<string> {
	if (useDefaults) return defaultValue ?? '';

	const response = await prompts({
		type: 'text',
		name: 'value',
		message,
		initial: defaultValue,
	});
	return response.value ?? defaultValue ?? '';
}

/**
 * Prompt for number input with optional default
 */
export async function number(
	message: string,
	defaultValue?: number,
	min?: number,
	max?: number,
): Promise<number> {
	const override = getOverride(message);
	if (override !== undefined) return Number(override);
	if (useDefaults) return defaultValue ?? 0;

	const response = await prompts({
		type: 'number',
		name: 'value',
		message,
		initial: defaultValue,
		min,
		max,
	});
	return response.value ?? defaultValue ?? 0;
}

/**
 * Prompt for yes/no confirmation
 */
export async function confirm(
	message: string,
	defaultValue = true,
): Promise<boolean> {
	const override = getOverride(message);
	if (override !== undefined) return Boolean(override);
	if (useDefaults) return defaultValue;

	const response = await prompts({
		type: 'confirm',
		name: 'value',
		message,
		initial: defaultValue,
	});
	return response.value ?? defaultValue;
}

/**
 * Single-select from options
 */
export interface SelectOption {
	title: string;
	value: string | number;
	description?: string;
}

export async function select<T extends string | number>(
	message: string,
	options: SelectOption[],
	defaultValue?: T,
): Promise<T | null> {
	if (useDefaults) return defaultValue ?? (options[0]?.value as T) ?? null;

	const response = await prompts({
		type: 'select',
		name: 'value',
		message,
		choices: options.map((opt) => ({
			title: opt.title,
			value: opt.value,
			description: opt.description,
		})),
	});
	return (response.value as T) ?? null;
}

/**
 * Multi-select from options
 */
export async function multiSelect<T extends string | number>(
	message: string,
	options: SelectOption[],
	defaultValues?: T[],
): Promise<T[]> {
	if (useDefaults) return defaultValues ?? [];

	const response = await prompts({
		type: 'multiselect',
		name: 'value',
		message,
		choices: options.map((opt) => ({
			title: opt.title,
			value: opt.value,
			description: opt.description,
		})),
		instructions: false,
		hint: '- Space to select, Enter to confirm',
	});
	return (response.value as T[]) ?? [];
}

/**
 * Handle Ctrl+C gracefully
 */
export function onCancel(): void {
	prompts.override({ value: undefined });
}

// Set up cancel handler
prompts.override({});

/**
 * Pause and wait for user to press Enter (useful for errors in batch mode)
 * Only pauses when running with -y flag so user can see error messages
 */
export async function pauseOnError(message = 'Press Enter to close...'): Promise<void> {
	if (!useDefaults) return; // Interactive mode - no need to pause

	console.log();
	await prompts({
		type: 'text',
		name: 'value',
		message,
	});
}
