# What does this thing do?
It's a Visual Studio Code extension developed to integrate a command-like UI with [The Macro Assembler AS](http://john.ccac.rwth-aachen.de:8000/as/).  
The purpose of this extension is primarily for Sega Mega Drive homebrew development.  

## What it can do
You can:
- Assemble files and produce a ROM output in various ways;
- Some basic versioning, useful for producing multiple builds and be able to distinguish between them;
- Shortcuts to manage and organise your project folder;
- Speaking of versioning and file management, you can also backup your project quickly;
- Run ROMs with mostly Windows emulators (you need to set a system variable for this!);
- Utilise nearly every option available of the assembler, using the UI-friendly settings screen of VS Code;
- Avoid to include build tools or such, the extension downloads the necessary files to compile.

![Commands](https://github.com/Franklin0770/megaenvironment/blob/7c263f7abbba2ad60a2f4aee0b7401921f504891/papers/Commands.png)

## What you need to install this
First of all, make sure you have [Node.js](https://nodejs.org/) installed. [Git](https://git-scm.com) is recommended if you want to clone this repository.  

Then, after installing Node, you must install [Adm-Zip](https://www.npmjs.com/package/adm-zip), a file zipper required for the extension to make backups:
```
npm install adm-zip
```
Since Node needs this package's node module, you'll want to issue this command as well:
```
cd megaenvironment
npm i --save-dev @types/adm-zip
```
## What doesn't work (for now)
I'm aware this extension isn't made for ROM hacking (especially after trying out Sonic disassemblies). The assembler throws errors related to addresses, values that overflow and macro definitions (maybe it's time to build without the -ffast-math C flag).
## Some screenshots (so you get the idea)
![Settings1](https://github.com/Franklin0770/megaenvironment/blob/7c263f7abbba2ad60a2f4aee0b7401921f504891/papers/Settings%201.png)
![Settings2](https://github.com/Franklin0770/megaenvironment/blob/1bfb0b5f63f4f5ebdb4827a75a474070b098f609/papers/Settings%202.png)
![Assembly1](https://github.com/Franklin0770/megaenvironment/blob/7c263f7abbba2ad60a2f4aee0b7401921f504891/papers/Assembly%201.png)
![Assembly2](https://github.com/Franklin0770/megaenvironment/blob/7c263f7abbba2ad60a2f4aee0b7401921f504891/papers/Assembly%202.png)
## The Credits Section
The assembler and compiler: http://john.ccac.rwth-aachen.de:8000/as/  
How I learnt to make this extension: https://code.visualstudio.com/api/get-started/your-first-extension  
This is were the files are downloaded from: https://github.com/Franklin0770/AS-releases.git
