/*
TODOS:
- Maybe some asyncing;
- Maybe some classes for encapsulation.
*/

import { ExtensionContext, extensions, workspace, commands, window, Uri } from 'vscode';
import { exec, execSync } from 'child_process';
import { existsSync, readFileSync, readdirSync, readdir, mkdirSync, rename, unlinkSync, unlink } from 'fs';
import { join } from 'path';
import AdmZip from 'adm-zip';

let main_name:string;
let constants_name:string;
let variables_name:string;
let fill_value:string;
let project_folder:string;
const output_channel = window.createOutputChannel("The Macro Assembler AS");

const extensionId = "clcxce.motorola-68k-assembly";

if (!extensions.getExtension(extensionId)) 
{
	window.showWarningMessage(`The extension "${extensionId}" is not installed. Its installation is recommended for text highlighting.`);
}

// Executes a program synchronously, returns true if successful, false if an error occurred
function executeCommandSync(command:string):boolean
{
	try
	{
		const output = execSync(command, { encoding: 'ascii' });
		output_channel.append(output);
		return true;
	}
	catch (error:any)
	{
		output_channel.append(error.stdout);
		output_channel.appendLine("===============================================================");
		output_channel.append(error.stderr);
		output_channel.show();

		if (error.status === 2)
		{
			window.showErrorMessage("Build failed. Check the terminal for more details."); // This happens in case the assembler gets an error
		}
		else
		{
			window.showErrorMessage(error);
		}

		return false;
	}
}

function filesAndFoldersCheck():boolean
{	// Various checks to make sure the environment is setup correctly
	if (!workspace.workspaceFolders)
	{
		window.showErrorMessage("You have no opened projects. Please, open a folder containing the correct structure.");
		return false;
	}

	project_folder = workspace.workspaceFolders[0].uri.fsPath; // Gets the full path to the currently opened folder

	if (!existsSync(join(project_folder, main_name)))
	{
		window.showErrorMessage(`Main source code is missing. Name it to \"${main_name}\" or change it in the extension settings.`);
		return false;
	}

	const build_tools_folder = join(project_folder, "build_tools");

	if (!existsSync(build_tools_folder))
	{
		window.showErrorMessage("\"build_tools\" folder not present. You should include this folder with its files.");
		return false;
	}

	if (!existsSync(join(build_tools_folder, "asl.exe"))) // *project folder*/build_tools/asl.exe
	{
		window.showErrorMessage("\"asl.exe\" assembler is missing. It should be included in \"build_tools\".");
		return false;
	}

	if (!existsSync(join(build_tools_folder, "p2bin.exe"))) // *project folder*/build_tools/p2bin.exe
	{
		window.showErrorMessage("\"p2bin.exe\" compiler is missing. It should be included in \"build_tools\".");
		return false;
	}

	return true;
}

function assembleROM()
{	
	process.chdir(join(project_folder, "build_tools"));
	output_channel.clear();

	if (!executeCommandSync("asl.exe ..\\" + main_name + " /xx /o rom.p /olist ..\\code.lst -ALU"))
	{
		return; // This is awful I know
	}

	process.chdir(project_folder);
	const files = readdirSync('.'); // Reads all files and folders and put them into a string array

	// Checks if there are any files that have the .gen extension, if so it renames it with .pre and a number
	for (const check_name of files) // One of the few for loops that support breaking
	{
		if (check_name.endsWith(".gen"))
		{
			let new_extension = ".pre0";
			let number = 0;

			// The extension number increases in relation to how many concurrencies there are
			for (const name of files)
			{
				if (name.endsWith(new_extension))
				{
					number++;
					new_extension = ".pre" + number;
				}
			}

			new_extension = check_name.substring(0, check_name.length - 4) + new_extension;

			rename(check_name, new_extension, (error) =>
			{
				if (error)
				{
					window.showWarningMessage("Could not rename the previous ROM. To avoid conflicts, rename the older build to \"" + new_extension + "\" manually.");
					return;
				}
				
				window.showInformationMessage("Latest build already exists, renaming it to \"" + new_extension + "\".");
			});
			
			break;
		}
	}

	// Change current working folder back to build_tools and execute the compiler from there
	process.chdir(join(project_folder, "build_tools"));
	executeCommandSync(`p2bin.exe rom.p -k -l $${fill_value}`);
	const current_date = new Date();
	const hours = `${current_date.getHours().toString().padStart(2, '0')}`;
	const minutes = `${current_date.getMinutes().toString().padStart(2, '0')}`;
	const seconds = `${current_date.getSeconds().toString().padStart(2, '0')}`;
	
	// Renames and moves the rom.bin file outside build_tools since p2bin doesn't have a switch to change the output file name for some reason
	rename("rom.bin", `..\\${main_name} ${current_date.getFullYear()}_${(current_date.getMonth() + 1).toString().padStart(2, '0')}_${current_date.getDate().toString().padStart(2, '0')} ${hours}.${minutes}.${seconds}.gen`, (error) => // I am aware that this line is extraordinarily long
	{
		if (error)
		{
			if (error?.code !== "ENOENT")
			{
				window.showWarningMessage("Could not rename your ROM, try to take it from \"build_tools\" if it exists. " + error);
			}
			else
			{
				window.showErrorMessage("Cannot rename your ROM, there might be a problem with the compiler. " + error);
				return;
			}
		}
	});

	window.showInformationMessage(`Build succeded at ${hours}:${minutes}:${seconds}. (Hurray!)`);
}

function findAndRunROM(system_variable:string)
{
	if (!workspace.workspaceFolders)
	{
		window.showErrorMessage("You have no opened projects. Please, open a folder containing the correct structure.");
		return;
	}

	project_folder = workspace.workspaceFolders[0].uri.fsPath; // Get the full path to the currently opened folder
	process.chdir(project_folder); // Change current working folder to the root of the opened one

	readdir('.', (error, files) => 
	{
		if (error)
		{
			window.showErrorMessage("Cannot open project folder for reading. " + error);
			return;
		}

		for (const file of files) // For every file
		{
			if (file.endsWith(".gen"))
			{
				exec(`"${system_variable}" "${join(project_folder, file)}"`, (error) =>
				{
					if (!error)
					{
						window.showInformationMessage(`Running "${file}" with BlastEm.`);
					}
					else
					{
						window.showErrorMessage("Cannot run the latest build. " + error);
					}
				});

				return;
			}
		}

		window.showErrorMessage("There are no ROMs to run. Build something first.");
	});
}

function runTemporaryROM(system_variable:string)
{
	process.chdir(join(project_folder, "build_tools"));
	output_channel.clear();

	if (!executeCommandSync("asl.exe ..\\" + main_name + " /x /o rom.p /olist ..\\code.lst -ALU")) // Assembles a temporary ROM inside the build_tools folder
	{
		return; // My optimization ego won't like this
	}
	
	executeCommandSync("p2bin.exe rom.p -k");

	exec(`"${system_variable}" "${join(project_folder, "build_tools", "rom.bin")}"`, (error) =>
	{
		if (error)
		{
			window.showErrorMessage("Cannot run the build. " + error);
		}

		unlinkSync("rom.bin");
	});

	const current_date = new Date();
	window.showInformationMessage(`Build succeded at ${current_date.getHours().toString().padStart(2, '0')}:${current_date.getMinutes().toString().padStart(2, '0')}:${current_date.getSeconds().toString().padStart(2, '0')}, running it with BlastEm. (Hurray!)`);
}

function cleanFiles()
{
	if (!workspace.workspaceFolders)
	{
		window.showErrorMessage("You have no opened projects. Please, open a folder containing the correct structure.");
		return;
	}

	process.chdir(workspace.workspaceFolders[0].uri.fsPath);

	readdirSync('.').forEach((item) => 
	{
		if (item.endsWith(".gen") || item.includes(".pre") || item.endsWith(".log") || item.endsWith(".lst"))
		{
			unlink(item, (error) =>
			{
				if (error)
				{
					window.showWarningMessage(`Could not remove "${item}" for cleanup. ${error}`);
				}
			});
		}
	});
}

// This method is called when the extension is activated
// An extension is activated the very first time the command is executed
export function activate(context:ExtensionContext)
{
	const config = workspace.getConfiguration("megaenvironment");
	main_name = config.get<string>("mainFileName", "Sonic.asm");
	constants_name = config.get<string>("constantsFileName", "Constants.asm");
	variables_name = config.get<string>("variablesFileName", "Variables.asm");
	fill_value = config.get<string>("fillValue", "FF");

	const assemble = commands.registerCommand('megaenvironment.assemble', () => 
	{
		if (!filesAndFoldersCheck())
		{
			return; // Bad, can't do anything about this though
		}

		assembleROM();
	});

	const clean_and_assemble = commands.registerCommand('megaenvironment.clean_assemble', () =>
	{
		if (!filesAndFoldersCheck())
		{
			return; // Bad again, still can't do anything
		}

		cleanFiles();

		process.chdir(join(project_folder, "build_tools"));
		output_channel.clear();

		if (!executeCommandSync("asl.exe ..\\" + main_name + " /xx /o rom.p /olist ..\\code.lst -ALU"))
		{
			return; // Don't flame me please
		}

		executeCommandSync(`p2bin.exe rom.p -k -l $${fill_value}`);
		const current_date = new Date();
		const hours = `${current_date.getHours().toString().padStart(2, '0')}`;
		const minutes = `${current_date.getMinutes().toString().padStart(2, '0')}`;
		const seconds = `${current_date.getSeconds().toString().padStart(2, '0')}`;
	
		// Renames and moves the rom.bin file outside build_tools since p2bin doesn't have a switch to change the output file name for some reason
		rename("rom.bin", `..\\${main_name} ${current_date.getFullYear()}_${(current_date.getMonth() + 1).toString().padStart(2, '0')}_${current_date.getDate().toString().padStart(2, '0')} ${hours}.${minutes}.${seconds}.gen`, (error) =>
		{
			if (error)
			{
				if (error?.code !== "ENOENT")
				{
					window.showWarningMessage("Could not rename your ROM, try to take it from \"build_tools\" if it exists. " + error);
				}
				else
				{
					window.showErrorMessage("Cannot rename your ROM, there might be a problem with the compiler. " + error);
					return;
				}
			}
		});

		window.showInformationMessage(`Build succeded at ${hours}:${minutes}:${seconds}. (Hurray!)`);
	});

	const run_BlastEm = commands.registerCommand('megaenvironment.run_blastem', () => 
	{
		const system_variable = process.env.BlastEm;

		// Throws an error if the BlastEm variable is missing or not set up correctly
		if (system_variable === undefined || !system_variable.endsWith("blastem.exe"))
		{
			window.showErrorMessage("You didn't set up the \"BlastEm\" environment variable correctly. You must set this variable to the \"blastem.exe\" executable. The current variable value is: " + system_variable);
			return;
		}

		findAndRunROM(system_variable);
	});

	const run_Regen = commands.registerCommand('megaenvironment.run_regen', () => 
	{
		const system_variable = process.env.Regen;

		// Throws an error if the Regen variable is missing or not set up correctly
		if (system_variable === undefined || !system_variable.endsWith("Regen.exe"))
		{
			window.showErrorMessage("You didn't set up the \"Regen\" environment variable correctly. You must set this variable to the \"Regen.exe\" executable. The current variable value is: " + system_variable);
			return;
		}

		findAndRunROM(system_variable);
	});

	const assemble_and_run_BlastEm = commands.registerCommand("megaenvironment.assemble_run_blastem", () =>
	{
		if (!filesAndFoldersCheck())
		{
			return; // Hope I'll never have to do this in 68k assembly
		}
		
		const system_variable = process.env.BlastEm;

		// Throws an error if the BlastEm variable is missing or not set up correctly
		if (system_variable === undefined || !system_variable.endsWith("blastem.exe"))
		{
			window.showErrorMessage("You didn't set up the \"BlastEm\" environment variable correctly. You must set this variable to the \"blastem.exe\" executable. The current variable value is: " + system_variable);
			return;
		}
		
		runTemporaryROM(system_variable);
	});

	const assemble_and_run_Regen = commands.registerCommand("megaenvironment.assemble_run_regen", () =>
	{
		if (!filesAndFoldersCheck())
		{
			return; // Oh god here it goes again
		}
		
		const system_variable = process.env.Regen;

		// Throws an error if the BlastEm variable is missing or not set up correctly
		if (system_variable === undefined || !system_variable.endsWith("Regen.exe"))
		{
			window.showErrorMessage("You didn't set up the \"Regen\" environment variable correctly. You must set this variable to the \"Regen.exe\" executable. The current variable value is: " + system_variable);
			return;
		}
		
		runTemporaryROM(system_variable);
	});

	const open_EASy68k = commands.registerCommand("megaenvironment.open_easy68k", () =>
	{
		if (!workspace.workspaceFolders)
		{
			window.showErrorMessage("You have no opened projects. Please, open a folder containing the correct structure.");
			return;
		}

		const build_tools_folder = join(workspace.workspaceFolders[0].uri.fsPath, "build_tools");

		if (!existsSync(build_tools_folder))
		{
			window.showErrorMessage("\"build_tools\" folder not present. You should include this folder with its files.");
			return;
		}

		process.chdir(build_tools_folder);

		const editor = window.activeTextEditor;
		let selected_text = "";

		if (editor) 
		{
			selected_text = editor.document.getText(editor.selection);
		}

		if (selected_text === "")
		{
			window.showWarningMessage("You haven't selected any text field. To make sure you want to debug a portion of your code, select the text you want to analyze.");
		}

		const system_variable = process.env.EASy68k;

		if (system_variable === undefined || !system_variable.endsWith("EDIT68K.exe"))
		{
			window.showErrorMessage("You didn't set up the \"EASy68k\" environment variable correctly. You must set this variable to the \"EDIT68K.exe\" executable. The current variable value is: " + system_variable);
			return;
		}

		let text:string;
		const constants_location = join("..", constants_name);
		const variables_location = join("..", variables_name);
		let constants_exists = false;
		let variables_exists = false;

		if (existsSync(constants_location))
		{
			constants_exists = true;
		}

		if (existsSync(variables_location))
		{
			variables_exists = true;
		}

		if (constants_exists && variables_exists)
		{
			text = `; Code\n\n\torg\t0\n\nstart:\n\n${selected_text}\n\n\tsimhalt\n\n\torg\t$FF0000\n\n; Variables\n\n${readFileSync(variables_location)}\n\n; Constants\n\n${readFileSync(constants_location)}\n\n\tend\tstart`;
		}
		else if (constants_exists)
		{
			text = `; Code\n\n\torg\t0\n\nstart:\n\n${selected_text}\n\n\tsimhalt\n\n; Constants\n\n${readFileSync(constants_location)}\n\n\torg\t$FF0000\n\n\tend\tstart`;
		}
		else if (variables_exists)
		{
			text = `; Code\n\n\torg\t0\n\nstart:\n\n${selected_text}\n\n\tsimhalt\n\norg\t$FF0000\n\n; Variables${readFileSync(variables_location)}\n\n\tend\tstart`;
		}
		else
		{
			text = `; Code\n\n\torg\t0\n\nstart:\n\n${selected_text}\n\n\tsimhalt\n\n\tend\tstart`;
		}

		try
		{
			workspace.fs.writeFile(Uri.file(join(build_tools_folder, "temp.txt")), new TextEncoder().encode(text));
		}
		catch (error:any)
		{
			window.showErrorMessage("Unable to create file for testing. " + error);
			return;
		}

		window.showInformationMessage("Debugging your current selection with EASy68k.");

		exec(`"${system_variable}" "${join(build_tools_folder, "temp.txt")}"`, (error) =>
		{
			if (error)
			{
				window.showErrorMessage("Cannot run EASy68k for testing. " + error);
			}

			readdirSync('.').forEach((file) => 
			{
				if (file !== "asl.exe" && file !== "p2bin.exe")
				{
					unlink(file, (error) =>
					{
						if (error)
						{
							window.showWarningMessage(`Could not remove "${file}" for cleanup. ${error}`);
						}
					});
				}
			});
		});
	});

	const backup = commands.registerCommand("megaenvironment.backup", () =>
	{
		if (!workspace.workspaceFolders)
		{
			window.showErrorMessage("You have no opened projects. Please, open a folder containing the correct structure.");
			return;
		}

		process.chdir(workspace.workspaceFolders[0].uri.fsPath); // Change current working folder to the project one

		const zip = new AdmZip(); // Create zip archive reference
		const items = readdirSync('.'); // Read all content in the project folder

		if (!existsSync("Backups"))
		{
			window.showInformationMessage("No \"Backups\" folder found. Fixing.");
			mkdirSync("Backups");
		}
		else
		{
			items.splice(items.indexOf("Backups"), 1); // Remove Backups folder
		}

		items.splice(items.indexOf("build_tools"), 1); // Remove build_tools folder

		items.forEach((item) => 
		{
			zip.addLocalFile(item);

			if (item.endsWith(".gen") || item.includes(".pre") || item.endsWith(".log") || item.endsWith(".lst"))
			{
				unlink(item, (error) =>
				{
					if (error)
					{
						window.showWarningMessage(`Could not remove "${item}" for cleanup. ${error}`);
					}
				});
			}
		});

		const current_date = new Date();
		zip.writeZip(join("Backups", `Backup ${current_date.getFullYear()}_${(current_date.getMonth() + 1).toString().padStart(2, '0')}_${current_date.getDate().toString().padStart(2, '0')} ${current_date.getHours().toString().padStart(2, '0')}.${current_date.getMinutes().toString().padStart(2, '0')}.${current_date.getSeconds().toString().padStart(2, '0')}.zip`)); // I am aware that this line is extraordinarily long
		window.showInformationMessage("Files backed up successfully.");
	});

	const cleanup = commands.registerCommand("megaenvironment.cleanup", () =>
	{
		cleanFiles();
		window.showInformationMessage("Cleanup completed.");
	});

	context.subscriptions.push(assemble, clean_and_assemble, run_BlastEm, run_Regen, assemble_and_run_BlastEm, assemble_and_run_Regen, backup, cleanup, open_EASy68k);
}

workspace.onDidChangeConfiguration((event) =>
{
	if (event.affectsConfiguration('megaenvironment')) // When something gets changed in the extension's settings
	{
		// Get the saved source code file names project-wide
		const config = workspace.getConfiguration("megaenvironment");
		main_name = config.get<string>("mainFileName", "Sonic.asm");
		constants_name = config.get<string>("constantsFileName", "Constants.asm");
		variables_name = config.get<string>("variablesFileName", "Variables.asm");
		fill_value = config.get<string>("fillValue", "FF");
	}
});