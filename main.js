import puppeteer from 'puppeteer';
import { prompt } from './modules/prompt.js';
import fs from 'fs';
import { PDFDocument } from 'pdf-lib';

// Set to false if you want to see the browser actions.
const headless = true;

const browser = await puppeteer.launch({headless});
const page = await browser.newPage();

// Login to WGU
await page.goto('https://my.wgu.edu/');
await page.waitForSelector('#login-username');

let username = await prompt("Enter your WGU Username: ");
const username_input = await page.$('#login-username');
await username_input.type(username, {delay: 100});

let password = await prompt("Enter your WGU Password: ");
const password_input = await page.$('#login-password');
await password_input.type(password, {delay: 100});

const login_button = await page.$('#signOnButton');
await login_button.click();

// Assumes no MFA Setup.. may need to handle that in the future.
await page.waitForNavigation();
await page.waitForSelector('div.setup-mfa #skipMfa');

const skip_mfa_button = await page.$('div.setup-mfa #skipMfa');
await skip_mfa_button.click();

// Get list of active courses
await page.waitForNavigation();
await page.waitForSelector('li.home-course');

let titles = await page.evaluate(() => {
	const courseItems = [...document.querySelectorAll('li.home-course')];
	return courseItems.map(item => {
		let title = item.querySelector('.margin--right--10.text--bold').innerText.trim();
		return title;
	});
});

console.log(`Which course do you want to convert to PDF?`);
for(let i=0; i<titles.length; i++){
	console.log(` ${i+1}) ${titles[i]}`);
}
let n = await prompt("Enter the number of the course: ");

const courseButtons = await page.$$('wgu-submit-button');
const course_button = courseButtons[n - 1];
const course_title = titles[n - 1];

if (!course_button) throw new Error(`No course button found for selection ${n}`);

const [newPage] = await Promise.all([
	browser.waitForTarget(t => t.opener() === page.target()).then(t => t.page()),
	course_button.click()
]);

await newPage.waitForNavigation();
await newPage.waitForSelector(`.mdc-button__label>.learning-btn`);

const course_material_btn = await newPage.$('.mdc-button__label>.learning-btn');

await course_material_btn.click();

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
	
	await materialPage.waitForSelector('.next-button');
	await new Promise(r => setTimeout(r, 3000));
	const next_btn = await materialPage.$('.next-button');

	await materialPage.pdf({ path: `page_${cnt}.pdf`, format: 'A4' });
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
