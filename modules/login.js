
import 'dotenv/config';
import { prompt } from './prompt.js';

export async function wgu_login(page){

	await page.goto('https://my.wgu.edu/');
	await page.waitForSelector('#login-username');

	const envUsername = process.env.WGU_USERNAME?.trim();
	let username = envUsername && envUsername.length > 0
		? envUsername
		: await prompt("Enter your WGU Username: ");
	const username_input = await page.$('#login-username');
	await username_input.type(username, {delay: 100});

	const envPassword = process.env.WGU_PASSWORD?.trim();
	let password = envPassword && envPassword.length > 0
		? envPassword
		: await prompt("Enter your WGU Password: ");
	const password_input = await page.$('#login-password');
	await password_input.type(password, {delay: 100});

	const login_button = await page.$('#signOnButton');
	await login_button.click();

	await page.waitForNavigation();

	const firstResolved = await Promise.race([
		page.waitForSelector('div.setup-mfa #skipMfa').then(() => 'mfa-skip'),
		page.waitForSelector('.tile-button__title').then(() => 'mfa-tile'),
	]);

	switch (firstResolved) {
		case 'mfa-skip':
			const skip_mfa_button = await page.$('div.setup-mfa #skipMfa');
			await skip_mfa_button.click();
			break;

		case 'mfa-tile':
			const mfa_buttons = await page.$$('.tile-button__title');
			const mfa_button_texts = await Promise.all(mfa_buttons.map(btn => btn.evaluate(el => el.innerText.trim())));
		
			// Determine the MFA method to use
			let mfa_method, mfa_button_index;
			if(mfa_button_texts.length === 1){
				mfa_button_index = 0;
				if(mfa_button_texts[0].toLowerCase().includes('text')){
					mfa_method = 'text';
				} else if(mfa_button_texts[0].toLowerCase().includes('authenticator')){
					mfa_method = 'app';
				} else{
					throw new Error('No supported login options found.');
				}
			}else{
				let preferred_mfa_method = process.env.DEFAULT_MFA_METHOD?.trim().toLowerCase();
				if(preferred_mfa_method){
					for(let index=0; index<mfa_button_texts.length; index++){
						if(preferred_mfa_method === 'text'){
							if(mfa_button_texts[index].toLowerCase().includes('text')){
								mfa_button_index = index;
								mfa_method = 'text';
								break;
							}
						}else if(preferred_mfa_method === 'app'){
							if(mfa_button_texts[index].toLowerCase().includes('authenticator')){
								mfa_button_index = index;
								mfa_method = 'app';
								break;
							}	
						}else break;
					}
					if(!mfa_method) console.log("Preferred MFA method not found.");
				}

				if(!mfa_method){

					let choice, tries = 0;
					while(true){
						tries++;

						if(tries > 3){
							throw new Error("Too many invalid attempts.");
						}

						console.log("Which MFA method would you like to use?");
						mfa_button_texts.forEach((text, index) => console.log(`${index+1}: ${text}`));
						choice = await prompt("Enter a number: ");
						if(!/^\d+$/.test(choice.trim())){
							console.log("Invalid input. Please enter a number.");
							continue;
						}

						const index = parseInt(choice.trim(), 10) - 1;
						if(index < 0 || index >= mfa_button_texts.length){
							console.log("Invalid choice. Please enter a valid number.");
							continue;
						}

						if(mfa_button_texts[index].toLowerCase().includes('text')){
							mfa_button_index = index;
							mfa_method = 'text';
							break;
						}else if(mfa_button_texts[index].toLowerCase().includes('authenticator')){
							mfa_button_index = index;
							mfa_method = 'app';
							break;
						}else{
							console.log("This option is not currently supported. Try another option.");
							continue;
						}

					}
				}
			}

			console.log(`Selected MFA method: ${mfa_button_texts[mfa_button_index]}`);

			if(mfa_method === 'app'){
				await mfa_buttons[mfa_button_index].click();
				await page.waitForNavigation();
				console.log("Authenticate with your WGU app to continue.");
				let t = new Date().getTime();
				let max_time = t + 30000;
				while(true){
					if(new Date().getTime() > max_time){
						throw new Error("MFA timeout.");
					}
					let url = await page.url();
					if(url.includes('my.wgu.edu/home')){
						break;
					}
					await new Promise(resolve => setTimeout(resolve, 1000));
				}
			}else if(mfa_method === 'text'){
				await mfa_buttons[mfa_button_index].click();
				await page.waitForNavigation();
				await page.waitForSelector('#passcode');

				let tries = 0;
				while(true){
					tries++;
					if(tries > 3){
						throw new Error("Too many invalid attempts.");
					}

					let code = await prompt("Enter the 6 digit code sent to your phone: ");
					code = code.replace(/\D/g, '');
					if(code.length !== 6){
						console.log("Invalid code.");
						continue;
					}

					const passcode_input = await page.$('#passcode');
					await passcode_input.type(code, {delay: 100});
					await new Promise(d=>setTimeout(d, 1000));

					const login_button = await page.$('#sign-on');
					await login_button.evaluate(el => el.scrollIntoView({ behavior: 'smooth', block: 'end' }));

					// Scroll to the bottom of the page
					await page.evaluate(async () => {
						window.scrollTo({
							top: document.querySelector('.app-container').scrollHeight,
							behavior: 'smooth'
						});
						await new Promise(d=>setTimeout(d, 1000));
					});

					await new Promise(resolve => setTimeout(resolve, 1000));
					await Promise.all([
						page.waitForNavigation(),
						login_button.click()
					]);

					let t = new Date().getTime();
					let max_time = t + 30000;
					while(true){
						if(new Date().getTime() > max_time){
							throw new Error("Invalid MFA code.");
						}
						let url = await page.url();
						if(url.includes('my.wgu.edu/home')){
							return;
						}
						await new Promise(resolve => setTimeout(resolve, 1000));
					}
				}
			}else{
				throw new Error('Unsupported MFA method.');
			}
			break;

		default:
			throw new Error('Invalid login.');
	}

}