/**
 * Tool registry — definitions, schemas, and dispatch.
 */

const readFile = require('./read-file');
const writeFile = require('./write-file');
const editFile = require('./edit-file');
const listDirectory = require('./list-directory');
const searchFiles = require('./search-files');
const findFiles = require('./find-files');
const runCommand = require('./run-command');

const TOOL_DEFINITIONS = [
	{
		name: 'local_read_file',
		description: "Read the contents of a file on the user's local machine. Returns lines with line numbers. Use offset and limit for large files.",
		input_schema: {
			type: 'object',
			properties: {
				path: { type: 'string', description: 'Absolute file path on the local machine.' },
				offset: { type: 'integer', description: 'Line number to start reading from (0-based). Default: 0.' },
				limit: { type: 'integer', description: 'Maximum number of lines to read (max 500). Default: 500.' },
			},
			required: ['path'],
		},
	},
	{
		name: 'local_write_file',
		description: "Create a new file or overwrite an existing file on the user's local machine. For small edits, prefer local_edit_file instead.",
		input_schema: {
			type: 'object',
			properties: {
				path: { type: 'string', description: 'Absolute file path on the local machine.' },
				content: { type: 'string', description: 'The full content to write to the file.' },
			},
			required: ['path', 'content'],
		},
	},
	{
		name: 'local_edit_file',
		description: "Edit a file on the user's local machine by replacing a specific string with a new string. The old_string must appear exactly once in the file.",
		input_schema: {
			type: 'object',
			properties: {
				path: { type: 'string', description: 'Absolute file path on the local machine.' },
				old_string: { type: 'string', description: 'The exact string to find and replace. Must be unique in the file.' },
				new_string: { type: 'string', description: 'The replacement string.' },
			},
			required: ['path', 'old_string', 'new_string'],
		},
	},
	{
		name: 'local_list_directory',
		description: "List the contents of a directory on the user's local machine. Shows files and subdirectories with sizes.",
		input_schema: {
			type: 'object',
			properties: {
				path: { type: 'string', description: 'Absolute directory path. Default: current working directory.' },
				recursive: { type: 'boolean', description: 'If true, list contents recursively. Default: false.' },
				max_depth: { type: 'integer', description: 'Maximum recursion depth (1-5). Default: 1.' },
			},
			required: [],
		},
	},
	{
		name: 'local_search_files',
		description: "Search for a text pattern in file contents on the user's local machine (like grep). Returns matching lines with file paths and line numbers.",
		input_schema: {
			type: 'object',
			properties: {
				pattern: { type: 'string', description: 'The text to search for (case-insensitive).' },
				path: { type: 'string', description: 'Directory or file to search in.' },
				file_glob: { type: 'string', description: 'Filter files by name pattern, e.g. "*.php", "*.js". Default: all files.' },
			},
			required: ['pattern'],
		},
	},
	{
		name: 'local_find_files',
		description: "Find files by name pattern on the user's local machine. Searches recursively through directories.",
		input_schema: {
			type: 'object',
			properties: {
				pattern: { type: 'string', description: 'Filename pattern to match, e.g. "*.php", "class-*.php", "readme*".' },
				path: { type: 'string', description: 'Directory to search in.' },
			},
			required: ['pattern'],
		},
	},
	{
		name: 'local_run_command',
		description: "Execute a shell command on the user's local machine. Disabled by default — must be enabled in ~/.cogmemui-local/config.json.",
		input_schema: {
			type: 'object',
			properties: {
				command: { type: 'string', description: 'The shell command to execute.' },
			},
			required: ['command'],
		},
	},
];

const HANDLERS = {
	local_read_file: readFile,
	local_write_file: writeFile,
	local_edit_file: editFile,
	local_list_directory: listDirectory,
	local_search_files: searchFiles,
	local_find_files: findFiles,
	local_run_command: runCommand,
};

function getDefinitions() {
	return TOOL_DEFINITIONS;
}

function getNames() {
	return TOOL_DEFINITIONS.map(t => t.name);
}

async function dispatch(toolName, input, config) {
	const handler = HANDLERS[toolName];
	if (!handler) {
		return { content: 'Unknown tool: ' + toolName, is_error: true };
	}

	const start = Date.now();
	try {
		// run_command uses config directly, others use allowedDirs.
		let result;
		if (toolName === 'local_run_command') {
			result = await handler.execute(input, config);
		} else {
			result = handler.execute(input, config.allowed_directories);
		}

		// Handle promise-based results (run_command).
		if (result && typeof result.then === 'function') {
			result = await result;
		}

		result.duration_ms = Date.now() - start;
		return result;
	} catch (e) {
		return { content: 'Tool execution error: ' + e.message, is_error: true, duration_ms: Date.now() - start };
	}
}

module.exports = { getDefinitions, getNames, dispatch };
