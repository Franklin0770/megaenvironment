"use strict";
/*
TODOS:
- Maybe some MORE asyncing;
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
const stream_1 = require("stream");
const path_1 = require("path");
const adm_zip_1 = __importDefault(require("adm-zip"));
let extensionSettings = {
    defaultCpu: '68000',
    superiorWarnings: false,
    signWarning: false,
    jumpsWarning: false,
    romName: '',
    romDate: true,
    prevRoms: true,
    prevAmount: 10,
    sonicDisassembly: false,
    mainName: '',
    constantsName: '',
    variablesName: '',
    listingFile: true,
    listingName: '',
    errorFile: false,
    errorName: '',
    debugFile: 'None',
    sectionListing: false,
    macroListing: false,
    sourceListing: false,
    cleaningExtensions: ['.gen', '.pre', '.lst', '.log', '.map', '.noi', '.obj', '.mac', '.i'],
    workingFolders: ['.'],
    caseSensitive: true,
    backupName: '',
    backupDate: true,
    compactSymbols: true,
    fillValue: '00',
    errorLevel: 0,
    errorNumber: false,
    asErrors: false,
    lowercaseHex: false,
    compatibilityMode: false,
    suppressWarnings: false,
    quietOperation: false,
    verboseOperation: false,
    warningsAsErrors: false
};
const settingDescriptors = [
    { key: 'codeOptions.defaultCPU', target: 'defaultCpu' },
    { key: 'codeOptions.superiorModeWarnings', target: 'superiorWarnings' },
    { key: 'codeOptions.compatibilityMode', target: 'compatibilityMode' },
    { key: 'codeOptions.signExtensionWarning', target: 'signWarning' },
    { key: 'codeOptions.absoluteJumpsWarning', target: 'jumpsWarning' },
    { key: 'codeOptions.caseSensitiveMode', target: 'caseSensitive' },
    { key: 'buildControl.outputRomName', target: 'romName' },
    { key: 'buildControl.includeRomDate', target: 'romDate' },
    { key: 'buildControl.enablePreviousBuilds', target: 'prevRoms' },
    { key: 'buildControl.previousRomsAmount', target: 'prevAmount' },
    // 'buildControl.sonicDisassemblySupport' is handled differently
    { key: 'sourceCodeControl.mainFileName', target: 'mainName' },
    { key: 'sourceCodeControl.constantsFileName', target: 'constantsName' },
    { key: 'sourceCodeControl.variablesFileName', target: 'variablesName' },
    { key: 'sourceCodeControl.generateCodeListing', target: 'listingFile' },
    { key: 'sourceCodeControl.listingFileName', target: 'listingName' },
    { key: 'sourceCodeControl.generateErrorListing', target: 'errorFile' },
    { key: 'sourceCodeControl.errorFileName', target: 'errorName' },
    { key: 'sourceCodeControl.generateDebugFile', target: 'debugFile' },
    { key: 'sourceCodeControl.generateSectionListing', target: 'sectionListing' },
    { key: 'sourceCodeControl.generateMacroListing', target: 'macroListing' },
    { key: 'sourceCodeControl.generateSourceListing', target: 'sourceListing' },
    { key: 'sourceCodeControl.cleaningExtensionSelector', target: 'cleaningExtensions' },
    { key: 'sourceCodeControl.currentWorkingFolders', target: 'workingFolders' },
    { key: 'backupOptions.backupFileName', target: 'backupName' },
    { key: 'backupOptions.includeBackupDate', target: 'backupDate' },
    { key: 'miscellaneous.fillValue', target: 'fillValue' },
    { key: 'miscellaneous.errorLevel', target: 'errorLevel' },
    { key: 'miscellaneous.displayErrorNumber', target: 'errorNumber' },
    { key: 'miscellaneous.AS-StyledErrors', target: 'asErrors' },
    { key: 'miscellaneous.lowercaseHexadecimal', target: 'lowercaseHex' },
    { key: 'miscellaneous.suppressWarnings', target: 'suppressWarnings' },
    { key: 'miscellaneous.quietOperation', target: 'quietOperation' },
    { key: 'miscellaneous.verboseOperation', target: 'verboseOperation' },
    { key: 'miscellaneous.warningsAsErrors', target: 'warningsAsErrors' }
];
let assemblerFolder;
let assemblerPath;
let compilerPath;
let isDownloading;
let firstActivation = true;
const outputChannel = vscode_1.window.createOutputChannel('The Macroassembler AS');
async function downloadAssembler() {
    isDownloading = true;
    return await vscode_1.window.withProgress({
        location: vscode_1.ProgressLocation.Window,
        title: !extensionSettings.sonicDisassembly ? "Original assembler" : "Sonic's assembler",
        cancellable: true
    }, async (progress, token) => {
        token.onCancellationRequested(() => {
            vscode_1.window.showErrorMessage("Operation was cancelled! You can retry if you didn't mean to stop the download.", 'Re-attempt Download')
                .then((selection) => {
                if (selection === 'Re-attempt Download') {
                    downloadAssembler();
                }
            });
            return false;
        });
        progress.report({ message: 'checking your platform...', increment: 0 });
        let zipName;
        switch (process.platform) {
            case 'win32':
                zipName = 'windows-x86';
                break;
            case 'darwin':
                if (process.arch === 'arm64') {
                    zipName = 'mac-arm64';
                }
                else {
                    zipName = 'mac-x86_64';
                }
                break;
            case 'linux':
                if (process.arch === 'x64') {
                    zipName = 'linux-x86_64';
                }
                else {
                    zipName = 'linux-arm64';
                }
                break;
            default:
                vscode_1.window.showErrorMessage("Hey, what platform is this? Please, let me know which operative system you're running VS Code on!");
                return false;
        }
        zipName += '.zip';
        progress.report({ message: 'requesting your assembler version...', increment: 10 });
        const releaseTag = ['latest', 'v1.42b_212f'];
        let response;
        try {
            response = await fetch('https://github.com/Franklin0770/AS-releases/releases/download/' + releaseTag[+extensionSettings.sonicDisassembly] + '/' + zipName);
        }
        catch {
            if ((0, fs_1.existsSync)(assemblerPath) && (0, fs_1.existsSync)(compilerPath)) {
                vscode_1.window.showWarningMessage("Internet connection is either missing or insufficient, we'll have to stick with what we have.");
                return true;
            }
            vscode_1.window.showErrorMessage("Failed to download the latest AS compiler. We can't proceed since there's no previously downloaded versions. Make sure you have a stable Internet connection.");
            return false;
        }
        if (!response.ok || !response.body) {
            if (response.status === 404) { // The classic "not found"
                if ((0, fs_1.existsSync)(assemblerPath) && (0, fs_1.existsSync)(compilerPath)) {
                    vscode_1.window.showWarningMessage('Hmm, it appears the download source is deprecated and incorrect, we can stick with what we have, though. Try updating the extension, if possible.', 'Last Resort Guide')
                        .then(selection => {
                        if (selection === 'Last Resort Guide') {
                            throw new Error('[Not implemented yet]');
                        }
                    });
                    return true;
                }
                vscode_1.window.showErrorMessage("Unfortunately, the download source is deprecated and incorrect, and we may not proceed since there isn't a previously downloaded version in your system. If there aren't any available updates then sorry, I might have discontinued this extension!", 'Last Resort Guide!')
                    .then(selection => {
                    if (selection === 'Last Resort Guide!') {
                        throw new Error('[Not implemented yet]');
                    }
                });
                return false;
            }
            vscode_1.window.showErrorMessage('Failed to download the latest AS compiler. ' + response.statusText);
            (0, fs_1.unlink)(zipName, (error) => {
                if (error?.code !== 'ENOENT') {
                    vscode_1.window.showWarningMessage("Couldn't remove the temporary ZIP file.");
                }
            });
            return false;
        }
        progress.report({ message: 'downloading ZIP...', increment: 20 });
        if (!(0, fs_1.existsSync)(assemblerFolder)) {
            (0, fs_1.mkdirSync)(assemblerFolder, { recursive: true });
        }
        process.chdir(assemblerFolder);
        const fileStream = (0, fs_1.createWriteStream)(zipName);
        const success = await new Promise((resolve) => {
            let retries = 1;
            const retry = () => {
                (0, stream_1.pipeline)(response.body, fileStream, (error) => {
                    if (error) {
                        if (retries <= 3) {
                            progress.report({ message: `downloading ZIP... (take number ${retries})`, increment: 0 });
                            retries--;
                            setTimeout(retry, 1000);
                        }
                        else {
                            if ((0, fs_1.existsSync)(assemblerPath) && (0, fs_1.existsSync)(compilerPath)) {
                                vscode_1.window.showWarningMessage('Even though it turned out to be impossible to download the assembler, we still have the previous version we can use!');
                                resolve(true);
                            }
                            else {
                                vscode_1.window.showErrorMessage('After multiple tries, it turned out to be impossible to download the assembler. Make sure you have a fast enough Internet connection.');
                                resolve(false);
                            }
                        }
                    }
                    else {
                        resolve(true);
                    }
                });
            };
            retry(); // This is where it starts
        });
        if (!success) {
            return false;
        }
        progress.report({ message: 'extracting ZIP...', increment: 50 });
        let zip;
        try {
            zip = new adm_zip_1.default(zipName);
        }
        catch {
            if ((0, fs_1.existsSync)(assemblerPath) && (0, fs_1.existsSync)(compilerPath)) {
                vscode_1.window.showWarningMessage('Hmm, it appears the download source is deprecated and incorrect, we can stick with what we have, though. Try updating the extension, if possible.', 'Last Resort Guide')
                    .then(selection => {
                    if (selection === 'Last Resort Guide') {
                        throw new Error('[Not implemented yet]');
                    }
                });
                return true;
            }
            vscode_1.window.showErrorMessage("Unfortunately, the download source is deprecated and incorrect, and we may not proceed since there isn't a previously downloaded version in your system. If there aren't any available updates then sorry, I might have discontinued this extension!", 'Last Resort Guide!')
                .then(selection => {
                if (selection === 'Last Resort Guide!') {
                    throw new Error('[Not implemented yet]');
                }
            });
            return false;
        }
        const entries = zip.getEntries();
        for (const entry of entries) {
            const name = entry.name;
            // Remove the first folder from the path
            await new Promise((resolve, reject) => {
                (0, fs_1.writeFile)(name, entry.getData(), (error) => {
                    if (error) {
                        vscode_1.window.showErrorMessage('Cannot extract the file: ' + name);
                        reject();
                    }
                    resolve();
                });
            });
            if (process.platform !== 'win32') {
                (0, fs_1.chmod)(name, 0o755, (error) => {
                    if (error) {
                        vscode_1.window.showErrorMessage('Cannot get read and write permissions for this file: ' + name);
                    }
                }); // Get permissions (rwx) for Unix-based systems
            }
        }
        progress.report({ message: 'cleaning things up...', increment: 10 });
        (0, fs_1.readdirSync)('.').forEach(item => {
            if (item === zipName || !extensionSettings.sonicDisassembly && (item === 'as.msg' || item === 'cmdarg.msg' || item === 'ioerrs.msg')) {
                (0, fs_1.unlink)(item, (error) => {
                    if (error) {
                        vscode_1.window.showWarningMessage('Could not remove the temporary file file located at ' + (0, path_1.join)(assemblerFolder, item));
                    }
                });
            }
        });
        isDownloading = false;
        firstActivation = false;
        progress.report({ message: 'done! (This message will almost never be seen...)', increment: 10 });
        return true;
    });
}
async function promptEmulatorPath(emulator) {
    let shouldContinue = true;
    const config = vscode_1.workspace.getConfiguration('megaenvironment');
    const key = `paths.${emulator}`;
    const path = config.get(key, '');
    if ((0, fs_1.existsSync)(path) && (0, fs_1.statSync)(path).isFile()) {
        return true;
    } // The emulator is already there, no need to ask anything
    const input = await vscode_1.window.showInputBox({
        title: `Set ${emulator} Path`,
        prompt: 'Enter the full path to your emulator executable',
        value: path,
        ignoreFocusOut: true
    });
    if (!input) {
        vscode_1.window.showErrorMessage('Without the path, it would be impossible to localise your emulator and run the ROM. Please, try again!', 'Retry')
            .then((selection) => {
            if (selection === 'Retry') {
                promptEmulatorPath(emulator);
            }
        });
        return false;
    }
    if (!(0, fs_1.existsSync)(input)) {
        vscode_1.window.showErrorMessage("The path you provided doesn't exist!", 'Retry')
            .then((selection) => {
            if (selection === 'Retry') {
                promptEmulatorPath(emulator);
            }
        });
        shouldContinue = false;
    }
    if (shouldContinue && (0, fs_1.statSync)(input).isDirectory()) { // Gets stuck here if the path doesn't exist
        vscode_1.window.showErrorMessage('The path you provided points only to a folder!', 'Retry')
            .then((selection) => {
            if (selection === 'Retry') {
                promptEmulatorPath(emulator);
            }
        });
        shouldContinue = false;
    }
    await config.update(key, input, true // true = global setting
    );
    return shouldContinue;
}
async function assemblerChecks() {
    const projectFolders = vscode_1.workspace.workspaceFolders;
    if (!projectFolders) {
        vscode_1.window.showErrorMessage('You have no opened projects. Please, open a folder containing the correct structure.');
        return false;
    }
    if (!(0, fs_1.existsSync)((0, path_1.join)(projectFolders[0].uri.fsPath, extensionSettings.mainName))) {
        vscode_1.window.showErrorMessage(`The main source code is missing. Name it to "${extensionSettings.mainName}", or change it through the settings.`);
        return false;
    }
    if (isDownloading) {
        if (!firstActivation) {
            vscode_1.window.showInformationMessage('Hold on until your tools finished downloading!');
        }
        return new Promise((resolve) => {
            const check = () => {
                if (isDownloading) {
                    setTimeout(check, 200);
                }
                else {
                    return resolve(true);
                }
            };
            check();
        });
    }
    return true;
}
// Assembles and compiles a ROM
// 0 if successful, 1 if successful with warnings and -1 if there's an error or a fatal one
// If the number is negative we shall not proceed (this case only -1)
async function executeAssemblyCommand() {
    // We proceed with the assembler, which creates the program file
    outputChannel.clear();
    process.chdir(vscode_1.workspace.workspaceFolders[0].uri.fsPath); // We already checked if "workspaceFolders" exists. This is why I put "!"
    let command = `"${assemblerPath}" "${extensionSettings.mainName}" -o "${(0, path_1.join)(assemblerFolder, 'rom.p')}" -`;
    let warnings = false;
    const shortFlags = [
        [extensionSettings.compactSymbols, 'A'],
        [extensionSettings.listingFile, 'L'],
        [extensionSettings.caseSensitive, 'U'],
        [!!extensionSettings.errorLevel, 'x'.repeat(extensionSettings.errorLevel)],
        [extensionSettings.errorNumber, 'n'],
        [extensionSettings.lowercaseHex, 'h'],
        [extensionSettings.suppressWarnings, 'w'],
        [extensionSettings.sectionListing, 's'],
        [extensionSettings.macroListing, 'M'],
        [extensionSettings.sourceListing, 'P'],
        [extensionSettings.warningsAsErrors, ' -Werror'],
        [!extensionSettings.asErrors, ' -gnuerrors'],
        [!extensionSettings.superiorWarnings, ' -supmode'],
        [extensionSettings.compatibilityMode, ' -compmode'],
        [!extensionSettings.signWarning, ' -wno-implicit-sign-extension'],
        [extensionSettings.jumpsWarning, ' -wrelative']
    ];
    for (const [condition, flag] of shortFlags) { // Best way I (and ChatGPT) could have thought to do this
        if (condition) {
            command += flag;
        }
    }
    if (extensionSettings.errorFile) {
        if (extensionSettings.errorName !== '') {
            command += ' -E ' + extensionSettings.errorName + '.log';
        }
        else {
            command += ' -E ';
        }
    }
    // Some other flags that have different behavior, not just booleans
    if (extensionSettings.debugFile !== 'None') {
        command += ' -g ' + extensionSettings.debugFile;
    }
    if (extensionSettings.defaultCpu) {
        command += ' -cpu ' + extensionSettings.defaultCpu;
    }
    if (extensionSettings.workingFolders.length > 0) {
        command += ' -i "' + extensionSettings.workingFolders.join('";"') + '"';
    }
    else if (extensionSettings.sonicDisassembly) {
        vscode_1.window.showWarningMessage('You have cleared the assets folders in the settings! Prepare yourself for "include" errors.');
    }
    console.log(command);
    // AS exit code convention: 0 if successful, 2 if error, 3 if fatal error
    const { aslOut, aslErr, code } = await new Promise((resolve) => {
        (0, child_process_1.exec)(command, { encoding: 'ascii' }, (error, stdout, stderr) => {
            if (!error) {
                resolve({ aslOut: stdout, aslErr: stderr, code: 0 });
            }
            else {
                resolve({ aslOut: stdout ?? 'No output provided.', aslErr: stderr ?? 'No error provided.', code: error.code ?? -1 });
            }
        });
    });
    outputChannel.append(aslOut);
    if (code === 0) {
        if (extensionSettings.verboseOperation) {
            outputChannel.show();
        }
        if (aslErr !== '' && !extensionSettings.suppressWarnings) {
            outputChannel.appendLine('\n==================== ASSEMBLER WARNINGS ====================\n');
            outputChannel.appendLine(aslErr);
            outputChannel.appendLine('============================================================');
            warnings = true;
        }
    }
    else {
        let errorLocation = 'log file';
        if (!extensionSettings.errorFile) {
            outputChannel.appendLine('\n==================== ASSEMBLER ERROR ====================\n');
            outputChannel.append(aslErr);
            outputChannel.show();
            errorLocation = 'terminal';
        }
        switch (code) {
            case 2:
                vscode_1.window.showErrorMessage(`Build failed. An error was thrown by the assembler. Check the ${errorLocation} for more details.`);
                break;
            case 3:
                vscode_1.window.showErrorMessage(`Build failed. A fatal error was thrown by the assembler. Check the ${errorLocation} for more details.`);
                break;
            default:
                vscode_1.window.showErrorMessage(`The assembler has thrown an unknown error. Check the ${errorLocation} for more details.`);
                break;
        }
        return -1; // Can't proceed with compiling, there's no program file
    }
    // Now, to the compiler!
    process.chdir(assemblerFolder); // We can't change the output folder, so this will do
    // Take only some outputs and the custom exit code with aliases. Unix wants '.', so I'm providing it
    const { p2binOut, p2binErr, success } = await new Promise((resolve) => {
        (0, child_process_1.exec)(`"${compilerPath}" rom.p -l 0x${extensionSettings.fillValue} -k`, { encoding: 'ascii' }, (error, stdout, stderr) => {
            if (!error) {
                resolve({ p2binOut: stdout, p2binErr: stderr, success: true });
            }
            else {
                const longMessage = 'No output provided. Perhaps, according to my calculations, this is the rarest message you can get, so go play for the lottery until you can. Thank me later!';
                resolve({ p2binOut: stdout ?? longMessage, p2binErr: stderr ?? 'No error provided.', success: false });
            }
        });
    });
    outputChannel.append('\n' + p2binOut);
    if (success) {
        if (p2binErr !== '' && extensionSettings.suppressWarnings) {
            outputChannel.appendLine('\n==================== COMPILER WARNINGS ====================\n');
            outputChannel.appendLine(p2binErr);
            outputChannel.appendLine('===========================================================');
            return 1; // There's more than 1 warning anyway
        }
    }
    else {
        outputChannel.appendLine('\n==================== COMPILER ERROR ====================\n');
        outputChannel.append(p2binErr);
        vscode_1.window.showErrorMessage('The compiler has thrown an unknown error. Check the terminal for more details.');
        return -1; // There's more than 1 error anyway
    }
    return (+warnings); // Reuse "warnings" if there were prior warnings. 0 if false, 1 if true
}
async function assembleROM() {
    if (await assemblerChecks() === false) {
        return;
    }
    let warnings = false;
    switch (await executeAssemblyCommand()) {
        case 0:
            break;
        case 1:
            warnings = true;
            break;
        default:
            return;
    }
    const projectFolder = vscode_1.workspace.workspaceFolders[0].uri.fsPath;
    process.chdir(projectFolder);
    const files = (0, fs_1.readdirSync)('.'); // Reads all files and folders and put them into a string array
    // Checks if there are any files that have the .gen extension. If so, it gets renamed with .pre and a number
    for (const checkName of files) {
        if (!checkName.endsWith('.gen')) {
            continue;
        } // Indentantions are less clean
        if (!extensionSettings.prevRoms) { // We simply replace the lastest ROM if there's no versioning to do
            (0, fs_1.unlink)(checkName, (error) => {
                if (error) {
                    vscode_1.window.showErrorMessage('Cannot remove the previous .gen ROM.');
                }
            });
            break;
        }
        // Collects all .pre<number> files
        const preFiles = files
            .filter(f => /\.pre\d+$/.test(f)) // Get .pre files (test() is to make the match happen)
            .map(f => ({
            name: f,
            index: parseInt(f.match(/\.pre(\d+)$/)[1]) // We have to capture the number with Regex using ()
        })); // Assigns a name and an index to it
        let number = 0; // Index
        // To handle the .pre0 corner case and skip useless operations, since it doesn't know with what number to start counting
        if (preFiles.length > 0) {
            const latest = Math.max(...preFiles.map(f => f.index));
            const oldest = preFiles.reduce((min, curr) => curr.index < min.index ? curr : min);
            if (latest < extensionSettings.prevAmount - 1 || extensionSettings.prevAmount === 0) {
                number = latest + 1;
            }
            else { // Enforce limit
                if (!extensionSettings.quietOperation) {
                    vscode_1.window.showInformationMessage(`Limit of previous ROMs reached. Replacing the oldest version "${oldest.name}".`);
                }
                (0, fs_1.unlink)(oldest.name, (error) => {
                    if (error) {
                        vscode_1.window.showErrorMessage('Unable to remove the oldest previous ROM.');
                    }
                });
                number = oldest.index; // Reuse the index
            }
        }
        // Cut the .gen extension and replace it with .preX
        const newName = checkName.substring(0, checkName.length - 4) + `.pre${number}`;
        (0, fs_1.rename)(checkName, newName, (error) => {
            if (error) {
                vscode_1.window.showWarningMessage(`Could not rename the previous ROM. Please, manually rename it to "${newName}".`);
            }
            else if (!extensionSettings.quietOperation) {
                vscode_1.window.showInformationMessage(`Latest build exists. Renamed to "${newName}".`);
            }
        });
        break;
    }
    renameRom(projectFolder, warnings);
}
function renameRom(projectFolder, warnings) {
    const currentDate = new Date();
    const hours = currentDate.getHours().toString().padStart(2, '0');
    const minutes = currentDate.getMinutes().toString().padStart(2, '0');
    const seconds = currentDate.getSeconds().toString().padStart(2, '0');
    let fileName;
    if (extensionSettings.romName !== '') {
        fileName = extensionSettings.romName;
    }
    else {
        const lastDot = extensionSettings.mainName.lastIndexOf('.');
        fileName = lastDot !== -1 ? extensionSettings.mainName.substring(0, lastDot) : extensionSettings.mainName;
    }
    if (extensionSettings.romDate) {
        fileName += `_${currentDate.getFullYear()}-${(currentDate.getMonth() + 1).toString().padStart(2, '0')}-${currentDate.getDate().toString().padStart(2, '0')}_${hours}.${minutes}.${seconds}`;
    }
    // Renames and moves the rom.bin file outside assemblerFolder since P2BIN doesn't have a switch to change the output file name for some reason
    (0, fs_1.rename)((0, path_1.join)(assemblerFolder, 'rom.bin'), `${(0, path_1.join)(projectFolder, fileName)}.gen`, (error) => {
        if (error) {
            if (error.code !== 'ENOENT') {
                vscode_1.window.showWarningMessage(`Could not rename your ROM, try to take it from "${assemblerFolder}" if it exists. ${error.message}`);
            }
            else {
                vscode_1.window.showErrorMessage('Cannot rename your ROM, there might be a problem with the compiler. ' + error.message);
            }
        }
    });
    if (!warnings) {
        if (extensionSettings.quietOperation) {
            return;
        }
        vscode_1.window.showInformationMessage(`Build succeded at ${hours}:${minutes}:${seconds}. (Hurray!)`);
    }
    else {
        vscode_1.window.showWarningMessage(`Build succeded with warnings at ${hours}:${minutes}:${seconds}.`, 'Show Terminal')
            .then(selection => {
            if (selection === 'Show Terminal') {
                outputChannel.show();
            }
        });
    }
}
async function findAndRunROM(emulator) {
    const projectFolders = vscode_1.workspace.workspaceFolders;
    if (!projectFolders) {
        vscode_1.window.showErrorMessage('You have no opened projects. Please, open a folder containing the correct structure.');
        return;
    }
    if (await promptEmulatorPath(emulator) === false) {
        return;
    }
    const projectFolder = projectFolders[0].uri.fsPath;
    process.chdir(projectFolder);
    const rom = (0, fs_1.readdirSync)('.').find(file => file.endsWith('.gen'));
    if (!rom) {
        vscode_1.window.showErrorMessage('There are no ROMs to run. Build something first.');
        return;
    }
    let errorCode = false;
    (0, child_process_1.exec)(`"${vscode_1.workspace.getConfiguration(`megaenvironment`).get(`paths.${emulator}`)}" "${(0, path_1.join)(projectFolder, rom)}"`, (error) => {
        if (error) {
            vscode_1.window.showErrorMessage('Cannot run the latest build. ' + error.message);
            errorCode = true;
            return;
        }
    });
    if (errorCode || extensionSettings.quietOperation) {
        return;
    }
    vscode_1.window.showInformationMessage(`Running "${rom}" with ${emulator}.`);
}
async function runTemporaryROM(emulator) {
    if (await assemblerChecks() === false) {
        return;
    }
    if (await promptEmulatorPath(emulator) === false) {
        return;
    }
    process.chdir(vscode_1.workspace.workspaceFolders[0].uri.fsPath);
    let warnings = false;
    switch (await executeAssemblyCommand()) {
        case 0:
            break;
        case 1:
            warnings = true;
            break;
        default:
            return;
    }
    let errorCode = false;
    (0, child_process_1.exec)(`"${vscode_1.workspace.getConfiguration(`megaenvironment`).get(`paths.${emulator}`)}" "${(0, path_1.join)(assemblerFolder, "rom.bin")}"`, (error) => {
        if (error) {
            vscode_1.window.showErrorMessage('Cannot run the build. ' + error.message);
            errorCode = true;
            return;
        }
        (0, fs_1.unlink)((0, path_1.join)(assemblerFolder, 'rom.bin'), (error) => {
            if (error) {
                vscode_1.window.showErrorMessage('Could not delete the temporary ROM for cleanup. You may want to do this by yourself. ' + error.message);
                return;
            }
        });
    });
    if (errorCode) {
        return;
    }
    const currentDate = new Date();
    if (!warnings) {
        if (extensionSettings.quietOperation) {
            return;
        }
        vscode_1.window.showInformationMessage(`Build succeded at ${currentDate.getHours().toString().padStart(2, '0')}:${currentDate.getMinutes().toString().padStart(2, '0')}:${currentDate.getSeconds().toString().padStart(2, '0')}, running it with ${emulator}. (Oh yes!)`);
    }
    else {
        vscode_1.window.showWarningMessage(`Build succeded with warnings at ${currentDate.getHours().toString().padStart(2, '0')}:${currentDate.getMinutes().toString().padStart(2, '0')}:${currentDate.getSeconds().toString().padStart(2, '0')}, running it with ${emulator}.`, 'Show Terminal')
            .then(selection => {
            if (selection === 'Show Terminal') {
                outputChannel.show();
            }
        });
    }
}
function cleanProjectFolder() {
    let items = 0;
    (0, fs_1.readdirSync)('.').forEach((item) => {
        const shouldDelete = extensionSettings.cleaningExtensions.some((ext) => {
            if (ext === '.pre') {
                return /\.pre\d+$/.test(item); // handles .pre0, .pre1, .pre999...
            }
            return item.endsWith(ext);
        });
        if (shouldDelete) {
            (0, fs_1.unlink)(item, (error) => {
                if (error) {
                    vscode_1.window.showErrorMessage(`The file ${item} was skipped because it couldn't be cleaned up.`);
                }
            });
            items++;
        }
    });
    if (extensionSettings.quietOperation) {
        return;
    }
    vscode_1.window.showInformationMessage(`Cleanup completed. ${items} items were removed.`);
}
// This method is called when the extension is activated
// An extension is activated the very first time the command is executed
async function activate(context) {
    assemblerFolder = context.globalStorageUri.fsPath;
    assemblerPath = (0, path_1.join)(assemblerFolder, 'asl');
    compilerPath = (0, path_1.join)(assemblerFolder, 'p2bin');
    if (process.platform === 'win32') {
        assemblerPath += '.exe';
        compilerPath += '.exe';
    }
    const config = vscode_1.workspace.getConfiguration('megaenvironment');
    for (const setting of settingDescriptors) {
        extensionSettings[setting.target] = config.get(setting.key);
    }
    extensionSettings.sonicDisassembly = config.get('buildControl.sonicDisassemblySupport', false);
    if (!downloadAssembler()) {
        return;
    }
    //
    //	Commands
    //
    const assemble = vscode_1.commands.registerCommand('megaenvironment.assemble', () => {
        assembleROM();
    });
    const clean_and_assemble = vscode_1.commands.registerCommand('megaenvironment.clean_assemble', async () => {
        const projectFolders = vscode_1.workspace.workspaceFolders;
        if (!projectFolders) {
            vscode_1.window.showErrorMessage('You have no opened projects. Please, open a folder containing the correct structure.');
            return;
        }
        const projectFolder = projectFolders[0].uri.fsPath; // Get the full path to the currently opened folder
        process.chdir(projectFolder);
        cleanProjectFolder();
        let warnings = false;
        switch (await executeAssemblyCommand()) {
            case 0:
                break;
            case 1:
                warnings = true;
                break;
            default:
                return;
        }
        renameRom(projectFolder, warnings);
    });
    const run_BlastEm = vscode_1.commands.registerCommand('megaenvironment.run_blastem', () => {
        findAndRunROM('BlastEm');
    });
    const run_Regen = vscode_1.commands.registerCommand('megaenvironment.run_regen', () => {
        const platform = process.platform;
        if (platform !== 'win32' && platform !== 'linux') {
            vscode_1.window.showErrorMessage('This command is not supported in your platform. Regen is only available for Windows and Linux, unfortunately.');
            return;
        }
        findAndRunROM('Regen');
    });
    const run_ClownMdEmu = vscode_1.commands.registerCommand('megaenvironment.run_clownmdemu', () => {
        const platform = process.platform;
        if (platform !== 'win32' && platform !== 'linux') {
            vscode_1.window.showErrorMessage('This command is not supported in your platform... but hold your horses! ClownMDEmu could be available for your platform if you use your web browser.', 'Visit Site')
                .then(selection => {
                if (selection === 'Visit Site') {
                    vscode_1.env.openExternal(vscode_1.Uri.parse('http://clownmdemu.clownacy.com/'));
                }
            });
            return;
        }
        findAndRunROM('ClownMDEmu');
    });
    const run_OpenEmu = vscode_1.commands.registerCommand('megaenvironment.run_openemu', () => {
        if (process.platform !== 'darwin') {
            vscode_1.window.showErrorMessage('This command is not supported in your platform. OpenEmu is only available for macOS, unfortunately.');
            return;
        }
        const projectFolders = vscode_1.workspace.workspaceFolders;
        if (!projectFolders) {
            vscode_1.window.showErrorMessage('You have no opened projects. Please, open a folder containing the correct structure.');
            return;
        }
        if (!(0, fs_1.existsSync)('/Applications/OpenEmu.app')) {
            vscode_1.window.showErrorMessage("Looks like you haven't installed OpenEmu yet. Make sure it's located in the \"\\Applications\" folder when installed, or else it won't run properly.");
            return;
        }
        const projectFolder = projectFolders[0].uri.fsPath;
        process.chdir(projectFolder);
        const rom = (0, fs_1.readdirSync)('.').find(file => file.endsWith('.gen'));
        if (!rom) {
            vscode_1.window.showErrorMessage('There are no ROMs to run. Build something first.');
            return;
        }
        let errorCode = false;
        (0, child_process_1.exec)(`open -a OpenEmu "${(0, path_1.join)(projectFolder, rom)}"`, (error) => {
            if (error) {
                vscode_1.window.showErrorMessage('Cannot run the latest build. ' + error.message);
                errorCode = true;
                return;
            }
        });
        if (errorCode || extensionSettings.quietOperation) {
            return;
        }
        vscode_1.window.showInformationMessage(`Running "${rom}" with OpenEmu.`);
    });
    const assemble_and_run_BlastEm = vscode_1.commands.registerCommand('megaenvironment.assemble_run_blastem', () => {
        runTemporaryROM('BlastEm');
    });
    const assemble_and_run_Regen = vscode_1.commands.registerCommand('megaenvironment.assemble_run_regen', () => {
        const platform = process.platform;
        if (platform !== 'win32' && platform !== 'linux') {
            vscode_1.window.showErrorMessage('This command is not supported in your platform. Regen is only available for Windows and Linux, unfortunately.');
            return;
        }
        runTemporaryROM('Regen');
    });
    const assemble_and_run_ClownMDEmu = vscode_1.commands.registerCommand('megaenvironment.assemble_run_clownmdemu', () => {
        const platform = process.platform;
        if (platform !== 'win32' && platform !== 'linux') {
            vscode_1.window.showErrorMessage('This command is not supported in your platform... but hold your horses! ClownMDEmu could be available for your platform if you use your web browser.', 'Visit Site')
                .then(selection => {
                if (selection === 'Visit Site') {
                    vscode_1.env.openExternal(vscode_1.Uri.parse('http://clownmdemu.clownacy.com/'));
                }
            });
            return;
        }
        runTemporaryROM('ClownMDEmu');
    });
    const assemble_and_run_OpenEmu = vscode_1.commands.registerCommand('megaenvironment.assemble_run_openemu', async () => {
        if (process.platform !== 'darwin') {
            vscode_1.window.showErrorMessage('This command is not supported in your platform. OpenEmu is only available for macOS, unfortunately.');
            return;
        }
        const projectFolders = vscode_1.workspace.workspaceFolders;
        if (!projectFolders) {
            vscode_1.window.showErrorMessage('You have no opened projects. Please, open a folder containing the correct structure.');
            return;
        }
        if (!(0, fs_1.existsSync)('/Applications/OpenEmu.app')) {
            vscode_1.window.showErrorMessage("Looks like you haven't installed OpenEmu yet. Make sure it's located in the \"\\Applications\" folder when installed, or else it won't run properly.");
            return;
        }
        if (await assemblerChecks() === false) {
            return;
        }
        process.chdir(projectFolders[0].uri.fsPath); // Already checked if "projectFolder" exists
        let warnings = false;
        switch (await executeAssemblyCommand()) {
            case 0:
                break;
            case 1:
                warnings = true;
                break;
            default:
                return;
        }
        const currentDate = new Date();
        const hours = currentDate.getHours().toString().padStart(2, '0');
        const minutes = currentDate.getMinutes().toString().padStart(2, '0');
        const seconds = currentDate.getSeconds().toString().padStart(2, '0');
        const romPath = (0, path_1.join)(assemblerFolder, `Temporary ROM at ${hours}:${minutes}:${seconds}.bin`);
        let shouldContinue = await new Promise((resolve) => {
            (0, fs_1.rename)((0, path_1.join)(assemblerFolder, 'rom.bin'), romPath, (error) => {
                if (error) {
                    vscode_1.window.showErrorMessage('Cannot rename the ROM for OpenEmu.');
                    resolve(false);
                }
                resolve(true);
            });
        });
        if (!shouldContinue) {
            return;
        }
        // "-W" switch is a macOS exclusive to wait for the app before exiting the shell command (to make "await" actually work)
        shouldContinue = await new Promise((resolve) => {
            (0, child_process_1.exec)(`open -a OpenEmu -W "${romPath}"`, (error) => {
                if (error) {
                    vscode_1.window.showErrorMessage('Cannot run the build. ' + error.message);
                    resolve(false);
                }
                resolve(true);
            });
        });
        if (!shouldContinue) {
            return;
        }
        (0, fs_1.unlink)((0, path_1.join)(assemblerFolder, 'rom.bin'), (error) => {
            if (error) {
                vscode_1.window.showErrorMessage('Could not delete the temporary ROM for cleanup. You may want to do this by yourself. ' + error.message);
                return;
            }
        });
        if (!warnings) {
            if (extensionSettings.quietOperation) {
                return;
            }
            vscode_1.window.showInformationMessage(`Build succeded at ${hours}:${minutes}:${seconds}, running it with OpenEmu. (Oh yes!)`);
        }
        else {
            vscode_1.window.showWarningMessage(`Build succeded with warnings at ${hours}:${minutes}:${seconds}, running it with OpenEmu.`, 'Show Terminal')
                .then(selection => {
                if (selection === 'Show Terminal') {
                    outputChannel.show();
                }
            });
        }
    });
    const open_EASy68k = vscode_1.commands.registerCommand('megaenvironment.open_easy68k', async () => {
        if (process.platform !== 'win32') {
            vscode_1.window.showErrorMessage('This command is not supported in your platform. EASy68k is only available for Windows, unfortunately.');
            return;
        }
        const projectFolders = vscode_1.workspace.workspaceFolders;
        if (!projectFolders) {
            vscode_1.window.showErrorMessage('You have no opened projects. Please, open a folder containing the correct structure.');
            return;
        }
        if (await promptEmulatorPath('EASy68k') === false) {
            return;
        }
        const editor = vscode_1.window.activeTextEditor;
        if (!editor) {
            vscode_1.window.showErrorMessage("Seems like you forgot to open any text editor.");
            return;
        }
        const projectFolder = projectFolders[0].uri.fsPath;
        const selectedText = editor.document.getText(editor.selection);
        process.chdir(assemblerFolder);
        let text;
        let constantsLocation = '';
        const constantsName = extensionSettings.constantsName;
        if (constantsName !== '') {
            constantsLocation = (0, path_1.join)(projectFolder, constantsName);
        }
        let variablesExists = false;
        let variablesLocation = '';
        const variablesName = extensionSettings.variablesName;
        if (variablesName !== '') {
            variablesLocation = (0, path_1.join)(projectFolder, variablesName);
            if ((0, fs_1.existsSync)(variablesLocation)) {
                variablesExists = true;
            }
        }
        if ((0, fs_1.existsSync)(constantsLocation)) {
            if (variablesExists) {
                text = `; Code\n\n\torg\t0\n\nstart:\n\n${selectedText}\n\n\tsimhalt\n\n\torg\t$FF0000\n\n; Variables\n\n${(0, fs_1.readFileSync)(variablesLocation, 'utf-8')}\n\n; Constants\n\n${(0, fs_1.readFileSync)(constantsLocation, 'utf-8')}\n\n\tend\tstart`;
            }
            else {
                text = `; Code\n\n\torg\t0\n\nstart:\n\n${selectedText}\n\n\tsimhalt\n\n; Constants\n\n${(0, fs_1.readFileSync)(constantsLocation, 'utf-8')}\n\n\torg\t$FF0000\n\n\tend\tstart`;
            }
        }
        else if (variablesExists) {
            text = `; Code\n\n\torg\t0\n\nstart:\n\n${selectedText}\n\n\tsimhalt\n\norg\t$FF0000\n\n; Variables${(0, fs_1.readFileSync)(variablesLocation, 'utf-8')}\n\n\tend\tstart`;
        }
        else {
            text = `; Code\n\n\torg\t0\n\nstart:\n\n${selectedText}\n\n\tsimhalt\n\n\tend\tstart`;
        }
        try {
            (0, fs_1.writeFileSync)('temp.txt', new TextEncoder().encode(text));
        }
        catch (error) {
            vscode_1.window.showErrorMessage('Unable to create file for testing. ' + error.message);
            return;
        }
        let errorCode = false;
        (0, child_process_1.exec)(`"${vscode_1.workspace.getConfiguration('megaenvironment').get('paths.EASy68k')}" "temp.txt"`, (error) => {
            if (error) {
                vscode_1.window.showErrorMessage('Cannot run EASy68k for testing. ' + error.message);
                errorCode = true;
            }
            (0, fs_1.readdirSync)(assemblerFolder).forEach((file) => {
                if (file !== assemblerPath && file !== compilerPath && file !== 'LICENSE.txt') {
                    (0, fs_1.unlink)(file, (error) => {
                        if (error) {
                            vscode_1.window.showWarningMessage(`Could not remove "${file}" for cleanup. You may want to do this by yourself. ${error.message}`);
                        }
                    });
                }
            });
        });
        if (errorCode || extensionSettings.quietOperation) {
            return;
        }
        vscode_1.window.showInformationMessage('Debugging your current selection with EASy68k.');
    });
    const backup = vscode_1.commands.registerCommand('megaenvironment.backup', () => {
        const projectFolders = vscode_1.workspace.workspaceFolders;
        if (!projectFolders) {
            vscode_1.window.showErrorMessage('You have no opened projects. Please, open a folder containing the correct structure.');
            return;
        }
        process.chdir(projectFolders[0].uri.fsPath); // Change current working folder to the project one
        const zip = new adm_zip_1.default(); // Create zip archive reference
        const items = (0, fs_1.readdirSync)('.'); // Read all content in the project folder
        if (!(0, fs_1.existsSync)('Backups')) {
            vscode_1.window.showInformationMessage('No "Backups" folder found. Fixing.');
            (0, fs_1.mkdirSync)('Backups');
        }
        else {
            items.splice(items.indexOf('Backups'), 1); // Remove Backups folder
        }
        let files = 0;
        items.forEach((item) => {
            zip.addLocalFile(item);
            if (extensionSettings.cleaningExtensions.some(v => item.includes(v))) {
                (0, fs_1.unlink)(item, (error) => {
                    if (error) {
                        vscode_1.window.showWarningMessage(`Could not remove "${item}" for cleanup. You may want to do this by yourself. ${error.message}`);
                    }
                });
            }
            files++;
        });
        const currentDate = new Date();
        const backupName = extensionSettings.backupName;
        let fileName = backupName === '' ? 'Backup' : backupName;
        if (extensionSettings.backupDate) {
            fileName += `_${currentDate.getFullYear()}-${(currentDate.getMonth() + 1).toString().padStart(2, '0')}-${currentDate.getDate().toString().padStart(2, '0')}_${currentDate.getHours().toString().padStart(2, '0')}.${currentDate.getMinutes().toString().padStart(2, '0')}.${currentDate.getSeconds().toString().padStart(2, '0')}`; // I am aware that this line is extraordinarily long
        }
        zip.writeZip((0, path_1.join)('Backups', `${fileName}.zip`));
        if (extensionSettings.quietOperation) {
            return;
        }
        vscode_1.window.showInformationMessage(`${files} files were backed up successfully.`);
    });
    const cleanup = vscode_1.commands.registerCommand('megaenvironment.cleanup', () => {
        const projectFolders = vscode_1.workspace.workspaceFolders;
        if (!projectFolders) {
            vscode_1.window.showErrorMessage('You have no opened projects. Please, open a folder containing the correct structure.');
            return;
        }
        process.chdir(projectFolders[0].uri.fsPath);
        cleanProjectFolder();
    });
    const newProject = vscode_1.commands.registerCommand('megaenvironment.new_project', async () => {
        const uri = await vscode_1.window.showOpenDialog({
            title: 'Select the folder for your new project',
            canSelectFolders: true,
            canSelectFiles: false,
            canSelectMany: false,
            openLabel: 'Select'
        });
        if (!uri || uri.length === 0) {
            return;
        }
        const projectPath = uri[0].fsPath;
        const extensions = ['.asm', '.68k', '.s', '.z80', ...extensionSettings.cleaningExtensions];
        const hasConflictingFiles = (0, fs_1.readdirSync)(projectPath).some(item => extensions.some(ext => item.endsWith(ext)));
        if (hasConflictingFiles) {
            const selection = await vscode_1.window.showWarningMessage('Looks like this folder already contains a project! If you continue, these files might be replaced. Do you wish to proceed?', 'Sure!', 'No, take me back');
            if (selection !== 'Sure!') {
                return;
            }
        }
        (0, fs_1.writeFile)((0, path_1.join)(projectPath, 'Main.asm'), strings.megaDriveHeader, (error) => {
            if (error) {
                vscode_1.window.showErrorMessage('Unable to create the main code source file.');
                return;
            }
        });
        (0, fs_1.writeFile)((0, path_1.join)(projectPath, 'Constants.asm'), strings.megaDriveConstants, (error) => {
            if (error) {
                vscode_1.window.showErrorMessage('Unable to create the constants source file.');
                return;
            }
        });
        (0, fs_1.writeFile)((0, path_1.join)(projectPath, 'Variables.asm'), strings.megaDriveVariables, (error) => {
            if (error) {
                vscode_1.window.showErrorMessage('Unable to create the variables source file.');
                return;
            }
        });
        (0, fs_1.mkdirSync)((0, path_1.join)(projectPath, 'Assets'), { recursive: true });
        (0, fs_1.mkdirSync)((0, path_1.join)(projectPath, '.vscode'), { recursive: true });
        (0, fs_1.writeFile)((0, path_1.join)(projectPath, '.vscode', 'settings.json'), strings.workspaceSettings, (error) => {
            if (error) {
                vscode_1.window.showErrorMessage('Unable to create the workspace settings file.');
                return;
            }
        });
        vscode_1.commands.executeCommand('vscode.openFolder', vscode_1.Uri.file(projectPath), true);
    });
    const redownloadTools = vscode_1.commands.registerCommand('megaenvironment.redownload_tools', async () => {
        if (isDownloading && !firstActivation) {
            vscode_1.window.showInformationMessage('Please, be patient! Your tools are already downloading.');
            return;
        }
        if (!extensionSettings.quietOperation) {
            vscode_1.window.showInformationMessage('Re-downloading your build tools...');
        }
        // Tools are effectively already downloading if we have started the extension with this command
        if (firstActivation) {
            return;
        }
        await downloadAssembler();
        if (extensionSettings.quietOperation) {
            return;
        }
        vscode_1.window.showInformationMessage('Build tools successfully re-downloaded.');
    });
    const generateConfiguration = vscode_1.commands.registerCommand('megaenvironment.generate_configuration', async () => {
        const projectFolders = vscode_1.workspace.workspaceFolders;
        if (!projectFolders) {
            vscode_1.window.showErrorMessage('Please, have an opened project to make it possible to write your configuration into it!');
            return;
        }
        const projectFolder = projectFolders[0].uri.fsPath;
        const vscodeFolder = (0, path_1.join)(projectFolder, '.vscode');
        if (!(0, fs_1.existsSync)(vscodeFolder)) {
            (0, fs_1.mkdirSync)(projectFolder);
        }
        let shouldContinue = true;
        if ((0, fs_1.existsSync)((0, path_1.join)(vscodeFolder, 'launch.json'))) {
            shouldContinue = await new Promise((resolve) => {
                vscode_1.window.showWarningMessage('\"launch.json\" is already present! Are you sure you want to overwrite it?', 'Yes', 'No')
                    .then((selection) => {
                    if (selection === 'Yes') {
                        resolve(true);
                    }
                    else {
                        resolve(false);
                    }
                });
            });
        }
        if (!shouldContinue) {
            return;
        }
        (0, fs_1.writeFileSync)((0, path_1.join)(vscodeFolder, 'launch.json'), strings.launchJson);
    });
    vscode_1.window.registerTreeDataProvider('run_emulator', new ButtonProvider());
    // Hacky way to get a somewhat-debugger integrated into VS Code
    vscode_1.debug.registerDebugConfigurationProvider('megaenvironment-nondebugger', {
        resolveDebugConfiguration() {
            vscode_1.commands.executeCommand('megaenvironment.open_easy68k');
            return undefined; // Prevent actual debug session
        }
    });
    context.subscriptions.push(assemble, clean_and_assemble, run_BlastEm, run_Regen, run_ClownMdEmu, run_OpenEmu, assemble_and_run_BlastEm, assemble_and_run_Regen, assemble_and_run_ClownMDEmu, assemble_and_run_ClownMDEmu, assemble_and_run_OpenEmu, backup, cleanup, open_EASy68k, newProject, redownloadTools, generateConfiguration);
}
vscode_1.workspace.onDidChangeConfiguration((event) => {
    if (event.affectsConfiguration('megaenvironment')) {
        const config = vscode_1.workspace.getConfiguration('megaenvironment');
        for (const setting of settingDescriptors) {
            const key = setting.key;
            if (event.affectsConfiguration(`megaenvironment.${key}`)) {
                extensionSettings[setting.target] = config.get(key);
            }
        }
        if (event.affectsConfiguration('megaenvironment.buildControl.sonicDisassemblySupport')) {
            extensionSettings.sonicDisassembly = config.get('buildControl.sonicDisassemblySupport', false);
            if (!extensionSettings.quietOperation) {
                vscode_1.window.showInformationMessage('Swapping versions...');
            }
            downloadAssembler();
        }
    }
});
class ButtonTreeItem extends vscode_1.TreeItem {
    label;
    command;
    constructor(label, command) {
        super(label, vscode_1.TreeItemCollapsibleState.None);
        this.label = label;
        this.command = command;
        this.iconPath = new vscode_1.ThemeIcon('play-circle');
    }
}
class ButtonProvider {
    getTreeItem(element) {
        return element;
    }
    getChildren() {
        return [
            new ButtonTreeItem('Run in BlastEm', {
                command: 'megaenvironment.run_blastem',
                title: 'Run in BlastEm',
                tooltip: 'Run lastest ROM (.gen) using BlastEm emulator'
            }),
            new ButtonTreeItem('Run in Regen', {
                command: 'megaenvironment.run_regen',
                title: 'Run in Regen',
                tooltip: 'Run lastest ROM (.gen) using Regen emulator'
            }),
            new ButtonTreeItem('Run in ClownMDEmu', {
                command: 'megaenvironment.run_clownmdemu',
                title: 'Run in ClownMDEmu',
                tooltip: 'Run lastest ROM (.gen) using ClownMDEmu emulator'
            }),
            new ButtonTreeItem('Run in OpenEmu', {
                command: 'megaenvironment.run_openemu',
                title: 'Run in OpenEmu',
                tooltip: 'Run lastest ROM (.gen) using OpenEmu emulator'
            })
        ];
    }
}
// Strings section
const strings = {
    workspaceSettings: String.raw `{
	"workbench.colorTheme": "MegaEnvironment Dark",
	"megaenvironment.sourceCodeControl.currentWorkingFolders": [
		"Assets"
	],
	"megaenvironment.sourceCodeControl.mainFileName": "Main.asm"
}`,
    launchJson: String.raw `{
	"version": "0.2.0",
	"configurations": [
		{
			"name": "Debug selection with EASy68k",
			"type": "megaenvironment-nondebugger", // Ignore the warnings, everything is fine
			"request": "launch"
		}
	]
}`,
    megaDriveHeader: String.raw `ROM_Start

	include "Constants.asm"
	include "Variables.asm"
	;include "ComplierMacros.asm"
	;include "CodeMacros.asm"

; 68000 vectors (with its error code in square brackets)
		dc.l M68K_STACK			; Initial stack pointer value (SP value)
		dc.l EntryPoint			; Start of program (PC value)
		dc.l BusError			; Bus error							[1]
		dc.l AddressError		; Address error						[2]
		dc.l IllegalInstruction	; Illegal instruction				[3]
		dc.l DivisionByZero		; Division by zero					[4]
		dc.l CHKException		; CHK exception						[5]
		dc.l TRAPVException		; TRAPV exception					[6]
		dc.l PrivilegeViolation	; Privilege violation				[7]
		dc.l TRACEException		; TRACE exception					[8]
		dc.l LineAEmulator		; Line-A emulator					[9]
		dc.l LineFEmulator		; Line-F emulator					[10]
		dc.l UnknownError		; Unused (reserved)					[14]
		dc.l UnknownError		; Unused (reserved)					[14]
		dc.l UnknownError		; Unused (reserved)					[14]
		dc.l UnknownError		; Unused (reserved)					[14]
		dc.l UnknownError		; Unused (reserved)					[14]
		dc.l UnknownError		; Unused (reserved)					[14]
		dc.l UnknownError		; Unused (reserved)					[14]
		dc.l UnknownError		; Unused (reserved)					[14]
		dc.l UnknownError		; Unused (reserved)					[14]
		dc.l UnknownError		; Unused (reserved)					[14]
		dc.l UnknownError		; Unused (reserved)					[14]
		dc.l UnknownError		; Unused (reserved)					[14]
		dc.l SpuriousException	; Spurious exception				[11]
		dc.l IRQLevel			; IRQ level 1						[12]
		dc.l IRQLevel			; IRQ level 2						[12]
		dc.l IRQLevel			; IRQ level 3 						[12]
		dc.l VDP_HBlank			; IRQ level 4 (horizontal retrace)
		dc.l IRQLevel			; IRQ level 5						[12]
		dc.l VDP_VBlank			; IRQ level 6 (vertical retrace)
		dc.l IRQLevel			; IRQ level 7						[12]
		dc.l TRAPException		; TRAP #00 exception				[13]
		dc.l TRAPException		; TRAP #01 exception				[13]
		dc.l TRAPException		; TRAP #02 exception				[13]
		dc.l TRAPException		; TRAP #03 exception				[13]
		dc.l TRAPException		; TRAP #04 exception				[13]
		dc.l TRAPException		; TRAP #05 exception				[13]
		dc.l TRAPException		; TRAP #06 exception				[13]
		dc.l TRAPException		; TRAP #07 exception				[13]
		dc.l TRAPException		; TRAP #08 exception				[13]
		dc.l TRAPException		; TRAP #09 exception				[13]
		dc.l TRAPException		; TRAP #10 exception				[13]
		dc.l TRAPException		; TRAP #11 exception				[13]
		dc.l TRAPException		; TRAP #12 exception				[13]
		dc.l TRAPException		; TRAP #13 exception				[13]
		dc.l TRAPException		; TRAP #14 exception				[13]
		dc.l TRAPException		; TRAP #15 exception				[13]
		dc.l UnknownError		; Unused (reserved)					[14]
		dc.l UnknownError		; Unused (reserved)					[14]
		dc.l UnknownError		; Unused (reserved)					[14]
		dc.l UnknownError		; Unused (reserved)					[14]
		dc.l UnknownError		; Unused (reserved)					[14]
		dc.l UnknownError		; Unused (reserved)					[14]
		dc.l UnknownError		; Unused (reserved)					[14]
		dc.l UnknownError		; Unused (reserved)					[14]
		dc.l UnknownError		; Unused (reserved)					[14]
		dc.l UnknownError		; Unused (reserved)					[14]
		dc.l UnknownError		; Unused (reserved)					[14]
		dc.l UnknownError		; Unused (reserved)					[14]
		dc.l UnknownError		; Unused (reserved)					[14]
		dc.l UnknownError		; Unused (reserved)					[14]
		dc.l UnknownError		; Unused (reserved)					[14]
		dc.l UnknownError		; Unused (reserved)					[14]

; Mega Drive ROM header (reference: https://plutiedev.com/rom-header)
		dc.b "                "	; System type (e.g. "SEGA MEGA DRIVE ") - 16 bytes
		dc.b "(C).... YYYY.MMM"	; Copyright, release year and month (e.g. "(C)SEGA 1991.APR") - 16 bytes
		dc.b "                                                "	; Domestic name - 48 bytes
		dc.b "                                                "	; Overseas name - 48 bytes
		dc.b "GM-12345678-00"		; Serial number ("xx-yyyyyyyy-zz") - 14 bytes
		dc.w $0000					; 16-bit checksum - 2 bytes
		dc.b "J               "		; Device support (e.g. "J" for 3-button controller) - 16 bytes
		dc.l ROM_Start				; Start address of ROM
		dc.l ROM_End				; End address of ROM
		dc.l $FF0000				; Start address of WRAM
		dc.l $FFFFFF 				; End address of WRAM
		dc.b "                                                                " ; padding for reserved space
		dc.b "JUE"					; Region support - 16 bytes
		dc.b "             "		; padding for reserved space (you can put a comment if you want!)

; Error handler jump table
BusError:
	move.l	#$AAAAAAA1,d7
	stop #$2700 ; some emulators might not recognize this instruction

AddressError:
	move.l	#$AAAAAAA2,d7
	stop #$2700

IllegalInstruction:
	move.l	#$AAAAAAA3,d7
	stop #$2700

DivisionByZero:
	move.l	#$AAAAAAA4,d7
	stop #$2700

CHKException:
	move.l	#$AAAAAAA5,d7
	stop #$2700

TRAPVException:
	move.l	#$AAAAAAA6,d7
	stop #$2700

PrivilegeViolation:
	move.l	#$AAAAAAA7,d7
	stop #$2700

TRACEException:
	move.l	#$AAAAAAA8,d7
	stop #$2700

LineAEmulator:
	move.l	#$AAAAAAA9,d7
	stop #$2700

LineFEmulator:
	move.l	#$AAAAAA10,d7
	stop #$2700

SpuriousException:
	move.l	#$AAAAAA11,d7
	stop #$2700

IRQLevel:
	move.l	#$AAAAAA12,d7
	stop #$2700

TRAPException:
	move.l	#$AAAAAA13,d7
	stop #$2700

UnknownError:
	move.l	#$AAAAAA14,d7
	stop #$2700

; ==========================

; Vertical interrupt
VDP_VBlank:
	rte

; Horizontal interrupt
VDP_HBlank:
	rte

; ==========================

EntryPoint:
	; your code goes here

	; your resources go here (from "Assets" folder)
ROM_End`,
    megaDriveConstants: String.raw `; M68K: Motorola 68000 related constant
; Z80: Z80 related constant
; JOYx: controller related constant
; EXP: expansion related constant
; VDP: VDP memory map related constant
; VDPREG: VDP register related constant
; PSG: PSG related constant
; YM2612: YM2612 related constant
; REG: miscellaneous Mega Drive register related constant
; SIZE: size of a memory space

; ---------------------------------
;		From: Motorola 68000
; ---------------------------------

; Mega Drive memory spaces
M68K_WRAM:	equ $FF0000		; 68000 memory start address
M68K_STACK:	equ $FFFFFF		; 68000 stack
JOY1_CTRL:	equ $A10009		; Controller 1 control port
JOY1_DATA:	equ $A10003   	; Controller 1 data port
JOY2_CTRL:	equ $A10005		; Controller 2 control port
JOY2_DATA:	equ $A1000B   	; Controller 2 data port
EXP_CTRL:	equ $A1000D		; Expansion control port
EXP_DATA:	equ $A10006		; Expansion data port

JOY1_SER_TRAN:	equ $A1000E		; Controller 1 serial transmit
JOY1_SER_REC:	equ $A10010		; Controller 1 serial receive
JOY1_SER_CTRL:	equ $A10012		; Controller 1 serial control
JOY2_SER_TRAN:	equ $A10014		; Controller 2 serial transmit
JOY2_SER_REC:	equ $A10016		; Controller 2 serial receive
JOY2_SER_CTRL:	equ $A10018		; Controller 2 serial control
EXP_SER_TRAN:	equ $A1001A		; Expansion serial transmit
EXP_SER_REC:	equ $A1001C		; Expansion serial receive
EXP_SER_CTRL:	equ $A1001E		; Expansion serial control

REG_SRAM:		equ $A130F1		; SRAM access register

REG_VERSION:	equ $A10001		; Version register
REG_MEMORYMODE:	equ $A11000		; Memory mode register

REG_TMSS:		equ $A14000		; TMSS "SEGA" register
REG_TMSS_CART:	equ $A14101		; TMSS cartridge register

REG_TIME:	equ $A13000		; TIME signal to cartridge ($00-$FF)
REG_32X		equ $A130EC		; Becomes "MARS" when a 32X is attached

; VDP memory addresses
VDP_DATA:    	equ $C00000		; VDP data port
VDP_CTRL:    	equ $C00004		; VDP control port and Status Register
VDP_HVCOUNTER:  equ $C00008		; H/V counter

VDP_VRAM:	equ	$40000000	; Video memory address control port
VDP_VSRAM:	equ $40000010	; Vertical scroll memory address control port
VDP_CRAM: 	equ $C0000000	; Color memory address control port

VDP_VRAM_DMA:   equ $40000080	; DMA VRAM control port
VDP_VSRAM_DMA:  equ $40000090	; DMA VSRAM control port
VDP_CRAM_DMA:   equ $C0000080	; DMA CRAM control port

PSG_OUT:	equ $C00011		; PSG output (or input)

VDP_DEBUG:	equ $C0001C		; Debug register

; VDP registers
VDPREG_MODE1:     equ $8000  ; Mode register #1
VDPREG_MODE2:     equ $8100  ; Mode register #2
VDPREG_MODE3:     equ $8B00  ; Mode register #3
VDPREG_MODE4:     equ $8C00  ; Mode register #4

VDPREG_PLANEA:    equ $8200  ; Plane A table address
VDPREG_PLANEB:    equ $8400  ; Plane B table address
VDPREG_SPRITE:    equ $8500  ; Sprite table address
VDPREG_WINDOW:    equ $8300  ; Window table address
VDPREG_HSCROLL:   equ $8D00  ; HScroll table address

VDPREG_SIZE:      equ $9000  ; Plane A and B size
VDPREG_WINX:      equ $9100  ; Window X split position
VDPREG_WINY:      equ $9200  ; Window Y split position
VDPREG_INCR:      equ $8F00  ; Autoincrement
VDPREG_BGCOL:     equ $8700  ; Background color
VDPREG_HRATE:     equ $8A00  ; HBlank interrupt rate

VDPREG_DMALEN_L:  equ $9300  ; DMA length (low)
VDPREG_DMALEN_H:  equ $9400  ; DMA length (high)
VDPREG_DMASRC_L:  equ $9500  ; DMA source (low)
VDPREG_DMASRC_M:  equ $9600  ; DMA source (mid)
VDPREG_DMASRC_H:  equ $9700  ; DMA source (high)

; VRAM management (you can change these)
VRAM_PLANEA:	equ $E000	; Plane A name table address
VRAM_PLANEB:	equ $FFFF	; Plane B name table address
VRAM_SPRITE:	equ $FFFF	; Sprite name table address
VRAM_WINDOW:	equ $FFFF	; Window plane name table address
VRAM_HSCROLL:	equ $FFFF	; Plane x coordinate

; Z80 control from 68000
Z80_WRAM:	equ $A00000  ; Z80 RAM start
Z80_BUSREQ:	equ $A11100  ; Z80 bus request line
Z80_RESET:	equ $A11200  ; Z80 reset line

; YM2612 memory addresses from 68000
YM2612_68K_CTRL0:	equ $A04000		; YM2612 bank 0 control port from 68000
YM2612_68K_DATA0:	equ $A04001		; YM2612 bank 0 data port from 68000
YM2612_68K_CTRL1:	equ $A04002		; YM2612 bank 1 control port from 68000
YM2612_68K_DATA1:	equ $A04003		; YM2612 bank 1 data port from 68000

; ----------------------------
;		From: Zilog Z80
; ----------------------------

; Z80 side addresses
Z80_STACK:	equ $2000

; YM2612 memory addresses from Z80
YM2612_CTRL0:	equ $4000		; YM2612 bank 0 control port
YM2612_DATA0:	equ $4001		; YM2612 bank 0 data port
YM2612_CTRL1:	equ $4002		; YM2612 bank 1 control port
YM2612_DATA1:	equ $4003		; YM2612 bank 1 data port


; --------------------------
;		Generic Labels
; --------------------------

; Various memory space sizes in bytes
SIZE_WRAM: 		equ 64000	; 68000 RAM size (64 KB)
SIZE_VRAM:		equ 64000	; VDP VRAM size (64 KB)
SIZE_VSRAM:		equ 80		; VDP vertical scroll RAM size (80 bytes)
SIZE_CRAM:		equ 128		; VDP color RAM size (128 bytes, 64 colors)
SIZE_Z80WRAM:	equ 8000	; Z80 RAM size (8 KB)

; VDP name table addresses
NOFLIP: equ $0000  ; Don't flip (default)
HFLIP:  equ $0800  ; Flip horizontally
VFLIP:  equ $1000  ; Flip vertically
HVFLIP: equ $1800  ; Flip both ways (180° flip)

PAL0:   equ $0000  ; Use palette 0 (default)
PAL1:   equ $2000  ; Use palette 1
PAL2:   equ $4000  ; Use palette 2
PAL3:   equ $6000  ; Use palette 3

LOPRI:  equ $0000  ; Low priority (default)
HIPRI:  equ $8000  ; High priority

; Controller labels
JOY_C:	equ 5
JOY_B:	equ 4
JOY_R:	equ 3
JOY_L:	equ 2
JOY_D:	equ 1
JOY_U:	equ 0

; YM2612 labels
LFO_ENABLE:		equ $22		; Enable Low Frequency Oscillator
TIMER_A_H:		equ $24		; Timer A frequency (high)
TIMER_A_L:		equ $25		; Timer A frequency (low)
TIMER_B:		equ $26		; Timer B frequency
CH3_TIMERCTRL:	equ $27		; Channel 3 Mode and Timer control
KEY_ON_OFF:		equ $28		; Key-on and Key-off
DAC_OUT:		equ $2A		; DAC output (or input)
DAC_ENABLE:		equ $2B		; DAC enable

CH1_4_OP1_MUL_DT:	equ $30		; Channel 1/4 operator 1 Multiply and Detune
CH1_4_OP2_MUL_DT:	equ $38		; Channel 1/4 operator 2 Multiply and Detune
CH1_4_OP3_MUL_DT:	equ $34		; Channel 1/4 operator 3 Multiply and Detune
CH1_4_OP4_MUL_DT:	equ $3C		; Channel 1/4 operator 4 Multiply and Detune

CH2_5_OP1_MUL_DT:	equ $31		; Channel 2/5 operator 1 Multiply and Detune
CH2_5_OP2_MUL_DT:	equ $39		; Channel 2/5 operator 2 Multiply and Detune
CH2_5_OP3_MUL_DT:	equ $35		; Channel 2/5 operator 3 Multiply and Detune
CH2_5_OP4_MUL_DT:	equ $3D		; Channel 2/5 operator 4 Multiply and Detune

CH3_6_OP1_MUL_DT:	equ $32		; Channel 3/6 operator 1 Multiply and Detune
CH3_6_OP2_MUL_DT:	equ $3A		; Channel 3/6 operator 2 Multiply and Detune
CH3_6_OP3_MUL_DT:	equ $36		; Channel 3/6 operator 3 Multiply and Detune
CH3_6_OP4_MUL_DT:	equ $3E		; Channel 3/6 operator 4 Multiply and Detune

CH1_4_OP1_TL:	equ $40		; Channel 1/4 operator 1 Total Level
CH1_4_OP2_TL:	equ $48		; Channel 1/4 operator 2 Total Level
CH1_4_OP3_TL:	equ $44		; Channel 1/4 operator 3 Total Level
CH1_4_OP4_TL:	equ $4C		; Channel 1/4 operator 4 Total Level

CH2_5_OP1_TL:	equ $41		; Channel 2/5 operator 1 Total Level
CH2_5_OP2_TL:	equ $49		; Channel 2/5 operator 2 Total Level
CH2_5_OP3_TL:	equ $45		; Channel 2/5 operator 3 Total Level
CH2_5_OP4_TL:	equ $4D		; Channel 2/5 operator 4 Total Level

CH3_6_OP1_TL:	equ $42		; Channel 3/6 operator 1 Total Level
CH3_6_OP2_TL:	equ $4A		; Channel 3/6 operator 2 Total Level
CH3_6_OP3_TL:	equ $46		; Channel 3/6 operator 3 Total Level
CH3_6_OP4_TL:	equ $4E		; Channel 3/6 operator 4 Total Level

CH1_4_OP1_AR_RS:	equ $50		; Channel 1/4 operator 1 Attack Rate and Rate Scaling
CH1_4_OP2_AR_RS:	equ $58		; Channel 1/4 operator 2 Attack Rate and Rate Scaling
CH1_4_OP3_AR_RS:	equ $54		; Channel 1/4 operator 3 Attack Rate and Rate Scaling
CH1_4_OP4_AR_RS:	equ $5C		; Channel 1/4 operator 4 Attack Rate and Rate Scaling

CH2_5_OP1_AR_RS:	equ $51		; Channel 2/5 operator 1 Attack Rate and Rate Scaling
CH2_5_OP2_AR_RS:	equ $59		; Channel 2/5 operator 2 Attack Rate and Rate Scaling
CH2_5_OP3_AR_RS:	equ $55		; Channel 2/5 operator 3 Attack Rate and Rate Scaling
CH2_5_OP4_AR_RS:	equ $5D		; Channel 2/5 operator 4 Attack Rate and Rate Scaling

CH3_6_OP1_AR_RS:	equ $52		; Channel 3/6 operator 1 Attack Rate and Rate Scaling
CH3_6_OP2_AR_RS:	equ $5A		; Channel 3/6 operator 2 Attack Rate and Rate Scaling
CH3_6_OP3_AR_RS:	equ $56		; Channel 3/6 operator 3 Attack Rate and Rate Scaling
CH3_6_OP4_AR_RS:	equ $5E		; Channel 3/6 operator 4 Attack Rate and Rate Scaling

CH1_4_OP1_DR_AM:	equ $60		; Channel 1/4 operator 1 Decay Rate and Amplitude Modulation enable
CH1_4_OP2_DR_AM:	equ $68		; Channel 1/4 operator 2 Decay Rate and Amplitude Modulation enable
CH1_4_OP3_DR_AM:	equ $64		; Channel 1/4 operator 3 Decay Rate and Amplitude Modulation enable
CH1_4_OP4_DR_AM:	equ $6C		; Channel 1/4 operator 4 Decay Rate and Amplitude Modulation enable

CH2_5_OP1_DR_AM:	equ $61		; Channel 2/5 operator 1 Decay Rate and Amplitude Modulation enable
CH2_5_OP2_DR_AM:	equ $69		; Channel 2/5 operator 2 Decay Rate and Amplitude Modulation enable
CH2_5_OP3_DR_AM:	equ $65		; Channel 2/5 operator 3 Decay Rate and Amplitude Modulation enable
CH2_5_OP4_DR_AM:	equ $6D		; Channel 2/5 operator 4 Decay Rate and Amplitude Modulation enable

CH3_6_OP1_DR_AM:	equ $62		; Channel 3/6 operator 1 Decay Rate and Amplitude Modulation enable
CH3_6_OP2_DR_AM:	equ $6A		; Channel 3/6 operator 2 Decay Rate and Amplitude Modulation enable
CH3_6_OP3_DR_AM:	equ $66		; Channel 3/6 operator 3 Decay Rate and Amplitude Modulation enable
CH3_6_OP4_DR_AM:	equ $6E		; Channel 3/6 operator 4 Decay Rate and Amplitude Modulation enable

CH1_4_OP1_SR:	equ $70		; Channel 1/4 operator 1 Sustain Rate
CH1_4_OP2_SR:	equ $78		; Channel 1/4 operator 2 Sustain Rate
CH1_4_OP3_SR:	equ $74		; Channel 1/4 operator 3 Sustain Rate
CH1_4_OP4_SR:	equ $7C		; Channel 1/4 operator 4 Sustain Rate

CH2_5_OP1_SR:	equ $71		; Channel 2/5 operator 1 Sustain Rate
CH2_5_OP2_SR:	equ $79		; Channel 2/5 operator 2 Sustain Rate
CH2_5_OP3_SR:	equ $75		; Channel 2/5 operator 3 Sustain Rate
CH2_5_OP4_SR:	equ $7D		; Channel 2/5 operator 4 Sustain Rate

CH3_6_OP1_SR:	equ $72		; Channel 3/6 operator 1 Sustain Rate
CH3_6_OP2_SR:	equ $7A		; Channel 3/6 operator 2 Sustain Rate
CH3_6_OP3_SR:	equ $76		; Channel 3/6 operator 3 Sustain Rate
CH3_6_OP4_SR:	equ $7E		; Channel 3/6 operator 4 Sustain Rate

CH1_4_OP1_RR_SL:	equ $80		; Channel 1/4 operator 1 Release Rate and Sustain Level
CH1_4_OP2_RR_SL:	equ $88		; Channel 1/4 operator 2 Release Rate and Sustain Level
CH1_4_OP3_RR_SL:	equ $84		; Channel 1/4 operator 3 Release Rate and Sustain Level
CH1_4_OP4_RR_SL:	equ $8C		; Channel 1/4 operator 4 Release Rate and Sustain Level

CH2_5_OP1_RR_SL:	equ $81		; Channel 2/5 operator 1 Release Rate and Sustain Level
CH2_5_OP2_RR_SL:	equ $89		; Channel 2/5 operator 2 Release Rate and Sustain Level
CH2_5_OP3_RR_SL:	equ $85		; Channel 2/5 operator 3 Release Rate and Sustain Level
CH2_5_OP4_RR_SL:	equ $8D		; Channel 2/5 operator 4 Release Rate and Sustain Level

CH3_6_OP1_RR_SL:	equ $82		; Channel 3/6 operator 1 Release Rate and Sustain Level
CH3_6_OP2_RR_SL:	equ $8A		; Channel 3/6 operator 2 Release Rate and Sustain Level
CH3_6_OP3_RR_SL:	equ $86		; Channel 3/6 operator 3 Release Rate and Sustain Level
CH3_6_OP4_RR_SL:	equ $8E		; Channel 3/6 operator 4 Release Rate and Sustain Level

CH1_4_OP1_SSG_EG:	equ $90		; Channel 1/4 operator 1 envelope shape
CH1_4_OP2_SSG_EG:	equ $98		; Channel 1/4 operator 2 envelope shape
CH1_4_OP3_SSG_EG:	equ $94		; Channel 1/4 operator 3 envelope shape
CH1_4_OP4_SSG_EG:	equ $9C		; Channel 1/4 operator 4 envelope shape

CH2_5_OP1_SSG_EG:	equ $91		; Channel 2/5 operator 1 envelope shape
CH2_5_OP2_SSG_EG:	equ $99		; Channel 2/5 operator 2 envelope shape
CH2_5_OP3_SSG_EG:	equ $95		; Channel 2/5 operator 3 envelope shape
CH2_5_OP4_SSG_EG:	equ $9D		; Channel 2/5 operator 4 envelope shape

CH3_6_OP1_SSG_EG:	equ $92		; Channel 3/6 operator 1 envelope shape
CH3_6_OP2_SSG_EG:	equ $9A		; Channel 3/6 operator 2 envelope shape
CH3_6_OP3_SSG_EG:	equ $96		; Channel 3/6 operator 3 envelope shape
CH3_6_OP4_SSG_EG:	equ $9E		; Channel 3/6 operator 4 envelope shape

CH1_4_FREQ_H:	equ $A4		; Channel 1/4 frequency (high)
CH2_5_FREQ_H:	equ $A5		; Channel 2/5 frequency (high)
CH3_6_FREQ_H:	equ $A6		; Channel 3/6 frequency (high)

CH1_4_FREQ_L:	equ $A0		; Channel 1/4 frequency (low)
CH2_5_FREQ_L:	equ $A1		; Channel 2/5 frequency (low)
CH3_6_FREQ_L:	equ $A2		; Channel 3/6 frequency (low)

CH3_OP1_FREQ_H:		equ $AD		; Channel 3 operator 1 frequency (high)
CH3_OP2_FREQ_H:		equ $AE		; Channel 3 operator 2 frequency (high)
CH3_OP3_FREQ_H:		equ $AC		; Channel 3 operator 3 frequency (high)
CH3_OP4_FREQ_H:		equ $A6		; Channel 3 operator 4 frequency (high)

CH3_OP1_FREQ_L:		equ $A9		; Channel 3 operator 1 frequency (low)
CH3_OP2_FREQ_L:		equ $AA		; Channel 3 operator 2 frequency (low)
CH3_OP3_FREQ_L:		equ $A8		; Channel 3 operator 3 frequency (low)
CH3_OP4_FREQ_L:		equ $A2		; Channel 3 operator 4 frequency (low)

CH1_4_ALG_FB:	equ $B0		; Channel 1/4 Algorithm and Feedback
CH2_5_ALG_FB:	equ $B1		; Channel 2/5 Algorithm and Feedback
CH3_6_ALG_FB:	equ $B2		; Channel 3/6 Algorithm and Feedback

CH1_4_PAN_PMS_AMS:	equ $B4		; Channel 1/4 Panning, Phase Modulation Sensitivity and Amplitude Modulation Sensitivity
CH2_5_PAN_PMS_AMS:	equ $B5		; Channel 2/5 Panning, Phase Modulation Sensitivity and Amplitude Modulation Sensitivity
CH3_6_PAN_PMS_AMS:	equ $B6		; Channel 3/6 Panning, Phase Modulation Sensitivity and Amplitude Modulation Sensitivity`,
    megaDriveVariables: String.raw `; --------------------------
;		Motorola 68000
; --------------------------

	org M68K_WRAM

; your 68000 variables go here

; ----------------------
;		Zilog Z80
; ----------------------

	org $1000	; away from code and stack

; your Z80 variables go here
`
};
//# sourceMappingURL=extension.js.map