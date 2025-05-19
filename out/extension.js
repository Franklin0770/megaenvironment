"use strict";
/*
TODOS:
- Maybe some asyncing;
- Maybe some classes for encapsulation.
*/
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
const vscode_1 = require("vscode");
const child_process_1 = require("child_process");
const fs_1 = require("fs");
const path_1 = require("path");
const adm_zip_1 = __importDefault(require("adm-zip"));
let main_name;
let constants_name;
let variables_name;
let fill_value;
let project_folder;
const output_channel = vscode_1.window.createOutputChannel("The Macro Assembler AS");
const extensionId = "clcxce.motorola-68k-assembly";
if (!vscode_1.extensions.getExtension(extensionId)) {
    vscode_1.window.showWarningMessage(`The extension "${extensionId}" is not installed. Its installation is recommended for text highlighting.`);
}
// Executes a program synchronously, returns true if successful, false if an error occurred
function executeCommandSync(command) {
    try {
        const output = (0, child_process_1.execSync)(command, { encoding: 'ascii' });
        output_channel.append(output);
        return true;
    }
    catch (error) {
        output_channel.append(error.stdout);
        output_channel.appendLine("===============================================================");
        output_channel.append(error.stderr);
        output_channel.show();
        if (error.status === 2) {
            vscode_1.window.showErrorMessage("Build failed. Check the terminal for more details."); // This happens in case the assembler gets an error
        }
        else {
            vscode_1.window.showErrorMessage(error);
        }
        return false;
    }
}
function filesAndFoldersCheck() {
    if (!vscode_1.workspace.workspaceFolders) {
        vscode_1.window.showErrorMessage("You have no opened projects. Please, open a folder containing the correct structure.");
        return false;
    }
    project_folder = vscode_1.workspace.workspaceFolders[0].uri.fsPath; // Gets the full path to the currently opened folder
    if (!(0, fs_1.existsSync)((0, path_1.join)(project_folder, main_name))) {
        vscode_1.window.showErrorMessage(`Main source code is missing. Name it to \"${main_name}\" or change it in the extension settings.`);
        return false;
    }
    const build_tools_folder = (0, path_1.join)(project_folder, "build_tools");
    if (!(0, fs_1.existsSync)(build_tools_folder)) {
        vscode_1.window.showErrorMessage("\"build_tools\" folder not present. You should include this folder with its files.");
        return false;
    }
    if (!(0, fs_1.existsSync)((0, path_1.join)(build_tools_folder, "asl.exe"))) // *project folder*/build_tools/asl.exe
     {
        vscode_1.window.showErrorMessage("\"asl.exe\" assembler is missing. It should be included in \"build_tools\".");
        return false;
    }
    if (!(0, fs_1.existsSync)((0, path_1.join)(build_tools_folder, "p2bin.exe"))) // *project folder*/build_tools/p2bin.exe
     {
        vscode_1.window.showErrorMessage("\"p2bin.exe\" compiler is missing. It should be included in \"build_tools\".");
        return false;
    }
    return true;
}
function assembleROM() {
    process.chdir((0, path_1.join)(project_folder, "build_tools"));
    output_channel.clear();
    if (!executeCommandSync("asl.exe ..\\" + main_name + " /xx /o rom.p /olist ..\\code.lst -ALU")) {
        return; // This is awful I know
    }
    process.chdir(project_folder);
    const files = (0, fs_1.readdirSync)('.'); // Reads all files and folders and put them into a string array
    // Checks if there are any files that have the .gen extension, if so it renames it with .pre and a number
    for (const check_name of files) // One of the few for loops that support breaking
     {
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
            (0, fs_1.rename)(check_name, new_extension, (error) => {
                if (error) {
                    vscode_1.window.showWarningMessage("Could not rename the previous ROM. To avoid conflicts, rename the older build to \"" + new_extension + "\" manually.");
                    return;
                }
                vscode_1.window.showInformationMessage("Latest build already exists, renaming it to \"" + new_extension + "\".");
            });
            break;
        }
    }
    // Change current working folder back to build_tools and execute the compiler from there
    process.chdir((0, path_1.join)(project_folder, "build_tools"));
    executeCommandSync(`p2bin.exe rom.p -k -l $${fill_value}`);
    const current_date = new Date();
    const hours = `${current_date.getHours().toString().padStart(2, '0')}`;
    const minutes = `${current_date.getMinutes().toString().padStart(2, '0')}`;
    const seconds = `${current_date.getSeconds().toString().padStart(2, '0')}`;
    // Renames and moves the rom.bin file outside build_tools since p2bin doesn't have a switch to change the output file name for some reason
    (0, fs_1.rename)("rom.bin", `..\\${main_name} ${current_date.getFullYear()}_${(current_date.getMonth() + 1).toString().padStart(2, '0')}_${current_date.getDate().toString().padStart(2, '0')} ${hours}.${minutes}.${seconds}.gen`, (error) => // I am aware that this line is extraordinarily long
     {
        if (error) {
            if (error?.code !== "ENOENT") {
                vscode_1.window.showWarningMessage("Could not rename your ROM, try to take it from \"build_tools\" if it exists. " + error);
            }
            else {
                vscode_1.window.showErrorMessage("Cannot rename your ROM, there might be a problem with the compiler. " + error);
                return;
            }
        }
    });
    vscode_1.window.showInformationMessage(`Build succeded at ${hours}:${minutes}:${seconds}. (Hurray!)`);
}
function findAndRunROM(system_variable) {
    if (!vscode_1.workspace.workspaceFolders) {
        vscode_1.window.showErrorMessage("You have no opened projects. Please, open a folder containing the correct structure.");
        return;
    }
    project_folder = vscode_1.workspace.workspaceFolders[0].uri.fsPath; // Get the full path to the currently opened folder
    process.chdir(project_folder); // Change current working folder to the root of the opened one
    (0, fs_1.readdir)('.', (error, files) => {
        if (error) {
            vscode_1.window.showErrorMessage("Cannot open project folder for reading. " + error);
            return;
        }
        for (const file of files) // For every file
         {
            if (file.endsWith(".gen")) {
                (0, child_process_1.exec)(`"${system_variable}" "${(0, path_1.join)(project_folder, file)}"`, (error) => {
                    if (!error) {
                        vscode_1.window.showInformationMessage(`Running "${file}" with BlastEm.`);
                    }
                    else {
                        vscode_1.window.showErrorMessage("Cannot run the latest build. " + error);
                    }
                });
                return;
            }
        }
        vscode_1.window.showErrorMessage("There are no ROMs to run. Build something first.");
    });
}
function runTemporaryROM(system_variable) {
    process.chdir((0, path_1.join)(project_folder, "build_tools"));
    output_channel.clear();
    if (!executeCommandSync("asl.exe ..\\" + main_name + " /x /o rom.p /olist ..\\code.lst -ALU")) // Assembles a temporary ROM inside the build_tools folder
     {
        return; // My optimization ego won't like this
    }
    executeCommandSync("p2bin.exe rom.p -k");
    (0, child_process_1.exec)(`"${system_variable}" "${(0, path_1.join)(project_folder, "build_tools", "rom.bin")}"`, (error) => {
        if (error) {
            vscode_1.window.showErrorMessage("Cannot run the build. " + error);
        }
        (0, fs_1.unlinkSync)("rom.bin");
    });
    const current_date = new Date();
    vscode_1.window.showInformationMessage(`Build succeded at ${current_date.getHours().toString().padStart(2, '0')}:${current_date.getMinutes().toString().padStart(2, '0')}:${current_date.getSeconds().toString().padStart(2, '0')}, running it with BlastEm. (Hurray!)`);
}
function cleanFiles() {
    if (!vscode_1.workspace.workspaceFolders) {
        vscode_1.window.showErrorMessage("You have no opened projects. Please, open a folder containing the correct structure.");
        return;
    }
    process.chdir(vscode_1.workspace.workspaceFolders[0].uri.fsPath);
    (0, fs_1.readdirSync)('.').forEach((item) => {
        if (item.endsWith(".gen") || item.includes(".pre") || item.endsWith(".log") || item.endsWith(".lst")) {
            (0, fs_1.unlink)(item, (error) => {
                if (error) {
                    vscode_1.window.showWarningMessage(`Could not remove "${item}" for cleanup. ${error}`);
                }
            });
        }
    });
}
// This method is called when the extension is activated
// An extension is activated the very first time the command is executed
function activate(context) {
    const config = vscode_1.workspace.getConfiguration("megaenvironment");
    main_name = config.get("mainFileName", "Sonic.asm");
    constants_name = config.get("constantsFileName", "Constants.asm");
    variables_name = config.get("variablesFileName", "Variables.asm");
    fill_value = config.get("fillValue", "FF");
    const assemble = vscode_1.commands.registerCommand('megaenvironment.assemble', () => {
        if (!filesAndFoldersCheck()) {
            return; // Bad, can't do anything about this though
        }
        assembleROM();
    });
    const clean_and_assemble = vscode_1.commands.registerCommand('megaenvironment.clean_assemble', () => {
        if (!filesAndFoldersCheck()) {
            return; // Bad again, still can't do anything
        }
        cleanFiles();
        process.chdir((0, path_1.join)(project_folder, "build_tools"));
        output_channel.clear();
        if (!executeCommandSync("asl.exe ..\\" + main_name + " /xx /o rom.p /olist ..\\code.lst -ALU")) {
            return; // Don't flame me please
        }
        executeCommandSync(`p2bin.exe rom.p -k -l $${fill_value}`);
        const current_date = new Date();
        const hours = `${current_date.getHours().toString().padStart(2, '0')}`;
        const minutes = `${current_date.getMinutes().toString().padStart(2, '0')}`;
        const seconds = `${current_date.getSeconds().toString().padStart(2, '0')}`;
        // Renames and moves the rom.bin file outside build_tools since p2bin doesn't have a switch to change the output file name for some reason
        (0, fs_1.rename)("rom.bin", `..\\${main_name} ${current_date.getFullYear()}_${(current_date.getMonth() + 1).toString().padStart(2, '0')}_${current_date.getDate().toString().padStart(2, '0')} ${hours}.${minutes}.${seconds}.gen`, (error) => {
            if (error) {
                if (error?.code !== "ENOENT") {
                    vscode_1.window.showWarningMessage("Could not rename your ROM, try to take it from \"build_tools\" if it exists. " + error);
                }
                else {
                    vscode_1.window.showErrorMessage("Cannot rename your ROM, there might be a problem with the compiler. " + error);
                    return;
                }
            }
        });
        vscode_1.window.showInformationMessage(`Build succeded at ${hours}:${minutes}:${seconds}. (Hurray!)`);
    });
    const run_BlastEm = vscode_1.commands.registerCommand('megaenvironment.run_blastem', () => {
        const system_variable = process.env.BlastEm;
        // Throws an error if the BlastEm variable is missing or not set up correctly
        if (system_variable === undefined || !system_variable.endsWith("blastem.exe")) {
            vscode_1.window.showErrorMessage("You didn't set up the \"BlastEm\" environment variable correctly. You must set this variable to the \"blastem.exe\" executable. The current variable value is: " + system_variable);
            return;
        }
        findAndRunROM(system_variable);
    });
    const run_Regen = vscode_1.commands.registerCommand('megaenvironment.run_regen', () => {
        const system_variable = process.env.Regen;
        // Throws an error if the Regen variable is missing or not set up correctly
        if (system_variable === undefined || !system_variable.endsWith("Regen.exe")) {
            vscode_1.window.showErrorMessage("You didn't set up the \"Regen\" environment variable correctly. You must set this variable to the \"Regen.exe\" executable. The current variable value is: " + system_variable);
            return;
        }
        findAndRunROM(system_variable);
    });
    const assemble_and_run_BlastEm = vscode_1.commands.registerCommand("megaenvironment.assemble_run_blastem", () => {
        if (!filesAndFoldersCheck()) {
            return; // Hope I'll never have to do this in 68k assembly
        }
        const system_variable = process.env.BlastEm;
        // Throws an error if the BlastEm variable is missing or not set up correctly
        if (system_variable === undefined || !system_variable.endsWith("blastem.exe")) {
            vscode_1.window.showErrorMessage("You didn't set up the \"BlastEm\" environment variable correctly. You must set this variable to the \"blastem.exe\" executable. The current variable value is: " + system_variable);
            return;
        }
        runTemporaryROM(system_variable);
    });
    const assemble_and_run_Regen = vscode_1.commands.registerCommand("megaenvironment.assemble_run_regen", () => {
        if (!filesAndFoldersCheck()) {
            return; // Oh god here it goes again
        }
        const system_variable = process.env.Regen;
        // Throws an error if the BlastEm variable is missing or not set up correctly
        if (system_variable === undefined || !system_variable.endsWith("Regen.exe")) {
            vscode_1.window.showErrorMessage("You didn't set up the \"Regen\" environment variable correctly. You must set this variable to the \"Regen.exe\" executable. The current variable value is: " + system_variable);
            return;
        }
        runTemporaryROM(system_variable);
    });
    const open_EASy68k = vscode_1.commands.registerCommand("megaenvironment.open_easy68k", () => {
        if (!vscode_1.workspace.workspaceFolders) {
            vscode_1.window.showErrorMessage("You have no opened projects. Please, open a folder containing the correct structure.");
            return;
        }
        const build_tools_folder = (0, path_1.join)(vscode_1.workspace.workspaceFolders[0].uri.fsPath, "build_tools");
        if (!(0, fs_1.existsSync)(build_tools_folder)) {
            vscode_1.window.showErrorMessage("\"build_tools\" folder not present. You should include this folder with its files.");
            return;
        }
        process.chdir(build_tools_folder);
        const editor = vscode_1.window.activeTextEditor;
        let selected_text = "";
        if (editor) {
            selected_text = editor.document.getText(editor.selection);
        }
        if (selected_text === "") {
            vscode_1.window.showWarningMessage("You haven't selected any text field. To make sure you want to debug a portion of your code, select the text you want to analyze.");
        }
        const system_variable = process.env.EASy68k;
        if (system_variable === undefined || !system_variable.endsWith("EDIT68K.exe")) {
            vscode_1.window.showErrorMessage("You didn't set up the \"EASy68k\" environment variable correctly. You must set this variable to the \"EDIT68K.exe\" executable. The current variable value is: " + system_variable);
            return;
        }
        let text;
        const constants_location = (0, path_1.join)("..", constants_name);
        const variables_location = (0, path_1.join)("..", variables_name);
        let constants_exists = false;
        let variables_exists = false;
        if ((0, fs_1.existsSync)(constants_location)) {
            constants_exists = true;
        }
        if ((0, fs_1.existsSync)(variables_location)) {
            variables_exists = true;
        }
        if (constants_exists && variables_exists) {
            text = `; Code\n\n\torg\t0\n\nstart:\n\n${selected_text}\n\n\tsimhalt\n\n\torg\t$FF0000\n\n; Variables\n\n${(0, fs_1.readFileSync)(variables_location)}\n\n; Constants\n\n${(0, fs_1.readFileSync)(constants_location)}\n\n\tend\tstart`;
        }
        else if (constants_exists) {
            text = `; Code\n\n\torg\t0\n\nstart:\n\n${selected_text}\n\n\tsimhalt\n\n; Constants\n\n${(0, fs_1.readFileSync)(constants_location)}\n\n\torg\t$FF0000\n\n\tend\tstart`;
        }
        else if (variables_exists) {
            text = `; Code\n\n\torg\t0\n\nstart:\n\n${selected_text}\n\n\tsimhalt\n\norg\t$FF0000\n\n; Variables${(0, fs_1.readFileSync)(variables_location)}\n\n\tend\tstart`;
        }
        else {
            text = `; Code\n\n\torg\t0\n\nstart:\n\n${selected_text}\n\n\tsimhalt\n\n\tend\tstart`;
        }
        try {
            vscode_1.workspace.fs.writeFile(vscode_1.Uri.file((0, path_1.join)(build_tools_folder, "temp.txt")), new TextEncoder().encode(text));
        }
        catch (error) {
            vscode_1.window.showErrorMessage("Unable to create file for testing. " + error);
            return;
        }
        vscode_1.window.showInformationMessage("Debugging your current selection with EASy68k.");
        (0, child_process_1.exec)(`"${system_variable}" "${(0, path_1.join)(build_tools_folder, "temp.txt")}"`, (error) => {
            if (error) {
                vscode_1.window.showErrorMessage("Cannot run EASy68k for testing. " + error);
            }
            (0, fs_1.readdirSync)('.').forEach((file) => {
                if (file !== "asl.exe" && file !== "p2bin.exe") {
                    (0, fs_1.unlink)(file, (error) => {
                        if (error) {
                            vscode_1.window.showWarningMessage(`Could not remove "${file}" for cleanup. ${error}`);
                        }
                    });
                }
            });
        });
    });
    const backup = vscode_1.commands.registerCommand("megaenvironment.backup", () => {
        if (!vscode_1.workspace.workspaceFolders) {
            vscode_1.window.showErrorMessage("You have no opened projects. Please, open a folder containing the correct structure.");
            return;
        }
        process.chdir(vscode_1.workspace.workspaceFolders[0].uri.fsPath); // Change current working folder to the project one
        const zip = new adm_zip_1.default(); // Create zip archive reference
        const items = (0, fs_1.readdirSync)('.'); // Read all content in the project folder
        if (!(0, fs_1.existsSync)("Backups")) {
            vscode_1.window.showInformationMessage("No \"Backups\" folder found. Fixing.");
            (0, fs_1.mkdirSync)("Backups");
        }
        else {
            items.splice(items.indexOf("Backups"), 1); // Remove Backups folder
        }
        items.splice(items.indexOf("build_tools"), 1); // Remove build_tools folder
        items.forEach((item) => {
            zip.addLocalFile(item);
            if (item.endsWith(".gen") || item.includes(".pre") || item.endsWith(".log") || item.endsWith(".lst")) {
                (0, fs_1.unlink)(item, (error) => {
                    if (error) {
                        vscode_1.window.showWarningMessage(`Could not remove "${item}" for cleanup. ${error}`);
                    }
                });
            }
        });
        const current_date = new Date();
        zip.writeZip((0, path_1.join)("Backups", `Backup ${current_date.getFullYear()}_${(current_date.getMonth() + 1).toString().padStart(2, '0')}_${current_date.getDate().toString().padStart(2, '0')} ${current_date.getHours().toString().padStart(2, '0')}.${current_date.getMinutes().toString().padStart(2, '0')}.${current_date.getSeconds().toString().padStart(2, '0')}.zip`)); // I am aware that this line is extraordinarily long
        vscode_1.window.showInformationMessage("Files backed up successfully.");
    });
    const cleanup = vscode_1.commands.registerCommand("megaenvironment.cleanup", () => {
        cleanFiles();
        vscode_1.window.showInformationMessage("Cleanup completed.");
    });
    context.subscriptions.push(assemble, clean_and_assemble, run_BlastEm, run_Regen, assemble_and_run_BlastEm, assemble_and_run_Regen, backup, cleanup, open_EASy68k);
}
vscode_1.workspace.onDidChangeConfiguration((event) => {
    if (event.affectsConfiguration('megaenvironment')) // When something gets changed in the extension's settings
     {
        // Get the saved source code file names project-wide
        const config = vscode_1.workspace.getConfiguration("megaenvironment");
        main_name = config.get("mainFileName", "Sonic.asm");
        constants_name = config.get("constantsFileName", "Constants.asm");
        variables_name = config.get("variablesFileName", "Variables.asm");
        fill_value = config.get("fillValue", "FF");
    }
});
//# sourceMappingURL=extension.js.map