import { script } from 'react-hyperscript-helpers';
import ProjectDetails from './project-details/project-details.jsx';

export default (props) =>
	props.projects.map((project) => ProjectDetails({ project: project }))
		.concat([ script({ type: 'text/javascript', src: 'js/project.client.js' }) ]);
