import { existsSync, promises } from 'fs';
import { join, basename, relative } from 'path';
import { workspace, Progress } from 'vscode';

export default class PcmProcessing {
	private static sampleRate: number;

	private static downsampleS16ToU8(data: Buffer): Uint8Array {
		const convertedData = new Uint8Array(data.length / 2); // length / bytesPerSample

		for (let i = 0, j = 0; i < data.length; i += 2, j++) {
			const sample16 = data.readInt16LE(i);

			// Rounding toward nearest integer (8 = bitDepth - 8)
			convertedData[j] = ((sample16 + (sample16 >= 0 ? 128 : -128)) >> 8) + 128;

			// Paranoid clamp that is probably not needed
			//convertedData[j] = Math.max(0, Math.min(255, rounded));
		}

		return convertedData;
	}

	private static downsampleS24ToU8(data: Buffer): Uint8Array {
		const convertedData = new Uint8Array(data.length / 3); // length / bytesPerSample

		for (let i = 0, j = 0; i < data.length; i += 3, j++) {
			// Node doesn't have readInt24LE, so we combine manually
			let sample24 = data[i] | (data[i+1] << 8) | (data[i+2] << 16);
			if (sample24 & 0x800000) { sample24 |= 0xFF000000; } // Sign extend

			// Rounding toward nearest integer
			convertedData[j] = ((sample24 + (sample24 >= 0 ? 128 : -128)) >> 16) + 128;
		}

		return convertedData;
	}

	private static downmixToMono(data: Uint8Array): Uint8Array {
		const convertedData = new Uint8Array(data.length / 2);

		for (let i = 0, j = 0; i < data.length; i += 2, j++) {
			convertedData[j] = (data[i] + data[i+1]) >> 1; // Bit shits round well
		}

		return convertedData;
	}

	private static convertFileToPcmData(file: Buffer<ArrayBuffer>): Uint8Array {
		const view = new DataView(file.buffer);

		const audioFormat = view.getUint16(20, true);
	 	const numChannels = view.getUint16(22, true);
		PcmProcessing.sampleRate = view.getUint32(24, true);
		const bitDepth = view.getUint16(34, true);
		const dataSize = view.getUint16(40, true);

		if (new TextDecoder().decode(file.subarray(0, 4)) !== 'RIFF') {
			throw new Error('Non-traditional header is being used, cannot get data from it');
		}

		if (new TextDecoder().decode(file.subarray(8, 12)) !== 'WAVE') {
			throw new Error('Only WAVE format is supported');
		}

		if (audioFormat !== 1) {
			throw new Error('Only PCM format is supported, no compression please');
		}

		if (numChannels > 2) {
			throw new Error('Only mono or stereo tracks are supported');
		}

		if (PcmProcessing.sampleRate > 32000) {
			throw new Error('The YM2612 supports up to 32 kHz sample rate, yours is higher');
		}

		if (bitDepth !== 8 && bitDepth !== 16 && bitDepth !== 24) {
			throw new Error('Only 8-bit, 16-bit and 24-bit formats are supported');
		}

		if (new TextDecoder().decode(file.subarray(36, 40)) !== 'data') {
			throw new Error('Invalid WAV data format');
		}

		if (numChannels === 2 && dataSize % 2 !== 0) {
			throw new Error('Stereo data must be even');
		}

		let data: Uint8Array;

		if (bitDepth !== 8) {
			data = bitDepth === 16
				? PcmProcessing.downsampleS16ToU8(file.subarray(44))
				: PcmProcessing.downsampleS24ToU8(file.subarray(44));
		} else {
			data = new Uint8Array(file.subarray(44) as Buffer<ArrayBuffer>);
		}

		if (numChannels === 2) {
			data = PcmProcessing.downmixToMono(data);
		}

		return data;
	}

	// Repurposed code from https://github.com/sonicretro/s1disasm/blob/AS/build_tools/lua/common.lua
	private static convertPcmToAdpcm(samples: Uint8Array, deltasFile: Uint8Array): Uint8Array {
		const output: number[] = [];
		const deltas = new Int8Array(deltasFile);

		let previous = 0x80;
		let accumulator = 0;
		let flipFlop = false;

		for (let i = 0; i < samples.length; i++) {
			let bestError = Infinity; // Let the first comparison trigger
			let bestIndex = 0;

			// Find the delta that best approximates the next sample
			for (let deltaIndex = 0; deltaIndex < deltas.length; deltaIndex++) {
				const approximated = (previous + deltas[deltaIndex]) & 0xFF;

				const error = Math.abs(samples[i] - approximated);
				if (error < bestError) { // This is always true for the first time
					bestError = error; // Remember the current most precise delta
					bestIndex = deltaIndex; // Get its position
				}
			}

			previous = (previous + deltas[bestIndex]) & 0xFF; // Apply the best delta
			accumulator = (accumulator << 4) | bestIndex; // Pack the nibble

			if (flipFlop) {
				output.push(accumulator & 0xFF);
				accumulator = 0;
			}

			flipFlop = !flipFlop; // Every 2 samples, write a byte
		}

		if (flipFlop) { output.push((accumulator << 4) & 0xFF); }

		return new Uint8Array(output);
	}

	public async generateAudioFiles(progress: Progress<{ message?: string; increment?: number }>) {
		progress.report({ message: 'Converting audio files...', increment: 5 });

		const projectFolder = workspace.workspaceFolders![0].uri.fsPath;
		const pcmFolder = join(projectFolder, join('sound', 'dac', 'pcm'));
		const dpcmFolder = join(projectFolder, join('sound', 'dac', 'dpcm'));

		const pcmWavFiles = (await workspace.findFiles('sound/dac/pcm/*.wav')).map(uri => relative(pcmFolder, uri.fsPath));
		const dpcmWavFiles = (await workspace.findFiles('sound/dac/dpcm/*.wav')).map(uri => relative(dpcmFolder, uri.fsPath));

		const incrementValue = 25 / (pcmWavFiles.length + dpcmWavFiles.length);

		await Promise.all(pcmWavFiles.map(async fileName => {
			progress.report({ increment: incrementValue });

			const file = await promises.readFile(join(pcmFolder, fileName));
			const pcmData = PcmProcessing.convertFileToPcmData(file);

			const baseName = basename(fileName, '.wav');
			const generatedFolder = join(pcmFolder, 'generated');
			const pcmPath = join(generatedFolder, baseName + '.pcm');

			const incFile = String.raw
`; Auto generated with MegaEnvironment

.sample_rate = ${PcmProcessing.sampleRate}
.size = ${pcmData.length}
	binclude "${relative(projectFolder, pcmPath)}"`;

			await promises.writeFile(join(generatedFolder, baseName + '.inc'), incFile);
			await promises.writeFile(pcmPath, pcmData);
		}));

		const deltasPath = join(dpcmFolder, 'deltas.bin');

		let deltas: Uint8Array;

		if (existsSync(deltasPath)) {
			deltas = await promises.readFile(deltasPath);
		} else {
			deltas = new Uint8Array([ 0x00, 0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80, 0xFF, 0xFE, 0xFC, 0xF8, 0xF0, 0xE0, 0xC0 ]);
		}

		await Promise.all(dpcmWavFiles.map(async fileName => {
			progress.report({ increment: incrementValue });

			const file = await promises.readFile(join(dpcmFolder, fileName));
			const pcmData = PcmProcessing.convertFileToPcmData(file);
			const dpcmData = PcmProcessing.convertPcmToAdpcm(pcmData, deltas);

			const baseName = basename(fileName, '.wav');
			const generatedFolder = join(dpcmFolder, 'generated');
			const dpcmPath = join(generatedFolder, baseName + '.dpcm');

			const incFile = String.raw
`; Auto generated with MegaEnvironment

.sample_rate = ${PcmProcessing.sampleRate}
.size = ${dpcmData.length}
	binclude "${relative(projectFolder, dpcmPath)}"`;

			await promises.writeFile(join(generatedFolder, baseName + '.inc'), incFile);
			await promises.writeFile(dpcmPath, dpcmData);
		}));
	}
}