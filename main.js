import 'dotenv/config';
import puppeteer from 'puppeteer';
import { prompt } from './modules/prompt.js';
import { wgu_login } from './modules/login.js';
import { load_course } from './modules/load_course.js';
import fs from 'fs';
import { PDFDocument } from 'pdf-lib';
import { title } from 'process';


const debug_mode = process.env.DEBUG_MODE?.toLowerCase() === 'true';

const browser = await puppeteer.launch({headless: !debug_mode});
const page = await browser.newPage();

try {
	await wgu_login(page);
	if(debug_mode) console.log("Login successful.");
} catch (error) {
	console.error(error);
	await browser.close();
	process.exit(1);
}

let course_title;
try {
	course_title = await load_course(page);
	if(debug_mode) console.log("Course loaded successfully.");
} catch (error) {
	console.error(error);
	await browser.close();
	process.exit(1);
}

console.log('Loading course material...');

// Load the course material page
let material_url = await page.evaluate(() => {
	return document.querySelector('.mdc-button__label>.learning-btn').href;
});

console.log('material_url', material_url);

await Promise.all([
	page.goto(material_url),
	page.waitForNavigation()
]);

await new Promise(r => setTimeout(r, 5000));

const pages = await browser.pages();
let materialPage = await Promise.any(
	pages.map(p => p.evaluate(() => document.hasFocus()).then(f => f && p))
);
if(!materialPage) materialPage = pages[pages.length - 1];

console.log(`Navigating to the beginning of the course material...`);

while(true){
	await materialPage.waitForSelector('.previous-button');
	await new Promise(r => setTimeout(r, 1000));
	const prev_btn = await materialPage.$('.previous-button');
	const isDisabled = await prev_btn.evaluate((btn) => btn.hasAttribute('disabled'));
	if(isDisabled) break;
	await prev_btn.click();
	await materialPage.waitForNavigation();
}

console.log('starting PDF generation...');

let cnt = 0;
let files = [];
while(true){
	cnt++;
	
	console.log(`Processing page ${cnt}...`);

	await materialPage.waitForSelector('.next-button');
	await new Promise(r => setTimeout(r, 3000));
	const next_btn = await materialPage.$('.next-button');

	await materialPage.emulateMediaType('print');
	await materialPage.addStyleTag({ content: `
		.sequence-container > div:first-child { display: none !important; }
		footer, .text-right.small.py-1 { display: none !important; }
		.sequence { min-height: 0 !important; }
		* {
			page-break-before: avoid !important;
			page-break-after: avoid !important;
			page-break-inside: avoid !important;
			break-before: avoid !important;
			break-after: avoid !important;
			break-inside: avoid !important;
		}
	` });
	await materialPage.evaluate(() => document.fonts && document.fonts.ready);
	await new Promise(r => setTimeout(r, 300));
	const contentHeight = await materialPage.evaluate(() => {
		return Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
	});

	await materialPage.addStyleTag({ content: `
		@page { size: 816px ${contentHeight + 40}px; margin: 0 !important; }
	` });

	await materialPage.pdf({
		path: `page_${cnt}.pdf`,
		width: '816px',
		height: `${contentHeight + 40}px`,
		printBackground: true,
		margin: { top: 0, right: 0, bottom: 0, left: 0 }
	});
	files.push(`page_${cnt}.pdf`);

	const isDisabled = await next_btn.evaluate((btn) => btn.hasAttribute('disabled'));
	if(isDisabled) break;

	await next_btn.click();
	await materialPage.waitForNavigation();
}

const merged = await PDFDocument.create();

for (const file of files) {
	const pdf = await PDFDocument.load(fs.readFileSync(file));
	const pages = await merged.copyPages(pdf, pdf.getPageIndices());
	pages.forEach(p => merged.addPage(p));
}

fs.writeFileSync(course_title.replaceAll(/\s/g, '_') + '.pdf', await merged.save());

await browser.close();

console.log('done.');
process.exit(0);
