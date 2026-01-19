import readline from 'node:readline';

export const rl = readline.createInterface({
	input: process.stdin,
	output: process.stdout,
});

export const prompt = question => new Promise(resolve => {
	rl.question(question, resolve);
});

export const writeOverLine = message => {
	readline.clearLine(process.stdout); 
	readline.cursorTo(process.stdout, 0);
	process.stdout.write(message)
};