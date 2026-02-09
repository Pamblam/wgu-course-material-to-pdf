export async function load_course(page) {
	let url = await page.url();
	if(!url.includes('my.wgu.edu/home')){
		await Promise.race([
			page.waitForNavigation(),
			page.goto('https://my.wgu.edu/home')
		]);
	}

	await page.waitForSelector('li.home-course');
	
	let titles = await page.evaluate(() => {
		const courseItems = [...document.querySelectorAll('li.home-course')];
		return courseItems.map(item => {
			let title = item.querySelector('.margin--right--10.text--bold').innerText.trim();
			return title;
		});
	});
	
	let n = 1;
	if(titles.length > 1){
		console.log(`Which course do you want to convert to PDF?`);
		for(let i=0; i<titles.length; i++){
			console.log(` ${i+1}) ${titles[i]}`);
		}
		n = await prompt("Enter the number of the course: ");
	}

	let course_url = await page.evaluate((index) => {
		return document.querySelectorAll('wgu-submit-button')[index].parentElement.href;
	}, n-1);

	await Promise.all([
		page.goto(course_url),
		page.waitForNavigation(),
		page.waitForSelector('.mdc-button__label>.learning-btn')
	]);

	return titles[n-1];
}