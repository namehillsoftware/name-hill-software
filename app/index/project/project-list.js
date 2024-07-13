import pkg from 'react-hyperscript-helpers';
const { script } = pkg;

import ProjectDetails from './project-details/project-details.js';

export default (props) =>
	props.projects.map((project) => ProjectDetails({ project: project }))
		.concat([ script({ type: 'text/javascript', src: 'js/project.client.js' }) ]);
