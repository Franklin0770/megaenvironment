"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode = __importStar(require("vscode"));
const child_process_1 = require("child_process");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
let project_folder;
const file_name = "Sonic.asm";
function executeProgram(command) {
    try {
        console.log((0, child_process_1.execSync)(command, { encoding: 'utf-8' }));
    }
    catch (error) {
        console.log("Assembler cannot be executed.\n" + error);
    }
}
// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
function activate(context) {
    // The command has been defined in the package.json file
    // Now provide the implementation of the command with registerCommand
    // The commandId parameter must match the command field in package.json
    const assemble = vscode.commands.registerCommand('megaenvironment.assemble', () => {
        if (vscode.workspace.workspaceFolders) {
            project_folder = vscode.workspace.workspaceFolders[0].uri.fsPath;
            process.chdir(path.join(project_folder, "build_tools"));
            if (fs.existsSync(path.join("..", file_name))) {
                if (fs.existsSync(path.join("..", "build_tools"))) {
                    if (fs.existsSync("asl.exe")) {
                        if (!fs.existsSync("p2bin.exe")) {
                            vscode.window.showErrorMessage("\"p2bin.exe\" compiler is missing. It should be included in \"build_tools\".");
                            return;
                        }
                    }
                    else {
                        vscode.window.showErrorMessage("\"asl.exe\" assembler is missing. It should be included in \"build_tools\".");
                        return;
                    }
                }
                else {
                    vscode.window.showErrorMessage("\"build_tools\" folder not present. You should include this folder with its files.");
                    return;
                }
            }
            else {
                vscode.window.showErrorMessage("You are missing the main source code. Name it to \"" + file_name + "\".");
                return;
            }
        }
        else {
            vscode.window.showErrorMessage("You have no opened projects. Please, open a folder containing the correct structure.");
            return;
        }
        executeProgram("asl.exe ..\\" + file_name + " /x /o rom.p /olist ..\\code.log -ALU");
        executeProgram("p2bin.exe rom.p -k");
        if (!fs.existsSync("rom.p")) {
            fs.renameSync("..\\code.log", "..\\error.log");
            vscode.window.showErrorMessage("Build failed. Check the terminal or error.log for more details.");
            return;
        }
        const current_date = new Date();
        fs.renameSync("rom.bin", `..\\Sonic ${current_date.getFullYear()}_${(current_date.getMonth() + 1).toString().padStart(2, '0')}_${current_date.getDate().toString().padStart(2, '0')} ${current_date.getHours().toString().padStart(2, '0')}.${current_date.getMinutes().toString().padStart(2, '0')}.${current_date.getSeconds().toString().padStart(2, '0')}.gen`);
    });
    const run = vscode.commands.registerCommand('megaenvironment.run', () => {
        if (vscode.workspace.workspaceFolders) {
            process.chdir(project_folder);
            if (!fs.existsSync("*.gen")) {
                vscode.window.showErrorMessage("There are no ROMs to run. Build something first.");
                return;
            }
        }
        else {
            vscode.window.showErrorMessage("You have no opened projects. Please, open a folder containing the correct structure.");
            return;
        }
        executeProgram("start " + project_folder + " $BlastEm");
    });
    context.subscriptions.push(assemble, run);
}
// This method is called when your extension is deactivated
// export function deactivate() {}
//# sourceMappingURL=extension.js.map