/*
TODOS:
- Maybe some asyncing; (Done!)
- Maybe some classes for encapsulation.
*/

import { ExtensionContext, extensions, workspace, commands, window, Uri } from 'vscode';
import { exec, execSync } from 'child_process';
import { existsSync, readFileSync, readdirSync, writeFileSync, mkdirSync, rename, unlink, createWriteStream, chmodSync, unlinkSync } from 'fs';
import { pipeline } from 'stream';
import { promisify } from 'util';
import { join } from 'path';
import AdmZip from 'adm-zip';

let main_name: string;
let constants_name: string;
let variables_name: string;
let fill_value: string;
let assembler_folder: string;
let assembler_path: string;
let compiler_name: string;
const output_channel = window.createOutputChannel("The Macro Assembler AS");

const extensionId = "clcxce.motorola-68k-assembly";
const streamPipeline = promisify(pipeline);

if (!extensions.getExtension(extensionId)) {
	window.showWarningMessage(`The extension "${extensionId}" is not installed. Its installation is recommended for text highlighting.`);
}

// Executes a program synchronously, returns true if successful, false if an error occurred
function executeCommandSync(command: string): boolean {
	try {
		const output = execSync(command, { encoding: 'ascii' });
		output_channel.append(output);
		return true;
	}
	catch (error: any) {
		output_channel.append(error.stdout);
		output_channel.appendLine("===============================================================");
		output_channel.append(error.stderr);
		output_channel.show();

		if (error.status === 2) {
			window.showErrorMessage("Build failed. Check the terminal for more details."); // This happens in case the assembler gets an error
		}
		else {
			window.showErrorMessage(error);
		}

		return false;
	}
}

function fileCheck(): boolean {
	if (!existsSync(main_name)) {
		window.showErrorMessage(`The main source code is missing. Name it to "${main_name}"`);
		return false;
	}

	if (variables_name !== "" && !existsSync(variables_name)) {
		window.showErrorMessage(`The variables are missing. Name them to "${variables_name}"`);
		return false;
	}

	if (constants_name !== "" && !existsSync(constants_name)) {
		window.showErrorMessage(`The constants are missing. Name them to "${constants_name}"`);
		return false;
	}

	return true;
}

function assembleROM() {
	if (!workspace.workspaceFolders) {
		window.showErrorMessage("You have no opened projects. Please, open a folder containing the correct structure.");
		return;
	}

	const project_folder = workspace.workspaceFolders[0].uri.fsPath;

	process.chdir(project_folder);

	if (!fileCheck()) {
		return;
	}

	output_channel.clear();

	if (!executeCommandSync(`"${assembler_path}" "${main_name}" -xx -o "${join(assembler_folder, "rom.p")}" -olist code.lst -ALU`)) {
		return; // This is awful I know
	}

	const files = readdirSync('.'); // Reads all files and folders and put them into a string array

	// Checks if there are any files that have the .gen extension, if so it renames it with .pre and a number
	for (const check_name of files) { // One of the few for loops that support breaking
		if (check_name.endsWith(".gen")) {
			let new_extension = ".pre0";
			let number = 0;

			// The extension number increases in relation to how many concurrencies there are
			for (const name of files) {
				if (name.endsWith(new_extension)) {
					number++;
					new_extension = ".pre" + number;
				}
			}

			new_extension = check_name.substring(0, check_name.length - 4) + new_extension;

			rename(check_name, new_extension, (error) => {
				if (error) {
					window.showWarningMessage(`Could not rename the previous ROM. To avoid conflicts, rename the older build to "${new_extension}" manually.`);
					return;
				}
				
				window.showInformationMessage(`Latest build already exists, renaming it to "${new_extension}".`);
			});

			break;
		}
	}

	process.chdir(assembler_folder);

	executeCommandSync(`"${compiler_name}" rom.p -k`);
	const current_date = new Date();
	const hours = `${current_date.getHours().toString().padStart(2, '0')}`;
	const minutes = `${current_date.getMinutes().toString().padStart(2, '0')}`;
	const seconds = `${current_date.getSeconds().toString().padStart(2, '0')}`;
	
	// Renames and moves the rom.bin file outside assembler_folder since p2bin doesn't have a switch to change the output file name for some reason
	rename("rom.bin", `${join(project_folder, main_name)}-${current_date.getFullYear()}_${(current_date.getMonth() + 1).toString().padStart(2, '0')}_${current_date.getDate().toString().padStart(2, '0')} ${hours}.${minutes}.${seconds}.gen`, (error) => { // I am aware that this line is extraordinarily long
		if (error) {
			if (error?.code !== "ENOENT") {
				window.showWarningMessage(`Could not rename your ROM, try to take it from "${assembler_folder}" if it exists. ${error}`);
			}
			else {
				window.showErrorMessage("Cannot rename your ROM, there might be a problem with the compiler. " + error);
				return;
			}
		}
	});

	window.showInformationMessage(`Build succeded at ${hours}:${minutes}:${seconds}. (Hurray!)`);
}

function findAndRunROM(system_variable: string) {
	if (!workspace.workspaceFolders) {
		window.showErrorMessage("You have no opened projects. Please, open a folder containing the correct structure.");
		return;
	}

	const project_folder = workspace.workspaceFolders[0].uri.fsPath; // Get the full path to the currently opened folder

	process.chdir(project_folder);

	if (!fileCheck()) {
		return;
	}

	const files = readdirSync('.');
	const rom = files.find(file => file.endsWith(".gen"));

	if (rom) {
		exec(`"${system_variable}" "${rom}"`, (error) => {
			if (error) {
				window.showErrorMessage("Cannot run the latest build. " + error.message);
				return;
			}

			window.showInformationMessage(`Running "${rom}" with BlastEm.`);
		});
	}
	else {
		window.showErrorMessage("There are no ROMs to run. Build something first.");
	}
}

function runTemporaryROM(system_variable: string) {
	if (!workspace.workspaceFolders) {
		window.showErrorMessage("You have no opened projects. Please, open a folder containing the correct structure.");
		return;
	}

	const project_folder = workspace.workspaceFolders[0].uri.fsPath; // Get the full path to the currently opened folder

	process.chdir(project_folder);

	if (!fileCheck()) {
		return;
	}

	output_channel.clear();

	if (!executeCommandSync(`"${assembler_path}" "${main_name}" -x -o ${join(assembler_folder, "rom.p")} -olist code.lst -ALU`)) { // Assembles a temporary ROM inside the assembler folder
		return; // My optimization ego won't like this
	}
	
	executeCommandSync(`${compiler_name} ${join(assembler_folder, "rom.p")} -k`);

	exec(`"${system_variable}" ${join(assembler_folder, "rom.bin")}`, (error) => {
		if (error) {
			window.showErrorMessage("Cannot run the build. " + error);
		}

		unlink(join(assembler_folder, "rom.p"), (error) => {
			window.showErrorMessage("Could not delete the temporary ROM for cleanup. You may want to do this by yourself. " + error);
		});
	});

	const current_date = new Date();
	window.showInformationMessage(`Build succeded at ${current_date.getHours().toString().padStart(2, '0')}:${current_date.getMinutes().toString().padStart(2, '0')}:${current_date.getSeconds().toString().padStart(2, '0')}, running it with BlastEm. (Hurray!)`);
}

function cleanFiles()
{
	readdirSync('.').forEach((item) => {
		if (item.endsWith(".gen") || item.includes(".pre") || item.endsWith(".lst")) {
			unlink(item, (error) => {
				if (error) {
					window.showWarningMessage(`Could not remove "${item}" for cleanup. You may want to do this by yourself. ${error}`);
				}
			});
		}
	});
}

// This method is called when the extension is activated
// An extension is activated the very first time the command is executed
export async function activate(context: ExtensionContext) {
	const config = workspace.getConfiguration("megaenvironment");
	main_name = config.get<string>("mainFileName", "Sonic.asm");
	constants_name = config.get<string>("constantsFileName", "Constants.asm");
	variables_name = config.get<string>("variablesFileName", "Variables.asm");
	fill_value = config.get<string>("fillValue", "FF");

	assembler_folder = context.globalStorageUri.fsPath;
	assembler_path = join(assembler_folder, "asl");
	compiler_name = join(assembler_folder, "p2bin");

	if (!existsSync(assembler_folder)) {
		let zip_name: string;

		switch (process.platform) {
			case 'win32':
				zip_name = "windows-x86.zip";
				assembler_path += ".exe";
				compiler_name += ".exe";
				break;
			case 'darwin':
				zip_name = "mac-arm64.zip";
				break;
			case 'linux':
				window.showErrorMessage("Linux isn't supported yet. Sorry.");
				return;
			default:
				window.showErrorMessage("What platform is this? Please, let me know which operative system you're running VS Code on!");
				return;
		}

		window.showInformationMessage("Downloading the latest tools");

		mkdirSync(assembler_folder, { recursive: true });

		process.chdir(assembler_folder);

		const url = "https://github.com/Franklin0770/AS-releases/releases/download/v1.42b_288/" + zip_name;
		const zip_path = join('.', zip_name);

		const response = await fetch(url);

		const file_stream = createWriteStream(zip_path);

		if (!response.ok || !response.body) {
			window.showErrorMessage("Failed to download the latest AS compiler. " + response.statusText);
			return;
		}

		await streamPipeline(response.body, file_stream);

		const zip = new AdmZip(zip_path);

		for (const entry of zip.getEntries()) {
			const path = join('.', entry.entryName);
			// Remove the first folder from the path
			writeFileSync(path, entry.getData());

			if (process.platform !== 'win32')
			{
				chmodSync(path, 0o755); // Get permissions (rwx) for Unix-based systems
			}
		}

		unlinkSync(zip_path);
	}

	//
	//	Commands
	//

	const assemble = commands.registerCommand('megaenvironment.assemble', () => {
		assembleROM();
	});

	const clean_and_assemble = commands.registerCommand('megaenvironment.clean_assemble', () => {
		if (!workspace.workspaceFolders) {
			window.showErrorMessage("You have no opened projects. Please, open a folder containing the correct structure.");
			return;
		}

		const project_folder = workspace.workspaceFolders[0].uri.fsPath; // Get the full path to the currently opened folder

		process.chdir(project_folder);

		output_channel.clear();

		if (!executeCommandSync(`"${assembler_path}" "${main_name}" -xx -o ${join(assembler_path, "rom.p")} -olist code.lst -ALU`)) {
			return; // Don't flame me please
		}

		executeCommandSync(`${compiler_name} rom.p -k -l`);
		const current_date = new Date();
		const hours = `${current_date.getHours().toString().padStart(2, '0')}`;
		const minutes = `${current_date.getMinutes().toString().padStart(2, '0')}`;
		const seconds = `${current_date.getSeconds().toString().padStart(2, '0')}`;
	
		// Renames and moves the rom.bin file outside assembler_folder since p2bin doesn't have a switch to change the output file name for some reason
		rename(join(assembler_folder, "rom.bin"), `${main_name} ${current_date.getFullYear()}_${(current_date.getMonth() + 1).toString().padStart(2, '0')}_${current_date.getDate().toString().padStart(2, '0')} ${hours}.${minutes}.${seconds}.gen`, (error) => {
			if (error) {
				if (error?.code !== "ENOENT") {
					window.showWarningMessage(`Could not rename your ROM, try to take it from "${assembler_folder}" if it exists. ${error}`);
				}
				else {
					window.showErrorMessage("Cannot rename your ROM, there might be a problem with the compiler. " + error);
					return;
				}
			}
		});

		window.showInformationMessage(`Build succeded at ${hours}:${minutes}:${seconds}. (Hurray!)`);
	});

	const run_BlastEm = commands.registerCommand('megaenvironment.run_blastem', () => {
		if (process.platform !== 'win32') {
			window.showErrorMessage("This command is not supported in your platform. BlastEm is only available for Windows, unfortunately.");
			return;
		}

		const system_variable = process.env.BlastEm;

		// Throws an error if the BlastEm variable is missing or not set up correctly
		if (system_variable === undefined || !system_variable.endsWith("blastem.exe")) {
			window.showErrorMessage("You didn't set up the \"BlastEm\" environment variable correctly. You must set this variable to the \"blastem.exe\" executable. The current variable value is: " + system_variable);
			return;
		}

		findAndRunROM(system_variable);
	});

	const run_Regen = commands.registerCommand('megaenvironment.run_regen', () => {
		if (process.platform !== 'win32') {
			window.showErrorMessage("This command is not supported in your platform. Regen is only available for Windows, unfortunately.");
			return;
		}

		const system_variable = process.env.Regen;

		// Throws an error if the Regen variable is missing or not set up correctly
		if (system_variable === undefined || !system_variable.endsWith("Regen.exe")) {
			window.showErrorMessage("You didn't set up the \"Regen\" environment variable correctly. You must set this variable to the \"Regen.exe\" executable. The current variable value is: " + system_variable);
			return;
		}

		findAndRunROM(system_variable);
	});

	const assemble_and_run_BlastEm = commands.registerCommand("megaenvironment.assemble_run_blastem", () => {
		if (process.platform !== 'win32') {
			window.showErrorMessage("This command is not supported in your platform. BlastEm is only available for Windows, unfortunately.");
			return;
		}
		
		const system_variable = process.env.BlastEm;

		// Throws an error if the BlastEm variable is missing or not set up correctly
		if (system_variable === undefined || !system_variable.endsWith("blastem.exe")) {
			window.showErrorMessage("You didn't set up the \"BlastEm\" environment variable correctly. You must set this variable to the \"blastem.exe\" executable. The current variable value is: " + system_variable);
			return;
		}
		
		runTemporaryROM(system_variable);
	});

	const assemble_and_run_Regen = commands.registerCommand("megaenvironment.assemble_run_regen", () => {
		if (process.platform !== 'win32') {
			window.showErrorMessage("This command is not supported in your platform. Regen is only available for Windows, unfortunately.");
			return;
		}

		const system_variable = process.env.Regen;

		// Throws an error if the BlastEm variable is missing or not set up correctly
		if (system_variable === undefined || !system_variable.endsWith("Regen.exe")) {
			window.showErrorMessage("You didn't set up the \"Regen\" environment variable correctly. You must set this variable to the \"Regen.exe\" executable. The current variable value is: " + system_variable);
			return;
		}
		
		runTemporaryROM(system_variable);
	});

	const open_EASy68k = commands.registerCommand("megaenvironment.open_easy68k", () => {
		if (process.platform !== 'win32') {
			window.showErrorMessage("This command is not supported in your platform. EASy68k is only available for Windows, unfortunately.");
			return;
		}

		if (!workspace.workspaceFolders) {
			window.showErrorMessage("You have no opened projects. Please, open a folder containing the correct structure.");
			return;
		}

		const project_folder = workspace.workspaceFolders[0].uri.fsPath;

		const system_variable = process.env.EASy68k;

		if (system_variable === undefined || !system_variable.endsWith("EDIT68K.exe")) {
			window.showErrorMessage("You didn't set up the \"EASy68k\" environment variable correctly. You must set this variable to the \"EDIT68K.exe\" executable. The current variable value is: " + system_variable);
			return;
		}

		process.chdir(assembler_folder);

		const editor = window.activeTextEditor;
		let selected_text;

		if (editor) {
			selected_text = editor.document.getText(editor.selection);
		}
		else {
			window.showErrorMessage("You don't have an opened editor");
			return;
		}

		if (selected_text === "") {
			window.showWarningMessage("You haven't selected any text field. To make sure you want to debug a portion of your code, select the text you want to analyze.");
		}

		let text: string;
		const constants_location = join("..", constants_name);
		const variables_location = join("..", variables_name);
		let constants_exists = false;
		let variables_exists = false;

		if (existsSync(constants_location)) {
			constants_exists = true;
		}

		if (existsSync(variables_location)) {
			variables_exists = true;
		}

		if (constants_exists && variables_exists) {
			text = `; Code\n\n\torg\t0\n\nstart:\n\n${selected_text}\n\n\tsimhalt\n\n\torg\t$FF0000\n\n; Variables\n\n${readFileSync(variables_location)}\n\n; Constants\n\n${readFileSync(constants_location)}\n\n\tend\tstart`;
		}
		else if (constants_exists) {
			text = `; Code\n\n\torg\t0\n\nstart:\n\n${selected_text}\n\n\tsimhalt\n\n; Constants\n\n${readFileSync(constants_location)}\n\n\torg\t$FF0000\n\n\tend\tstart`;
		}
		else if (variables_exists) {
			text = `; Code\n\n\torg\t0\n\nstart:\n\n${selected_text}\n\n\tsimhalt\n\norg\t$FF0000\n\n; Variables${readFileSync(variables_location)}\n\n\tend\tstart`;
		}
		else {
			text = `; Code\n\n\torg\t0\n\nstart:\n\n${selected_text}\n\n\tsimhalt\n\n\tend\tstart`;
		}

		try {
			workspace.fs.writeFile(Uri.file("temp.txt"), new TextEncoder().encode(text));
		}
		catch (error: any) {
			window.showErrorMessage("Unable to create file for testing. " + error);
			return;
		}

		window.showInformationMessage("Debugging your current selection with EASy68k.");

		exec(`"${system_variable}" "temp.txt"`, (error) => {
			if (error) {
				window.showErrorMessage("Cannot run EASy68k for testing. " + error);
			}

			readdirSync(assembler_folder).forEach((file) => {
				if (file !== assembler_path && file !== compiler_name) {
					unlink(file, (error) => {
						if (error) {
							window.showWarningMessage(`Could not remove "${file}" for cleanup. You may want to do this by yourself. ${error}`);
						}
					});
				}
			});

			process.chdir(project_folder);
		});
	});

	const backup = commands.registerCommand("megaenvironment.backup", () => {
		if (!workspace.workspaceFolders) {
			window.showErrorMessage("You have no opened projects. Please, open a folder containing the correct structure.");
			return;
		}

		process.chdir(workspace.workspaceFolders[0].uri.fsPath); // Change current working folder to the project one

		const zip = new AdmZip(); // Create zip archive reference
		const items = readdirSync('.'); // Read all content in the project folder

		if (!existsSync("Backups")) {
			window.showInformationMessage("No \"Backups\" folder found. Fixing.");
			mkdirSync("Backups");
		}
		else {
			items.splice(items.indexOf("Backups"), 1); // Remove Backups folder
		}

		items.forEach((item) => {
			zip.addLocalFile(item);

			if (item.endsWith(".gen") || item.includes(".pre") || item.endsWith(".lst")) {
				unlink(item, (error) => {
					if (error)
					{
						window.showWarningMessage(`Could not remove "${item}" for cleanup. You may want to do this by yourself. ${error}`);
					}
				});
			}
		});

		const current_date = new Date();
		zip.writeZip(join("Backups", `Backup ${current_date.getFullYear()}_${(current_date.getMonth() + 1).toString().padStart(2, '0')}_${current_date.getDate().toString().padStart(2, '0')} ${current_date.getHours().toString().padStart(2, '0')}.${current_date.getMinutes().toString().padStart(2, '0')}.${current_date.getSeconds().toString().padStart(2, '0')}.zip`)); // I am aware that this line is extraordinarily long
		process.chdir(assembler_folder);
		window.showInformationMessage("Files backed up successfully.");
	});

	const cleanup = commands.registerCommand("megaenvironment.cleanup", () => {
		if (!workspace.workspaceFolders) {
			window.showErrorMessage("You have no opened projects. Please, open a folder containing the correct structure.");
			return;
		}

		process.chdir(workspace.workspaceFolders[0].uri.fsPath);

		cleanFiles();
		window.showInformationMessage("Cleanup completed.");
	});

	context.subscriptions.push(assemble, clean_and_assemble, run_BlastEm, run_Regen, assemble_and_run_BlastEm, assemble_and_run_Regen, backup, cleanup, open_EASy68k);
}

workspace.onDidChangeConfiguration((event) => {
	if (event.affectsConfiguration('megaenvironment')) { // When something gets changed in the extension's settings
		// Get the saved source code file names project-wide
		const config = workspace.getConfiguration("megaenvironment");
		main_name = config.get<string>("mainFileName", "Sonic.asm");
		constants_name = config.get<string>("constantsFileName", "Constants.asm");
		variables_name = config.get<string>("variablesFileName", "Variables.asm");
		fill_value = config.get<string>("fillValue", "FF");
	}
});