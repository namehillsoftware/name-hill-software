import { html, head, meta, link, title, body, div, img, p, h1 } from 'react-hyperscript-helpers';
import ProjectList from './project/project-list';

const index = (props) => {
	const header = 'Name Hill Software';

	return html('.no-js', [
			head([
				meta({httpEquiv: 'Content-Type', content: 'text/html; charset=ISO-8859-1'}),
				meta({httpEquiv: 'X-UA-Compatible', content: 'IE=Edge'}),
				meta({name: 'viewport', content: 'width=device-width, initial-scale=1'}),
				link({href: 'index.css', type: 'text/css', rel: 'stylesheet'}),
				title(header)
			]),
			body([
				div('#banner', [
					img({src: 'hill-landscape.svg'}),
					h1('Name Hill Software') ]),
				div(ProjectList({projects: props.projects})),
				div('#image-credits', [
					p('Image Created by Markus Költringer'),
					p('from the Noun Project')
				])
			])
		]);
};

export default index;
