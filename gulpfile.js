const gulp = require('gulp');
const gutil = require('gulp-util');
const uglify = require('gulp-uglify');
const through2 = require('through2');
const React = require('react');
const ReactDomServer = require('react-dom/server');
const htmlmin = require('gulp-htmlmin');
const gulpBabel = require('gulp-babel');
const path = require('path');
const appConfig = require('./app-config.json');
const os = require('os');
const parallel = require('concurrent-transform');
const revertPath = require('gulp-revert-path');
const del = require('del');
const cssnano = require('gulp-cssnano');
const rename = require('gulp-rename');
const babelify = require('babelify');
const browserify = require('browserify');
const imageResize = require('gulp-image-resize');
const sass = require('gulp-sass');

const gulpSsh = require('gulp-ssh')({
	ignoreErrors: false,
	// set this from a config file
	sshConfig: require('./ssh-config.json')
});

const numberOfCpus = os.cpus().length;

const nodeModuleDir = path.join(__dirname, './node_modules');

const jsxToHtml = (options) =>
	through2.obj(function (file, enc, cb) {
		require('node-jsx').install({extension: '.jsx'});

		var component = require(file.path);
		component = component.default || component;
		console.log(component);
		const markup = '<!doctype html>' + ReactDomServer.renderToStaticMarkup(React.createElement(component, options));
		file.contents = new Buffer(markup);
		file.path = gutil.replaceExtension(file.path, '.html');

		this.push(file);

		cb();
	});

const hashDest = (dest, opts) =>
	through2.obj((file, enc, cb) => {
		opts = opts || {};

		dest[file.path.replace(file.base, '')] = opts.onStore ? opts.onStore(file.contents) : file.contents.toString(opts.enc || enc);
		cb();
	});

gulp.task('clean-build', (cb) => { del(['build']).then(() => cb()); });

gulp.task('build-css', [ 'clean-build' ],
	() => gulp.src('./app/index/index.scss')
		.pipe(sass({ includePaths: [nodeModuleDir] }).on('error', sass.logError))
		.pipe(cssnano())
		.pipe(gulp.dest('./build/public')));

gulp.task('build-svg', ['clean-build'],
	() =>
		gulp.src('./app/index/*.svg')
			.pipe(gulp.dest('build/public')));

gulp.task('project-images', () => {
	const destDir = './build/public/imgs/projects';
	return gulp.src('./projects/**/imgs/*')
			.pipe(parallel(
				imageResize({ height: 300 }),
				os.cpus().length
			))
			.pipe(gulp.dest(destDir));
});

gulp.task('slick-blobs', [ 'clean-build', 'project-images' ], () =>
	gulp.src([`${nodeModuleDir}/slick-carousel/slick/**/*.{woff,tff,gif,jpg,png}`]).pipe(gulp.dest('./build/public')));

gulp.task('client-js', ['clean-build', 'slick-blobs'], () =>
	gulp.src('app/**/*.client.{js,jsx}')
		.pipe(parallel(
			through2.obj((file, enc, next) =>
				browserify(file.path, { extensions: '.jsx', debug: false })
					.transform(babelify, { presets: [ 'es2015', 'react' ] })
					.bundle((err, res) => {
						if (err) console.log(err);
						// assumes file.contents is a Buffer
						else file.contents = res;

						next(null, file);
					})),
			numberOfCpus))
		.pipe(rename({
			dirname: '',
			extname: '.js'
		}))
		.pipe(parallel(uglify(), numberOfCpus))
		.pipe(gulp.dest('./build/public/js')));

const projectMarkdown = {};
gulp.task('store-project-markdown',
	() =>
		gulp
			.src(path.join(appConfig.projectsLocation, '*/features.md'))
			.pipe(hashDest(projectMarkdown)));

const projectData = {};
gulp.task('store-project-json', ['store-project-markdown'],
	() =>
		gulp
			.src(path.join(appConfig.projectsLocation, 'projects.json'))
			.pipe(hashDest(projectData, {
				onStore: (data) => {
					const projects = JSON.parse(data);
					projects.forEach((project) => {
						project.features = projectMarkdown[project.name + '/features.md'];
					});

					return projects;
				}
			})));

gulp.task('build-server-js', ['clean-build'],
	() =>
		gulp
			.src([ './app/**/*.jsx' ])
			.pipe(parallel(gulpBabel({ presets: [ 'es2015', 'react', '@niftyco/babel-node' ] }), numberOfCpus))
			.pipe(revertPath())
			.pipe(parallel(uglify(), numberOfCpus))
			.pipe(gulp.dest('build')));

gulp.task('build-static', ['build-server-js', 'store-project-json', 'build-css', 'build-svg'],
	() =>
		gulp
			.src('./build/index/index.jsx')
			.pipe(jsxToHtml({projects: projectData['projects.json'] || []}))
			.pipe(htmlmin())
			.pipe(gulp.dest('./build/public')));

gulp.task('build', [ 'build-static', 'client-js' ]);

gulp.task('watch', ['build'], () => {
	gulp.watch('./app/**/*.{jsx,css,svg}', ['build-static']);
});

gulp.task('publish', ['build-static'],
	() =>
		gulp
			.src(['./build/**/*', './package.json'])
			.pipe(gulpSsh.dest('/home/protected/app')));
