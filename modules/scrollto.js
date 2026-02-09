export async function scrollTo(page, container, element){
	await new Promise(d=>setTimeout(d, 100));
	await page.evaluate(async (containerSelector, elementSelector) => {
		const container = document.querySelector(containerSelector||'body');
		const element = document.querySelector(elementSelector);
		if(container && element){
			element.scrollIntoView({ behavior: 'smooth', block: 'end' });
			await new Promise(d=>setTimeout(d, 100));
		}else if(container){
			container.scrollTo({
				top: container.scrollHeight,
				behavior: 'smooth'
			});
			await new Promise(d=>setTimeout(d, 100));
		}
	}, container, element);	
}